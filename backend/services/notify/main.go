// Notify service: saved searches and in-app notifications.
// It consumes listing events from NATS and pushes live events to users
// over NATS core (subject events.user.<id>), which the chat service relays to WebSockets.
package main

import (
	"context"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"log/slog"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"

	"kup/pkg/clients"
	"kup/pkg/config"
	"kup/pkg/db"
	"kup/pkg/events"
	"kup/pkg/httpx"
	"kup/pkg/i18n"
)

//go:embed migrations/*.sql
var migrations embed.FS

const maxSaved = 50

type server struct {
	db          *pgxpool.Pool
	catalog     *clients.Catalog
	users       *clients.Users
	nc          *nats.Conn
	listingsURL string
	http        *http.Client

	mu       sync.Mutex
	matchers map[string]*matcher // saved search id -> compiled request
}

func must(err error, what string) {
	if err != nil {
		slog.Error(what, "err", err)
		os.Exit(1)
	}
}

func main() {
	httpx.SetupLogger("notify")
	ctx := context.Background()
	pool, err := db.Connect(ctx, config.MustString("DATABASE_URL"))
	must(err, "db")
	sub, _ := fs.Sub(migrations, "migrations")
	must(db.Migrate(ctx, pool, sub), "migrate")
	nc, js, err := events.Connect(ctx, config.String("NATS_URL", "nats://nats:4222"))
	must(err, "nats")
	defer nc.Close()

	s := &server{
		db: pool, nc: nc, matchers: map[string]*matcher{},
		catalog:     clients.NewCatalog(config.String("CATALOG_URL", "http://catalog:8082")),
		users:       clients.NewUsers(config.String("AUTH_URL", "http://auth:8081")),
		listingsURL: config.String("LISTINGS_URL", "http://listings:8083"),
		http:        &http.Client{Timeout: 10 * time.Second},
	}
	go s.consume(ctx, js)
	go s.cleanupLoop(ctx)

	r := httpx.NewRouter()
	r.Method("GET", "/v1/me/saved-searches", httpx.Handler(s.listSaved))
	r.Method("POST", "/v1/me/saved-searches", httpx.Handler(s.createSaved))
	r.Method("PATCH", "/v1/me/saved-searches/{id}", httpx.Handler(s.updateSaved))
	r.Method("DELETE", "/v1/me/saved-searches/{id}", httpx.Handler(s.deleteSaved))
	r.Method("POST", "/v1/me/saved-searches/{id}/seen", httpx.Handler(s.seenSaved))
	r.Method("GET", "/v1/me/notifications", httpx.Handler(s.listNotifications))
	r.Method("POST", "/v1/me/notifications/read", httpx.Handler(s.readNotifications))
	r.Method("GET", "/v1/me/notifications/unread-count", httpx.Handler(s.unreadCount))
	httpx.Serve(config.String("ADDR", ":8085"), r)
}

// ---------- saved searches ----------

type savedSearch struct {
	ID        string        `json:"id"`
	Name      string        `json:"name"`
	Request   searchRequest `json:"request"`
	Notify    bool          `json:"notify"`
	NewCount  int           `json:"new_count"`
	CreatedAt time.Time     `json:"created_at"`
}

const savedCols = `s.id, s.name, s.request, s.notify, s.created_at,
	(SELECT count(*) FROM notifications n WHERE n.saved_search_id = s.id AND n.read_at IS NULL)`

func scanSaved(row pgx.Row) (*savedSearch, error) {
	var v savedSearch
	var raw []byte
	if err := row.Scan(&v.ID, &v.Name, &raw, &v.Notify, &v.CreatedAt, &v.NewCount); err != nil {
		return nil, err
	}
	if err := json.Unmarshal(raw, &v.Request); err != nil {
		return nil, err
	}
	if v.Request.Filters == nil {
		v.Request.Filters = map[string]map[string]json.RawMessage{}
	}
	return &v, nil
}

