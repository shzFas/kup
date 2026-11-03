// Chat service: buyer–seller conversations per listing, plus the WebSocket
// that delivers live events (messages, read receipts, notifications).
// Events travel over NATS core (events.user.<id>) so any instance can serve any socket.
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
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/nats-io/nats.go"

	"kup/pkg/clients"
	"kup/pkg/config"
	"kup/pkg/db"
	"kup/pkg/events"
	"kup/pkg/httpx"
	"kup/pkg/i18n"
)

//go:embed migrations/*.sql
var migrations embed.FS

const (
	maxNewChatsPerHour   = 20
	maxMessagesPerMinute = 60
	maxText              = 2000
)

type server struct {
	db          *pgxpool.Pool
	nc          *nats.Conn
	users       *clients.Users
	listingsURL string
	http        *http.Client
	hub         *hub
}

func must(err error, what string) {
	if err != nil {
		slog.Error(what, "err", err)
		os.Exit(1)
	}
}

func main() {
	httpx.SetupLogger("chat")
	ctx := context.Background()
	pool, err := db.Connect(ctx, config.MustString("DATABASE_URL"))
	must(err, "db")
	sub, _ := fs.Sub(migrations, "migrations")
	must(db.Migrate(ctx, pool, sub), "migrate")
	nc, _, err := events.Connect(ctx, config.String("NATS_URL", "nats://nats:4222"))
	must(err, "nats")
	defer nc.Close()

	s := &server{
		db: pool, nc: nc, hub: newHub(),
		users:       clients.NewUsers(config.String("AUTH_URL", "http://auth:8081")),
		listingsURL: config.String("LISTINGS_URL", "http://listings:8083"),
		http:        &http.Client{Timeout: 5 * time.Second},
	}
	_, err = nc.Subscribe(events.UserSubjectAll, func(m *nats.Msg) {
		s.hub.deliver(strings.TrimPrefix(m.Subject, "events.user."), m.Data)
	})
	must(err, "subscribe")

	r := httpx.NewRouter()
	r.Method("GET", "/v1/chats", httpx.Handler(s.list))
	r.Method("POST", "/v1/chats", httpx.Handler(s.start))
	r.Method("GET", "/v1/chats/unread-count", httpx.Handler(s.unreadCount))
	r.Method("GET", "/v1/chats/{id}", httpx.Handler(s.get))
	r.Method("GET", "/v1/chats/{id}/messages", httpx.Handler(s.messages))
	r.Method("POST", "/v1/chats/{id}/messages", httpx.Handler(s.send))
	r.Method("POST", "/v1/chats/{id}/read", httpx.Handler(s.read))
	r.Get("/v1/ws", s.ws)
	httpx.Serve(config.String("ADDR", ":8086"), r)
}

// ---------- model ----------

type chat struct {
	ID      string `json:"id"`
	Listing struct {
		ID       string  `json:"id"`
		Title    string  `json:"title"`
		Photo    *string `json:"photo"`
		Price    int64   `json:"price"`
		Currency string  `json:"currency"`
	} `json:"listing"`
	Peer struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	} `json:"peer"`
	Role        string       `json:"role"`
	LastMessage *lastMessage `json:"last_message"`
	Unread      int          `json:"unread"`
	PeerReadAt  *time.Time   `json:"peer_read_at"`
}

type lastMessage struct {
	Text string    `json:"text"`
	At   time.Time `json:"at"`
	Mine bool      `json:"mine"`
}

type message struct {
	ID        string    `json:"id"`
	ChatID    string    `json:"chat_id"`
	SenderID  string    `json:"sender_id"`
	Mine      bool      `json:"mine"`
	Text      string    `json:"text"`
	CreatedAt time.Time `json:"created_at"`
}

// chatCols selects a chat from the point of view of user $1.
const chatCols = `c.id, c.listing_id, c.buyer_id, c.seller_id, c.titles, c.photo, c.price, c.currency,
	c.last_message_at, c.last_text, c.last_sender_id,
	CASE WHEN c.buyer_id = $1 THEN c.seller_read_at ELSE c.buyer_read_at END,
	(SELECT count(*) FROM messages m WHERE m.chat_id = c.id AND m.sender_id <> $1
		AND m.created_at > COALESCE(CASE WHEN c.buyer_id = $1 THEN c.buyer_read_at ELSE c.seller_read_at END, '-infinity'))`

type chatRow struct {
	chat
	buyer, seller string
	titles        map[string]string
	lastSender    *string
}

func scanChat(row pgx.Row, uid string) (*chatRow, error) {
	var c chatRow
	var lastAt time.Time
	var lastText string
	if err := row.Scan(&c.ID, &c.Listing.ID, &c.buyer, &c.seller, &c.titles, &c.Listing.Photo, &c.Listing.Price, &c.Listing.Currency,
		&lastAt, &lastText, &c.lastSender, &c.PeerReadAt, &c.Unread); err != nil {
		return nil, err
	}
	c.Role, c.Peer.ID = "buyer", c.seller
	if c.seller == uid {
		c.Role, c.Peer.ID = "seller", c.buyer
	}
	if c.lastSender != nil {
		c.LastMessage = &lastMessage{Text: lastText, At: lastAt, Mine: *c.lastSender == uid}
	}
	return &c, nil
}

// finish fills language-dependent fields.
func (s *server) finish(ctx context.Context, c *chatRow, lang i18n.Lang) *chat {
	c.Listing.Title = c.titles[string(lang)]
	if c.Listing.Title == "" {
		c.Listing.Title = c.titles[string(i18n.Default)]
	}
	if u, err := s.users.Get(ctx, c.Peer.ID); err == nil && u.Name != "" {
		c.Peer.Name = u.Name
	} else {
		c.Peer.Name = i18n.T(lang, "default_user")
	}
	return &c.chat
}

func (s *server) loadChat(ctx context.Context, uid, id string) (*chatRow, error) {
	if _, err := uuid.Parse(id); err != nil {
		return nil, httpx.NotFound()
	}
	c, err := scanChat(s.db.QueryRow(ctx, `SELECT `+chatCols+` FROM chats c WHERE c.id=$2 AND (c.buyer_id=$1 OR c.seller_id=$1)`, uid, id), uid)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, httpx.NotFound()
	}
	return c, err
}

// ---------- handlers ----------

func (s *server) list(w http.ResponseWriter, r *http.Request) error {
	uid, err := httpx.RequireUser(r)
	if err != nil {
		return err
	}
	rows, err := s.db.Query(r.Context(), `SELECT `+chatCols+` FROM chats c
		WHERE (c.buyer_id=$1 OR c.seller_id=$1) AND c.last_sender_id IS NOT NULL
		ORDER BY c.last_message_at DESC LIMIT 200`, uid)
	if err != nil {
		return err
	}
	var list []*chatRow
	for rows.Next() {
		c, err := scanChat(rows, uid)
		if err != nil {
			rows.Close()
			return err
		}
		list = append(list, c)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	lang := i18n.FromRequest(r)
	items, total := make([]*chat, 0, len(list)), 0
	for _, c := range list {
		items = append(items, s.finish(r.Context(), c, lang))
		total += c.Unread
	}
	httpx.JSON(w, 200, map[string]any{"items": items, "unread_total": total})
	return nil
}

func (s *server) get(w http.ResponseWriter, r *http.Request) error {
	uid, err := httpx.RequireUser(r)
	if err != nil {
		return err
	}
	c, err := s.loadChat(r.Context(), uid, chi.URLParam(r, "id"))
	if err != nil {
		return err
	}
	httpx.JSON(w, 200, s.finish(r.Context(), c, i18n.FromRequest(r)))
	return nil
}

func (s *server) unreadCount(w http.ResponseWriter, r *http.Request) error {
	uid, err := httpx.RequireUser(r)
	if err != nil {
		return err
	}
	var n int
	err = s.db.QueryRow(r.Context(), `SELECT count(*) FROM messages m JOIN chats c ON c.id = m.chat_id
		WHERE (c.buyer_id=$1 OR c.seller_id=$1) AND m.sender_id <> $1
		AND m.created_at > COALESCE(CASE WHEN c.buyer_id = $1 THEN c.buyer_read_at ELSE c.seller_read_at END, '-infinity')`, uid).Scan(&n)
	if err != nil {
		return err
	}
	httpx.JSON(w, 200, map[string]int{"count": n})
	return nil
}

type brief struct {
	ID       string            `json:"id"`
	UserID   string            `json:"user_id"`
	Titles   map[string]string `json:"titles"`
	Photo    *string           `json:"photo"`
	Price    int64             `json:"price"`
	Currency string            `json:"currency"`
	Status   string            `json:"status"`
}

func (s *server) listingBrief(ctx context.Context, id string) (*brief, error) {
	if _, err := uuid.Parse(id); err != nil {
		return nil, httpx.NotFound()
	}
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, s.listingsURL+"/internal/listings/"+id+"/brief", nil)
	res, err := s.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode == 404 {
		return nil, httpx.NotFound()
	}
	if res.StatusCode != 200 {
		return nil, fmt.Errorf("listing brief: %d", res.StatusCode)
	}
	var b brief
	return &b, json.NewDecoder(res.Body).Decode(&b)
}