func (s *server) getSaved(ctx context.Context, uid, id string) (*savedSearch, error) {
	if _, err := uuid.Parse(id); err != nil {
		return nil, httpx.NotFound()
	}
	v, err := scanSaved(s.db.QueryRow(ctx, `SELECT `+savedCols+` FROM saved_searches s WHERE s.id=$1 AND s.user_id=$2`, id, uid))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, httpx.NotFound()
	}
	return v, err
}

func (s *server) listSaved(w http.ResponseWriter, r *http.Request) error {
	uid, err := httpx.RequireUser(r)
	if err != nil {
		return err
	}
	rows, err := s.db.Query(r.Context(), `SELECT `+savedCols+` FROM saved_searches s WHERE s.user_id=$1 ORDER BY s.created_at DESC`, uid)
	if err != nil {
		return err
	}
	defer rows.Close()
	items := []*savedSearch{}
	for rows.Next() {
		v, err := scanSaved(rows)
		if err != nil {
			return err
		}
		items = append(items, v)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	httpx.JSON(w, 200, map[string]any{"items": items})
	return nil
}

func (s *server) createSaved(w http.ResponseWriter, r *http.Request) error {
	uid, err := httpx.RequireUser(r)
	if err != nil {
		return err
	}
	lang := i18n.FromRequest(r)
	var in struct {
		Name    *string       `json:"name"`
		Request searchRequest `json:"request"`
		Notify  *bool         `json:"notify"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	sc, err := s.catalog.Schema(r.Context(), in.Request.Category, string(lang))
	if errors.Is(err, clients.ErrNotFound) {
		return httpx.Err(400, "bad_request", "category_unknown")
	}
	if err != nil {
		return err
	}
	in.Request.Query = strings.TrimSpace(in.Request.Query)
	if len([]rune(in.Request.Query)) > 200 {
		return httpx.Err(400, "bad_request", "query_long")
	}
	if _, err := compile(in.Request, sc); err != nil {
		return filterErr(err)
	}
	name := sc.Name
	if in.Request.Query != "" {
		name += " «" + in.Request.Query + "»"
	}
	if in.Name != nil && strings.TrimSpace(*in.Name) != "" {
		name = strings.TrimSpace(*in.Name)
	}
	if len([]rune(name)) > 100 {
		name = string([]rune(name)[:100])
	}
	notify := in.Notify == nil || *in.Notify
	req, _ := json.Marshal(in.Request)

	var n int
	if err := s.db.QueryRow(r.Context(), `SELECT count(*) FROM saved_searches WHERE user_id=$1`, uid).Scan(&n); err != nil {
		return err
	}
	if n >= maxSaved {
		return httpx.Err(400, "limit_reached", "saved_limit")
	}
	id := uuid.NewString()
	if _, err := s.db.Exec(r.Context(), `INSERT INTO saved_searches(id, user_id, name, category, request, notify) VALUES ($1,$2,$3,$4,$5,$6)`,
		id, uid, name, sc.Category, req, notify); err != nil {
		return err
	}
	v, err := s.getSaved(r.Context(), uid, id)
	if err != nil {
		return err
	}
	httpx.JSON(w, 201, v)
	return nil
}

func filterErr(err error) error {
	var fe *filterError
	if errors.As(err, &fe) {
		if fe.reason == "unknown" {
			return httpx.Err(400, "bad_request", "filter_unknown", fe.key)
		}
		return httpx.Err(400, "bad_request", "filter_bad", fe.key, fe.reason)
	}
	return err
}

func (s *server) updateSaved(w http.ResponseWriter, r *http.Request) error {
	uid, err := httpx.RequireUser(r)
	if err != nil {
		return err
	}
	id := chi.URLParam(r, "id")
	if _, err := s.getSaved(r.Context(), uid, id); err != nil {
		return err
	}
	var in struct {
		Name   *string `json:"name"`
		Notify *bool   `json:"notify"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	var name *string
	if in.Name != nil {
		n := strings.TrimSpace(*in.Name)
		if l := len([]rune(n)); l < 1 || l > 100 {
			return httpx.Validation(map[string]string{"name": i18n.T(i18n.FromRequest(r), "text_200")})
		}
		name = &n
	}
	if _, err := s.db.Exec(r.Context(), `UPDATE saved_searches SET name=COALESCE($1,name), notify=COALESCE($2,notify) WHERE id=$3 AND user_id=$4`,
		name, in.Notify, id, uid); err != nil {
		return err
	}
	v, err := s.getSaved(r.Context(), uid, id)
	if err != nil {
		return err
	}
	httpx.JSON(w, 200, v)
	return nil
}

func (s *server) deleteSaved(w http.ResponseWriter, r *http.Request) error {
	uid, err := httpx.RequireUser(r)
	if err != nil {
		return err
	}
	id := chi.URLParam(r, "id")
	if _, err := uuid.Parse(id); err != nil {
		return httpx.NotFound()
	}
	tag, err := s.db.Exec(r.Context(), `DELETE FROM saved_searches WHERE id=$1 AND user_id=$2`, id, uid)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return httpx.NotFound()
	}
	s.mu.Lock()
	delete(s.matchers, id)
	s.mu.Unlock()
	w.WriteHeader(204)
	return nil
}

func (s *server) seenSaved(w http.ResponseWriter, r *http.Request) error {
	uid, err := httpx.RequireUser(r)
	if err != nil {
		return err
	}
	id := chi.URLParam(r, "id")
	if _, err := s.getSaved(r.Context(), uid, id); err != nil {
		return err
	}
	if _, err := s.db.Exec(r.Context(), `UPDATE notifications SET read_at=now() WHERE saved_search_id=$1 AND user_id=$2 AND read_at IS NULL`, id, uid); err != nil {
		return err
	}
	w.WriteHeader(204)
	return nil
}

// ---------- notifications ----------

type notification struct {
	ID            string    `json:"id"`
	Type          string    `json:"type"`
	Title         string    `json:"title"`
	Body          string    `json:"body"`
	Image         *string   `json:"image"`
	ListingID     string    `json:"listing_id"`
	SavedSearchID *string   `json:"saved_search_id"`
	CreatedAt     time.Time `json:"created_at"`
	Read          bool      `json:"read"`
}

func (s *server) listNotifications(w http.ResponseWriter, r *http.Request) error {
	uid, err := httpx.RequireUser(r)
	if err != nil {
		return err
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	args := []any{uid, limit}
	where := "user_id=$1"
	if b := r.URL.Query().Get("before"); b != "" {
		if _, err := uuid.Parse(b); err != nil {
			return httpx.BadRequest("before")
		}
		where += " AND (created_at, id) < (SELECT created_at, id FROM notifications WHERE id=$3)"
		args = append(args, b)
	}
	rows, err := s.db.Query(r.Context(), `SELECT id, type, title, body, image, listing_id, saved_search_id, created_at, read_at IS NOT NULL
		FROM notifications WHERE `+where+` ORDER BY created_at DESC, id DESC LIMIT $2`, args...)
	if err != nil {
		return err
	}
	defer rows.Close()
	items := []notification{}
	for rows.Next() {
		var n notification
		if err := rows.Scan(&n.ID, &n.Type, &n.Title, &n.Body, &n.Image, &n.ListingID, &n.SavedSearchID, &n.CreatedAt, &n.Read); err != nil {
			return err
		}
		items = append(items, n)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	unread, err := s.unread(r.Context(), uid)
	if err != nil {
		return err
	}
	httpx.JSON(w, 200, map[string]any{"items": items, "unread_count": unread})
	return nil
}

func (s *server) unread(ctx context.Context, uid string) (int, error) {
	var n int
	err := s.db.QueryRow(ctx, `SELECT count(*) FROM notifications WHERE user_id=$1 AND read_at IS NULL`, uid).Scan(&n)
	return n, err
}

func (s *server) unreadCount(w http.ResponseWriter, r *http.Request) error {
	uid, err := httpx.RequireUser(r)
	if err != nil {
		return err
	}
	n, err := s.unread(r.Context(), uid)
	if err != nil {
		return err
	}
	httpx.JSON(w, 200, map[string]int{"count": n})
	return nil
}

func (s *server) readNotifications(w http.ResponseWriter, r *http.Request) error {
	uid, err := httpx.RequireUser(r)
	if err != nil {
		return err
	}
	var in struct {
		IDs []string `json:"ids"`
	}
	if r.ContentLength != 0 {
		if err := httpx.Decode(r, &in); err != nil {
			return err
		}
	}
	if in.IDs == nil {
		_, err = s.db.Exec(r.Context(), `UPDATE notifications SET read_at=now() WHERE user_id=$1 AND read_at IS NULL`, uid)
	} else {
		for _, id := range in.IDs {
			if _, err := uuid.Parse(id); err != nil {
				return httpx.BadRequest("ids")
			}
		}
		_, err = s.db.Exec(r.Context(), `UPDATE notifications SET read_at=now() WHERE user_id=$1 AND id = ANY($2::uuid[]) AND read_at IS NULL`, uid, in.IDs)
	}
	if err != nil {
		return err
	}
	w.WriteHeader(204)
	return nil
}

// ---------- event consumer ----------

func (s *server) consume(ctx context.Context, js jetstream.JetStream) {
	cons, err := js.CreateOrUpdateConsumer(ctx, events.StreamListings, jetstream.ConsumerConfig{
		Durable: events.ConsumerNotify, AckPolicy: jetstream.AckExplicitPolicy, AckWait: time.Minute, MaxDeliver: 10,
		FilterSubjects: []string{events.SubjectPublished, events.SubjectPriceDropped},
		// Only events from now on: a fresh consumer must not notify about old listings.
		DeliverPolicy: jetstream.DeliverNewPolicy,
	})
	must(err, "create consumer")
	slog.Info("notify consumer started")
	for ctx.Err() == nil {
		batch, err := cons.Fetch(50, jetstream.FetchMaxWait(2*time.Second))
		if err != nil {
			slog.Warn("fetch", "err", err)
			time.Sleep(time.Second)
			continue
		}
		for m := range batch.Messages() {
			var err error
			switch m.Subject() {
			case events.SubjectPublished:
				var d events.ListingDoc
				if err = json.Unmarshal(m.Data(), &d); err == nil {
					err = s.onPublished(ctx, &d)
				}
			case events.SubjectPriceDropped:
				var e events.PriceDropped
				if err = json.Unmarshal(m.Data(), &e); err == nil {
					err = s.onPriceDropped(ctx, &e)
				}
			}
			if err != nil {
				slog.Error("handle event", "subject", m.Subject(), "err", err)
				_ = m.NakWithDelay(10 * time.Second)
				continue
			}
			_ = m.Ack()
		}
	}
}

func (s *server) matcherFor(ctx context.Context, id string, raw []byte) (*matcher, error) {
	s.mu.Lock()
	m := s.matchers[id]
	s.mu.Unlock()
	if m != nil {
		return m, nil
	}
	var req searchRequest
	if err := json.Unmarshal(raw, &req); err != nil {
		return nil, err
	}
	sc, err := s.catalog.Schema(ctx, req.Category, string(i18n.Default))
	if err != nil {
		return nil, err
	}
	if m, err = compile(req, sc); err != nil {
		return nil, err
	}
	s.mu.Lock()
	s.matchers[id] = m
	s.mu.Unlock()
	return m, nil
}

// cardLine is "Škoda Octavia, 2019 — 350 000 Kč" in the user's language.
func cardLine(d *events.ListingDoc, lang i18n.Lang) string {
	t := d.Pick(string(lang))
	line := t.Title + " — " + i18n.Price(d.Price, d.Currency)
	if t.PriceSuffix != "" {
		line += " " + t.PriceSuffix
	}
	return line
}

func photo(d *events.ListingDoc) *string {
	if len(d.Photos) == 0 {
		return nil
	}
	return &d.Photos[0]
}

func (s *server) langOf(ctx context.Context, uid string) i18n.Lang {
	u, err := s.users.Get(ctx, uid)
	if err != nil || !i18n.Valid(u.Lang) {
		return i18n.Default
	}
	return i18n.Lang(u.Lang)
}

func (s *server) onPublished(ctx context.Context, d *events.ListingDoc) error {
	rows, err := s.db.Query(ctx, `SELECT id, user_id, name, request FROM saved_searches WHERE category=$1 AND notify AND user_id <> $2`,
		d.Category, d.UserID)
	if err != nil {
		return err
	}
	type hit struct{ id, uid, name string }
	var hits []hit
	for rows.Next() {
		var h hit
		var raw []byte
		if err := rows.Scan(&h.id, &h.uid, &h.name, &raw); err != nil {
			rows.Close()
			return err
		}
		m, err := s.matcherFor(ctx, h.id, raw)
		if err != nil {
			slog.Warn("saved search no longer valid", "id", h.id, "err", err)
			continue
		}
		if m.match(d) {
			hits = append(hits, h)
		}
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	for _, h := range hits {
		lang := s.langOf(ctx, h.uid)
		ssID := h.id
		n := notification{Type: "saved_search", Title: i18n.T(lang, "notif_new_title", h.name), Body: cardLine(d, lang),
			Image: photo(d), ListingID: d.ID, SavedSearchID: &ssID}
		if err := s.insert(ctx, h.uid, n, "ss:"+h.id+":"+d.ID); err != nil {
			return err
		}
	}
	if len(hits) > 0 {
		slog.Info("saved search matches", "listing", d.ID, "n", len(hits))
	}
	return nil
}

func (s *server) onPriceDropped(ctx context.Context, e *events.PriceDropped) error {
	var res struct {
		UserIDs []string `json:"user_ids"`
	}
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, s.listingsURL+"/internal/favorites/users?listing_id="+e.Listing.ID, nil)
	resp, err := s.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return fmt.Errorf("favorites users: %d", resp.StatusCode)
	}
	if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
		return err
	}
	d := &e.Listing
	for _, uid := range res.UserIDs {
		if uid == d.UserID {
			continue
		}
		lang := s.langOf(ctx, uid)
		body := i18n.T(lang, "notif_drop_body", d.Pick(string(lang)).Title, i18n.Price(e.OldPrice, d.Currency), i18n.Price(d.Price, d.Currency))
		n := notification{Type: "price_drop", Title: i18n.T(lang, "notif_drop_title"), Body: body, Image: photo(d), ListingID: d.ID}
		if err := s.insert(ctx, uid, n, fmt.Sprintf("pd:%s:%d:%s", d.ID, d.Price, uid)); err != nil {
			return err
		}
	}
	return nil
}

// insert stores a notification once (dedupe key) and pushes it to the user's open sockets.
func (s *server) insert(ctx context.Context, uid string, n notification, key string) error {
	n.ID = uuid.NewString()
	err := s.db.QueryRow(ctx, `INSERT INTO notifications(id, user_id, type, title, body, image, listing_id, saved_search_id, dedupe_key)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (dedupe_key) DO NOTHING RETURNING created_at`,
		n.ID, uid, n.Type, n.Title, n.Body, n.Image, n.ListingID, n.SavedSearchID, key).Scan(&n.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil // already sent
	}
	if err != nil {
		return err
	}
	ev, _ := json.Marshal(map[string]any{"type": "notification", "notification": n})
	if err := s.nc.Publish(events.UserSubject(uid), ev); err != nil {
		slog.Warn("push notification", "err", err)
	}
	return nil
}

func (s *server) cleanupLoop(ctx context.Context) {
	t := time.NewTicker(6 * time.Hour)
	defer t.Stop()
	for range t.C {
		_, _ = s.db.Exec(ctx, `DELETE FROM notifications WHERE created_at < now() - interval '90 days'`)
	}
}