func cleanText(r *http.Request, t string) (string, error) {
	t = strings.TrimSpace(t)
	if n := len([]rune(t)); n < 1 || n > maxText {
		return "", httpx.Validation(map[string]string{"text": i18n.T(i18n.FromRequest(r), "chat_text")})
	}
	return t, nil
}

func (s *server) checkMessageRate(ctx context.Context, uid string) error {
	var n int
	if err := s.db.QueryRow(ctx, `SELECT count(*) FROM messages WHERE sender_id=$1 AND created_at > now() - interval '1 minute'`, uid).Scan(&n); err != nil {
		return err
	}
	if n >= maxMessagesPerMinute {
		return httpx.Err(429, "too_many_requests", "chat_msg_rate")
	}
	return nil
}

// start opens a chat about a listing (or reuses the existing one) with a first message.
func (s *server) start(w http.ResponseWriter, r *http.Request) error {
	uid, err := httpx.RequireUser(r)
	if err != nil {
		return err
	}
	var in struct {
		ListingID string `json:"listing_id"`
		Text      string `json:"text"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	text, err := cleanText(r, in.Text)
	if err != nil {
		return err
	}
	b, err := s.listingBrief(r.Context(), in.ListingID)
	if err != nil {
		return err
	}
	if b.UserID == uid {
		return httpx.Err(400, "bad_request", "chat_own")
	}
	if b.Status != "active" {
		return httpx.Err(410, "gone", "listing_inactive")
	}
	if err := s.checkMessageRate(r.Context(), uid); err != nil {
		return err
	}
	var chatID string
	err = s.db.QueryRow(r.Context(), `SELECT id FROM chats WHERE listing_id=$1 AND buyer_id=$2`, b.ID, uid).Scan(&chatID)
	status := 200
	if errors.Is(err, pgx.ErrNoRows) {
		var n int
		if err := s.db.QueryRow(r.Context(), `SELECT count(*) FROM chats WHERE buyer_id=$1 AND created_at > now() - interval '1 hour'`, uid).Scan(&n); err != nil {
			return err
		}
		if n >= maxNewChatsPerHour {
			return httpx.Err(429, "too_many_requests", "chat_rate")
		}
		status = 201
		titles, _ := json.Marshal(b.Titles)
		err = s.db.QueryRow(r.Context(), `INSERT INTO chats(id, listing_id, buyer_id, seller_id, titles, photo, price, currency)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
			ON CONFLICT (listing_id, buyer_id) DO UPDATE SET price = EXCLUDED.price
			RETURNING id`, uuid.New(), b.ID, uid, b.UserID, titles, b.Photo, b.Price, b.Currency).Scan(&chatID)
	} else if err == nil {
		titles, _ := json.Marshal(b.Titles)
		_, err = s.db.Exec(r.Context(), `UPDATE chats SET titles=$2, photo=$3, price=$4, currency=$5 WHERE id=$1`,
			chatID, titles, b.Photo, b.Price, b.Currency)
	}
	if err != nil {
		return err
	}
	if _, err := s.post(r.Context(), chatID, uid, text); err != nil {
		return err
	}
	c, err := s.loadChat(r.Context(), uid, chatID)
	if err != nil {
		return err
	}
	httpx.JSON(w, status, s.finish(r.Context(), c, i18n.FromRequest(r)))
	return nil
}

// post stores a message and pushes it to both participants.
func (s *server) post(ctx context.Context, chatID, uid, text string) (*message, error) {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	m := &message{ID: uuid.NewString(), ChatID: chatID, SenderID: uid, Text: text, Mine: true}
	if err := tx.QueryRow(ctx, `INSERT INTO messages(id, chat_id, sender_id, text) VALUES ($1,$2,$3,$4) RETURNING created_at`,
		m.ID, chatID, uid, text).Scan(&m.CreatedAt); err != nil {
		return nil, err
	}
	var buyer, seller string
	// Writing a message also means the sender has read everything before it.
	if err := tx.QueryRow(ctx, `UPDATE chats SET last_message_at=$2, last_text=left($3, 200), last_sender_id=$4,
			buyer_read_at  = CASE WHEN buyer_id  = $4 THEN $2 ELSE buyer_read_at END,
			seller_read_at = CASE WHEN seller_id = $4 THEN $2 ELSE seller_read_at END
		WHERE id=$1 RETURNING buyer_id, seller_id`, chatID, m.CreatedAt, text, uid).Scan(&buyer, &seller); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	for _, to := range []string{buyer, seller} {
		cp := *m
		cp.Mine = to == uid
		s.push(to, map[string]any{"type": "message", "chat_id": chatID, "message": cp})
	}
	return m, nil
}

func (s *server) push(uid string, ev any) {
	b, _ := json.Marshal(ev)
	if err := s.nc.Publish(events.UserSubject(uid), b); err != nil {
		slog.Warn("push", "err", err)
	}
}

func (s *server) send(w http.ResponseWriter, r *http.Request) error {
	uid, err := httpx.RequireUser(r)
	if err != nil {
		return err
	}
	var in struct {
		Text string `json:"text"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	text, err := cleanText(r, in.Text)
	if err != nil {
		return err
	}
	c, err := s.loadChat(r.Context(), uid, chi.URLParam(r, "id"))
	if err != nil {
		return err
	}
	if err := s.checkMessageRate(r.Context(), uid); err != nil {
		return err
	}
	m, err := s.post(r.Context(), c.ID, uid, text)
	if err != nil {
		return err
	}
	httpx.JSON(w, 201, m)
	return nil
}

func (s *server) messages(w http.ResponseWriter, r *http.Request) error {
	uid, err := httpx.RequireUser(r)
	if err != nil {
		return err
	}
	c, err := s.loadChat(r.Context(), uid, chi.URLParam(r, "id"))
	if err != nil {
		return err
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	args := []any{c.ID, limit}
	where := "chat_id=$1"
	if b := r.URL.Query().Get("before"); b != "" {
		if _, err := uuid.Parse(b); err != nil {
			return httpx.BadRequest("before")
		}
		where += " AND (created_at, id) < (SELECT created_at, id FROM messages WHERE id=$3 AND chat_id=$1)"
		args = append(args, b)
	}
	rows, err := s.db.Query(r.Context(), `SELECT id, sender_id, text, created_at FROM messages WHERE `+where+`
		ORDER BY created_at DESC, id DESC LIMIT $2`, args...)
	if err != nil {
		return err
	}
	defer rows.Close()
	items := []message{}
	for rows.Next() {
		m := message{ChatID: c.ID}
		if err := rows.Scan(&m.ID, &m.SenderID, &m.Text, &m.CreatedAt); err != nil {
			return err
		}
		m.Mine = m.SenderID == uid
		items = append(items, m)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	for i, j := 0, len(items)-1; i < j; i, j = i+1, j-1 { // oldest first
		items[i], items[j] = items[j], items[i]
	}
	httpx.JSON(w, 200, map[string]any{"items": items})
	return nil
}

func (s *server) read(w http.ResponseWriter, r *http.Request) error {
	uid, err := httpx.RequireUser(r)
	if err != nil {
		return err
	}
	c, err := s.loadChat(r.Context(), uid, chi.URLParam(r, "id"))
	if err != nil {
		return err
	}
	var at time.Time
	if err := s.db.QueryRow(r.Context(), `UPDATE chats SET
			buyer_read_at  = CASE WHEN buyer_id  = $2 THEN now() ELSE buyer_read_at END,
			seller_read_at = CASE WHEN seller_id = $2 THEN now() ELSE seller_read_at END
		WHERE id=$1 RETURNING now()`, c.ID, uid).Scan(&at); err != nil {
		return err
	}
	ev := map[string]any{"type": "read", "chat_id": c.ID, "reader_id": uid, "at": at}
	s.push(c.Peer.ID, ev)
	s.push(uid, ev) // other tabs/devices of the reader update their badges
	w.WriteHeader(204)
	return nil
}
