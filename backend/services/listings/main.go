// Listings service: create/edit listings, photos, favorites. Publishes every
// change to NATS through a transactional outbox so search stays in sync.
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
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	"github.com/nats-io/nats.go/jetstream"

	"kup/pkg/clients"
	"kup/pkg/config"
	"kup/pkg/db"
	"kup/pkg/events"
	"kup/pkg/httpx"
)

//go:embed migrations/*.sql
var migrations embed.FS

type server struct {
	db       *pgxpool.Pool
	catalog  *clients.Catalog
	authURL  string
	http     *http.Client
	s3       *minio.Client
	bucket   string
	js       jetstream.JetStream
	currency string
	wake     chan struct{}
}

func main() {
	httpx.SetupLogger("listings")
	ctx := context.Background()
	pool, err := db.Connect(ctx, config.MustString("DATABASE_URL"))
	must(err, "db")
	sub, _ := fs.Sub(migrations, "migrations")
	must(db.Migrate(ctx, pool, sub), "migrate")

	s3, err := minio.New(config.String("S3_ENDPOINT", "minio:9000"), &minio.Options{
		Creds:  credentials.NewStaticV4(config.MustString("S3_ACCESS_KEY"), config.MustString("S3_SECRET_KEY"), ""),
		Secure: config.Bool("S3_SECURE", false),
	})
	must(err, "s3")
	bucket := config.String("S3_BUCKET", "media")
	must(ensureBucket(ctx, s3, bucket), "bucket")

	nc, js, err := events.Connect(ctx, config.String("NATS_URL", "nats://nats:4222"))
	must(err, "nats")
	defer nc.Close()

	s := &server{
		db: pool, catalog: clients.NewCatalog(config.String("CATALOG_URL", "http://catalog:8082")),
		authURL: config.String("AUTH_URL", "http://auth:8081"), http: &http.Client{Timeout: 5 * time.Second},
		s3: s3, bucket: bucket, js: js, currency: config.String("CURRENCY", "KZT"), wake: make(chan struct{}, 1),
	}
	go s.relayOutbox(ctx)
	go s.expireLoop(ctx)

	r := httpx.NewRouter()
	r.Method("POST", "/v1/listings", httpx.Handler(s.create))
	r.Method("GET", "/v1/listings/{id}", httpx.Handler(s.get))
	r.Method("PATCH", "/v1/listings/{id}", httpx.Handler(s.update))
	r.Method("DELETE", "/v1/listings/{id}", httpx.Handler(s.remove))
	r.Method("POST", "/v1/listings/{id}/status", httpx.Handler(s.setStatus))
	r.Method("GET", "/v1/listings/{id}/phone", httpx.Handler(s.phone))
	r.Method("GET", "/v1/me/listings", httpx.Handler(s.mine))
	r.Method("GET", "/v1/me/favorites", httpx.Handler(s.favorites))
	r.Method("PUT", "/v1/me/favorites/{id}", httpx.Handler(s.addFavorite))
	r.Method("DELETE", "/v1/me/favorites/{id}", httpx.Handler(s.removeFavorite))
	r.Method("POST", "/v1/media/photos", httpx.Handler(s.uploadPhoto))
	r.Method("GET", "/internal/export", httpx.Handler(s.export))
	r.Method("POST", "/internal/favorites/check", httpx.Handler(s.checkFavorites))
	r.Method("GET", "/internal/favorites/users", httpx.Handler(s.favoriteUsers))
	r.Method("GET", "/internal/listings/{id}/brief", httpx.Handler(s.brief))
	r.Method("POST", "/v1/reports", httpx.Handler(s.createReport))
	r.Method("GET", "/v1/admin/reports", httpx.Handler(s.adminReports))
	r.Method("POST", "/v1/admin/reports/{id}/resolve", httpx.Handler(s.resolveReport))
	r.Method("GET", "/v1/admin/listings", httpx.Handler(s.adminListings))
	r.Method("POST", "/v1/admin/listings/{id}/block", httpx.Handler(s.blockListing))
	r.Method("POST", "/v1/admin/listings/{id}/unblock", httpx.Handler(s.unblockListing))

	httpx.Serve(config.String("ADDR", ":8083"), r)
}

func must(err error, what string) {
	if err != nil {
		slog.Error(what, "err", err)
		os.Exit(1)
	}
}

func ensureBucket(ctx context.Context, c *minio.Client, bucket string) error {
	var err error
	for i := 0; i < 30; i++ {
		var ok bool
		if ok, err = c.BucketExists(ctx, bucket); err == nil {
			if !ok {
				if err = c.MakeBucket(ctx, bucket, minio.MakeBucketOptions{}); err != nil {
					return err
				}
			}
			// Photos are public: the gateway serves /media/* straight from the bucket.
			policy := fmt.Sprintf(`{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"AWS":["*"]},"Action":["s3:GetObject"],"Resource":["arn:aws:s3:::%s/photos/*"]}]}`, bucket)
			if err := c.SetBucketPolicy(ctx, bucket, policy); err != nil {
				// SeaweedFS grants anonymous read via its identities config instead.
				slog.Info("bucket policy not applied", "err", err)
			}
			return nil
		}
		slog.Warn("waiting for s3", "err", err)
		time.Sleep(time.Second)
	}
	return err
}

// ---------- model ----------

type row struct {
	ID          string
	UserID      string
	Category    string
	Status      string
	Title       string
	Description string
	Price       int64
	Currency    string
	PriceSuffix string
	City        string
	Lat, Lng    *float64
	Attributes  map[string]any
	Labels      map[string]string
	Highlights  []string
	SearchText  string
	Photos      []string
	Views       int64
	PublishedAt time.Time
	UpdatedAt   time.Time
	ExpiresAt   time.Time
	ModReason   *string
}

const listingTTL = 30 * 24 * time.Hour

const cols = `id, user_id, category, status, title, description, price, currency, price_suffix, city, lat, lng,
	attributes, attribute_labels, highlights, search_text, photos::text[], views, published_at, updated_at, expires_at, moderation_reason`

func scanRow(sc interface{ Scan(...any) error }) (*row, error) {
	var r row
	err := sc.Scan(&r.ID, &r.UserID, &r.Category, &r.Status, &r.Title, &r.Description, &r.Price, &r.Currency, &r.PriceSuffix,
		&r.City, &r.Lat, &r.Lng, &r.Attributes, &r.Labels, &r.Highlights, &r.SearchText, &r.Photos, &r.Views, &r.PublishedAt, &r.UpdatedAt, &r.ExpiresAt, &r.ModReason)
	return &r, err
}

func (s *server) load(ctx context.Context, q pgx.Row) (*row, error) {
	r, err := scanRow(q)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, httpx.NotFound()
	}
	return r, err
}

func (s *server) byID(ctx context.Context, id string, forUpdate pgx.Tx) (*row, error) {
	if _, err := uuid.Parse(id); err != nil {
		return nil, httpx.NotFound()
	}
	if forUpdate != nil {
		return s.load(ctx, forUpdate.QueryRow(ctx, `SELECT `+cols+` FROM listings WHERE id=$1 AND status<>'deleted' FOR UPDATE`, id))
	}
	return s.load(ctx, s.db.QueryRow(ctx, `SELECT `+cols+` FROM listings WHERE id=$1 AND status<>'deleted'`, id))
}

// ---------- input & validation ----------

type input struct {
	Category    *string         `json:"category"`
	Price       *float64        `json:"price"`
	Currency    *string         `json:"currency"`
	City        *string         `json:"city"`
	Description *string         `json:"description"`
	Location    *events.Point   `json:"location"`
	Photos      *[]string       `json:"photos"`
	Attributes  *map[string]any `json:"attributes"`
}

// apply validates in on top of r (empty row for create) and recomputes derived fields.
func (s *server) apply(ctx context.Context, r *row, in input, uid string) error {
	errs := map[string]string{}
	if in.Category != nil {
		if r.Category != "" && *in.Category != r.Category {
			errs["category"] = "Категорию нельзя изменить"
		}
		r.Category = *in.Category
	}
	sc, err := s.catalog.Schema(ctx, r.Category)
	if errors.Is(err, clients.ErrNotFound) {
		return httpx.Validation(map[string]string{"category": "Неизвестная категория"})
	}
	if err != nil {
		return err
	}
	refs, err := s.catalog.Refs(ctx)
	if err != nil {
		return err
	}

	if in.Price != nil {
		if *in.Price < 0 || *in.Price > 1e13 || *in.Price != float64(int64(*in.Price)) {
			errs["price"] = "Укажите цену целым числом"
		} else {
			r.Price = int64(*in.Price)
		}
	}
	if r.Price <= 0 && errs["price"] == "" {
		errs["price"] = "Укажите цену"
	}
	if in.Currency != nil {
		r.Currency = *in.Currency
	}
	if r.Currency == "" {
		r.Currency = s.currency
	}
	if r.Currency != s.currency {
		errs["currency"] = "Поддерживается только " + s.currency
	}
	if in.City != nil {
		r.City = *in.City
	}
	if _, ok := refs["city"][r.City]; !ok {
		errs["city"] = "Выберите город"
	}
	if in.Description != nil {
		r.Description = strings.TrimSpace(*in.Description)
	}
	if n := len([]rune(r.Description)); n > 5000 {
		errs["description"] = "Не более 5000 символов"
	} else if hasLink(r.Description) {
		errs["description"] = "Ссылки в описании запрещены"
	}
	if in.Location != nil {
		if in.Location.Lat < -90 || in.Location.Lat > 90 || in.Location.Lng < -180 || in.Location.Lng > 180 {
			errs["location"] = "Некорректные координаты"
		} else {
			r.Lat, r.Lng = &in.Location.Lat, &in.Location.Lng
		}
	}
	if in.Photos != nil {
		if msg := s.checkPhotos(ctx, *in.Photos, uid); msg != "" {
			errs["photos"] = msg
		} else {
			r.Photos = *in.Photos
		}
	}
	if r.Photos == nil {
		r.Photos = []string{}
	}

	raw := r.Attributes
	if in.Attributes != nil {
		raw = *in.Attributes
	}
	attrs, attrErrs := validateAttributes(sc, refs, raw)
	for k, v := range attrErrs {
		errs[k] = v
	}
	if len(errs) > 0 {
		return httpx.Validation(errs)
	}
	addComputed(r.Category, attrs, r.Price)
	d := derive(sc, refs, attrs, refs["city"][r.City].Name)
	r.Attributes, r.Labels, r.Title, r.Highlights, r.PriceSuffix, r.SearchText = d.Attributes, d.Labels, d.Title, d.Highlights, d.PriceSuffix, d.SearchText
	return nil
}

func (s *server) checkPhotos(ctx context.Context, ids []string, uid string) string {
	if len(ids) > 20 {
		return "Не более 20 фото"
	}
	seen := map[string]bool{}
	for _, id := range ids {
		if _, err := uuid.Parse(id); err != nil || seen[id] {
			return "Некорректный список фото"
		}
		seen[id] = true
	}
	if len(ids) == 0 {
		return ""
	}
	var n int
	if err := s.db.QueryRow(ctx, `SELECT count(*) FROM photos WHERE id = ANY($1::uuid[]) AND user_id=$2`, ids, uid).Scan(&n); err != nil || n != len(ids) {
		return "Фото не найдены — загрузите их заново"
	}
	return ""
}

// ---------- handlers ----------

func (s *server) create(w http.ResponseWriter, r *http.Request) error {
	uid, err := httpx.RequireUser(r)
	if err != nil {
		return err
	}
	var in input
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	if in.Category == nil {
		return httpx.Validation(map[string]string{"category": "Выберите категорию"})
	}
	if in.Attributes == nil {
		in.Attributes = &map[string]any{}
	}
	now := time.Now().UTC().Truncate(time.Microsecond)
	l := &row{ID: uuid.NewString(), UserID: uid, Status: "active", Attributes: map[string]any{}, PublishedAt: now, UpdatedAt: now, ExpiresAt: now.Add(listingTTL)}
	if err := s.apply(r.Context(), l, in, uid); err != nil {
		return err
	}
	err = s.inTx(r.Context(), func(tx pgx.Tx) error {
		_, err := tx.Exec(r.Context(), `INSERT INTO listings(id, user_id, category, status, title, description, price, currency, price_suffix,
			city, lat, lng, attributes, attribute_labels, highlights, search_text, photos, published_at, created_at, updated_at, expires_at)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::uuid[],$18,$18,$18,$19)`,
			l.ID, l.UserID, l.Category, l.Status, l.Title, l.Description, l.Price, l.Currency, l.PriceSuffix,
			l.City, l.Lat, l.Lng, l.Attributes, l.Labels, l.Highlights, l.SearchText, l.Photos, l.PublishedAt, l.ExpiresAt)
		if err != nil {
			return err
		}
		if _, err := tx.Exec(r.Context(), `INSERT INTO listing_prices(listing_id, price, at) VALUES ($1,$2,$3)`, l.ID, l.Price, now); err != nil {
			return err
		}
		if err := s.enqueue(r.Context(), tx, l); err != nil {
			return err
		}
		return s.publishEvent(r.Context(), tx, events.SubjectPublished, s.doc(r.Context(), l))
	})
	if err != nil {
		return err
	}
	return s.respondDetail(w, r, l.ID, 201)
}

func (s *server) update(w http.ResponseWriter, r *http.Request) error {
	uid, err := httpx.RequireUser(r)
	if err != nil {
		return err
	}
	var in input
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	err = s.inTx(r.Context(), func(tx pgx.Tx) error {
		l, err := s.byID(r.Context(), chi.URLParam(r, "id"), tx)
		if err != nil {
			return err
		}
		if l.UserID != uid {
			return httpx.Forbidden()
		}
		oldPrice := l.Price
		if err := s.apply(r.Context(), l, in, uid); err != nil {
			return err
		}
		if l.Price != oldPrice {
			if _, err := tx.Exec(r.Context(), `INSERT INTO listing_prices(listing_id, price) VALUES ($1,$2)`, l.ID, l.Price); err != nil {
				return err
			}
			if l.Price < oldPrice && l.Status == "active" {
				if err := s.publishEvent(r.Context(), tx, events.SubjectPriceDropped, events.PriceDropped{Listing: s.doc(r.Context(), l), OldPrice: oldPrice}); err != nil {
					return err
				}
			}
		}
		_, err = tx.Exec(r.Context(), `UPDATE listings SET title=$2, description=$3, price=$4, currency=$5, price_suffix=$6, city=$7,
			lat=$8, lng=$9, attributes=$10, attribute_labels=$11, highlights=$12, search_text=$13, photos=$14::uuid[], updated_at=now() WHERE id=$1`,
			l.ID, l.Title, l.Description, l.Price, l.Currency, l.PriceSuffix, l.City, l.Lat, l.Lng, l.Attributes, l.Labels, l.Highlights, l.SearchText, l.Photos)
		if err != nil {
			return err
		}
		return s.enqueue(r.Context(), tx, l)
	})
	if err != nil {
		return err
	}
	return s.respondDetail(w, r, chi.URLParam(r, "id"), 200)
}

func (s *server) setStatus(w http.ResponseWriter, r *http.Request) error {
	uid, err := httpx.RequireUser(r)
	if err != nil {
		return err
	}
	var in struct {
		Status string `json:"status"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	if in.Status != "active" && in.Status != "archived" && in.Status != "sold" {
		return httpx.Validation(map[string]string{"status": "Допустимо: active, archived, sold"})
	}
	return s.changeStatus(w, r, uid, in.Status)
}

func (s *server) remove(w http.ResponseWriter, r *http.Request) error {
	uid, err := httpx.RequireUser(r)
	if err != nil {
		return err
	}
	return s.changeStatus(w, r, uid, "deleted")
}

func (s *server) changeStatus(w http.ResponseWriter, r *http.Request, uid, status string) error {
	err := s.inTx(r.Context(), func(tx pgx.Tx) error {
		l, err := s.byID(r.Context(), chi.URLParam(r, "id"), tx)
		if err != nil {
			return err
		}
		if l.UserID != uid {
			return httpx.Forbidden()
		}
		if l.Status == "blocked" && status != "deleted" {
			return httpx.NewError(403, "blocked", "Объявление заблокировано модератором")
		}
		// Re-activating (prolonging) bumps the listing to the top, like a fresh publication.
		bump := status == "active" && l.Status != "active"
		if bump {
			l.PublishedAt = time.Now().UTC().Truncate(time.Microsecond)
			l.ExpiresAt = l.PublishedAt.Add(listingTTL)
		}
		_, err = tx.Exec(r.Context(), `UPDATE listings SET status=$2, updated_at=now(), published_at=$3, expires_at=$4 WHERE id=$1`,
			l.ID, status, l.PublishedAt, l.ExpiresAt)
		if err != nil {
			return err
		}
		l.Status = status
		if bump {
			if err := s.publishEvent(r.Context(), tx, events.SubjectPublished, s.doc(r.Context(), l)); err != nil {
				return err
			}
		}
		return s.enqueue(r.Context(), tx, l)
	})
	if err != nil {
		return err
	}
	if status == "deleted" {
		w.WriteHeader(204)
		return nil
	}
	return s.respondDetail(w, r, chi.URLParam(r, "id"), 200)
}

func (s *server) get(w http.ResponseWriter, r *http.Request) error {
	id := chi.URLParam(r, "id")
	l, err := s.byID(r.Context(), id, nil)
	if err != nil {
		return err
	}
	if l.Status == "blocked" && l.UserID != httpx.UserID(r) && !isModerator(r) {
		return httpx.NotFound()
	}
	if l.UserID != httpx.UserID(r) {
		_, _ = s.db.Exec(r.Context(), `UPDATE listings SET views=views+1 WHERE id=$1`, id)
		l.Views++
	}
	return s.writeDetail(w, r, l, 200)
}

func (s *server) respondDetail(w http.ResponseWriter, r *http.Request, id string, status int) error {
	l, err := s.byID(r.Context(), id, nil)
	if err != nil {
		return err
	}
	return s.writeDetail(w, r, l, status)
}

type card struct {
	ID              string            `json:"id"`
	Category        string            `json:"category"`
	Title           string            `json:"title"`
	Price           int64             `json:"price"`
	Currency        string            `json:"currency"`
	PriceSuffix     string            `json:"price_suffix"`
	City            events.City       `json:"city"`
	Photos          []string          `json:"photos"`
	Attributes      map[string]any    `json:"attributes"`
	AttributeLabels map[string]string `json:"attribute_labels"`
	Highlights      []string          `json:"highlights"`
	Status          string            `json:"status"`
	PublishedAt     time.Time         `json:"published_at"`
	IsFavorite      *bool             `json:"is_favorite,omitempty"`
}

type detail struct {
	card
	Description string        `json:"description"`
	Location    *events.Point `json:"location"`
	PhotoIDs    []string      `json:"photo_ids"` // same order as photos; send back in PATCH
	ExpiresAt   *time.Time    `json:"expires_at"`
	History     []pricePoint  `json:"price_history"`
	ModReason   *string       `json:"moderation_reason"`
	Seller      seller        `json:"seller"`
	Views       int64         `json:"views"`
	IsOwner     bool          `json:"is_owner"`
	UpdatedAt   time.Time     `json:"updated_at"`
}

type seller struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	MemberSince time.Time `json:"member_since"`
}

// publicAttrs hides free-text fields (VIN) from everyone but the owner.
func publicAttrs(l *row, owner bool) (map[string]any, map[string]string) {
	if owner {
		return l.Attributes, l.Labels
	}
	a := make(map[string]any, len(l.Attributes))
	lb := make(map[string]string, len(l.Labels))
	for k, v := range l.Attributes {
		a[k] = v
	}
	for k, v := range l.Labels {
		lb[k] = v
	}
	if vin, ok := a["vin"].(string); ok && len(vin) == 17 {
		masked := vin[:3] + strings.Repeat("*", 10) + vin[13:]
		a["vin"], lb["vin"] = masked, masked
	}
	return a, lb
}

func (s *server) toCard(ctx context.Context, l *row, owner bool) card {
	refs, _ := s.catalog.Refs(ctx)
	photos := make([]string, 0, 5)
	for i, p := range l.Photos {
		if i == 5 {
			break
		}
		photos = append(photos, photoURL(p, true))
	}
	attrs, labels := publicAttrs(l, owner)
	return card{
		ID: l.ID, Category: l.Category, Title: l.Title, Price: l.Price, Currency: l.Currency, PriceSuffix: l.PriceSuffix,
		City: events.City{ID: l.City, Name: refs["city"][l.City].Name}, Photos: photos, Attributes: attrs, AttributeLabels: labels,
		Highlights: l.Highlights, Status: l.Status, PublishedAt: l.PublishedAt,
	}
}

func (s *server) writeDetail(w http.ResponseWriter, r *http.Request, l *row, status int) error {
	uid := httpx.UserID(r)
	owner := uid == l.UserID
	d := detail{card: s.toCard(r.Context(), l, owner), Description: l.Description, Views: l.Views, IsOwner: owner, UpdatedAt: l.UpdatedAt, PhotoIDs: l.Photos}
	d.Photos = make([]string, len(l.Photos))
	for i, p := range l.Photos {
		d.Photos[i] = photoURL(p, false)
	}
	if l.Lat != nil && l.Lng != nil {
		d.Location = &events.Point{Lat: *l.Lat, Lng: *l.Lng}
	}
	if l.Status == "active" {
		d.ExpiresAt = &l.ExpiresAt
	}
	if owner || isModerator(r) {
		d.ModReason = l.ModReason
	}
	d.History = s.priceHistory(r.Context(), l.ID)
	if u, err := s.user(r.Context(), l.UserID); err == nil {
		d.Seller = seller{ID: u.ID, Name: u.Name, MemberSince: u.CreatedAt}
		if d.Seller.Name == "" {
			d.Seller.Name = "Пользователь"
		}
	} else {
		slog.Warn("seller lookup failed", "err", err)
		d.Seller = seller{ID: l.UserID, Name: "Пользователь"}
	}
	if uid != "" {
		fav := false
		_ = s.db.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM favorites WHERE user_id=$1 AND listing_id=$2)`, uid, l.ID).Scan(&fav)
		d.IsFavorite = &fav
	}
	httpx.JSON(w, status, d)
	return nil
}

type authUser struct {
	ID        string    `json:"id"`
	Phone     string    `json:"phone"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"created_at"`
}

func (s *server) user(ctx context.Context, id string) (*authUser, error) {
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, s.authURL+"/internal/users/"+id, nil)
	res, err := s.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		return nil, fmt.Errorf("auth: status %d", res.StatusCode)
	}
	var u authUser
	return &u, json.NewDecoder(res.Body).Decode(&u)
}

func (s *server) phone(w http.ResponseWriter, r *http.Request) error {
	if _, err := httpx.RequireUser(r); err != nil {
		return err
	}
	l, err := s.byID(r.Context(), chi.URLParam(r, "id"), nil)
	if err != nil {
		return err
	}
	if l.Status != "active" {
		return httpx.NewError(410, "inactive", "Объявление снято с публикации")
	}
	u, err := s.user(r.Context(), l.UserID)
	if err != nil {
		return err
	}
	httpx.JSON(w, 200, map[string]string{"phone": u.Phone})
	return nil
}

func (s *server) mine(w http.ResponseWriter, r *http.Request) error {
	uid, err := httpx.RequireUser(r)
	if err != nil {
		return err
	}
	q := `SELECT ` + cols + ` FROM listings WHERE user_id=$1 AND status<>'deleted'`
	args := []any{uid}
	if st := r.URL.Query().Get("status"); st != "" {
		q += ` AND status=$2`
		args = append(args, st)
	}
	return s.writeCards(w, r, q+` ORDER BY updated_at DESC LIMIT 500`, args, true)
}

func (s *server) favorites(w http.ResponseWriter, r *http.Request) error {
	uid, err := httpx.RequireUser(r)
	if err != nil {
		return err
	}
	q := `SELECT ` + prefixed("l.") + ` FROM favorites f JOIN listings l ON l.id=f.listing_id
		WHERE f.user_id=$1 AND l.status<>'deleted' ORDER BY f.created_at DESC LIMIT 500`
	return s.writeCards(w, r, q, []any{uid}, false)
}

func prefixed(p string) string {
	parts := strings.Split(cols, ",")
	for i, c := range parts {
		parts[i] = p + strings.TrimSpace(c)
	}
	return strings.Join(parts, ", ")
}

func (s *server) writeCards(w http.ResponseWriter, r *http.Request, q string, args []any, owner bool) error {
	rows, err := s.db.Query(r.Context(), q, args...)
	if err != nil {
		return err
	}
	defer rows.Close()
	uid := httpx.UserID(r)
	var list []*row
	for rows.Next() {
		l, err := scanRow(rows)
		if err != nil {
			return err
		}
		list = append(list, l)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	favs := s.favoriteSet(r.Context(), uid, list)
	items := make([]card, 0, len(list))
	for _, l := range list {
		c := s.toCard(r.Context(), l, owner)
		f := favs[l.ID]
		c.IsFavorite = &f
		items = append(items, c)
	}
	httpx.JSON(w, 200, map[string]any{"items": items})
	return nil
}

func (s *server) favoriteSet(ctx context.Context, uid string, list []*row) map[string]bool {
	ids := make([]string, len(list))
	for i, l := range list {
		ids[i] = l.ID
	}
	return s.favoriteIDs(ctx, uid, ids)
}

func (s *server) favoriteIDs(ctx context.Context, uid string, ids []string) map[string]bool {
	out := map[string]bool{}
	if uid == "" || len(ids) == 0 {
		return out
	}
	rows, err := s.db.Query(ctx, `SELECT listing_id::text FROM favorites WHERE user_id=$1 AND listing_id = ANY($2::uuid[])`, uid, ids)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		if rows.Scan(&id) == nil {
			out[id] = true
		}
	}
	return out
}

func (s *server) addFavorite(w http.ResponseWriter, r *http.Request) error {
	uid, err := httpx.RequireUser(r)
	if err != nil {
		return err
	}
	l, err := s.byID(r.Context(), chi.URLParam(r, "id"), nil)
	if err != nil {
		return err
	}
	if _, err := s.db.Exec(r.Context(), `INSERT INTO favorites(user_id, listing_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, uid, l.ID); err != nil {
		return err
	}
	w.WriteHeader(204)
	return nil
}

func (s *server) removeFavorite(w http.ResponseWriter, r *http.Request) error {
	uid, err := httpx.RequireUser(r)
	if err != nil {
		return err
	}
	id := chi.URLParam(r, "id")
	if _, err := uuid.Parse(id); err != nil {
		return httpx.NotFound()
	}
	if _, err := s.db.Exec(r.Context(), `DELETE FROM favorites WHERE user_id=$1 AND listing_id=$2`, uid, id); err != nil {
		return err
	}
	w.WriteHeader(204)
	return nil
}

// checkFavorites lets search mark cards in results as favorites.
func (s *server) checkFavorites(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		UserID string   `json:"user_id"`
		IDs    []string `json:"ids"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	set := s.favoriteIDs(r.Context(), in.UserID, in.IDs)
	ids := make([]string, 0, len(set))
	for id := range set {
		ids = append(ids, id)
	}
	httpx.JSON(w, 200, map[string]any{"ids": ids})
	return nil
}

// export streams active listings as search documents (used to rebuild the index).
func (s *server) export(w http.ResponseWriter, r *http.Request) error {
	after := r.URL.Query().Get("after")
	if after == "" {
		after = "00000000-0000-0000-0000-000000000000"
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit <= 0 || limit > 1000 {
		limit = 500
	}
	rows, err := s.db.Query(r.Context(), `SELECT `+cols+` FROM listings WHERE status='active' AND id > $1 ORDER BY id LIMIT $2`, after, limit)
	if err != nil {
		return err
	}
	defer rows.Close()
	docs := []events.ListingDoc{}
	for rows.Next() {
		l, err := scanRow(rows)
		if err != nil {
			return err
		}
		docs = append(docs, s.doc(r.Context(), l))
	}
	httpx.JSON(w, 200, map[string]any{"items": docs})
	return rows.Err()
}

// ---------- outbox ----------

func (s *server) inTx(ctx context.Context, fn func(pgx.Tx) error) error {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if err := fn(tx); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return err
	}
	select {
	case s.wake <- struct{}{}:
	default:
	}
	return nil
}

func (s *server) doc(ctx context.Context, l *row) events.ListingDoc {
	c := s.toCard(ctx, l, false)
	attrs := map[string]any{}
	labels := map[string]string{}
	for k, v := range l.Attributes {
		if k != "vin" { // free text is not searchable/filterable
			attrs[k] = v
		}
	}
	for k, v := range l.Labels {
		if k != "vin" {
			labels[k] = v
		}
	}
	d := events.ListingDoc{
		ID: l.ID, Category: l.Category, Title: l.Title, Description: l.Description, Price: l.Price, Currency: l.Currency,
		PriceSuffix: l.PriceSuffix, City: c.City, Photos: c.Photos, Attributes: attrs, AttributeLabels: labels,
		Highlights: l.Highlights, Status: l.Status, PublishedAt: l.PublishedAt, UserID: l.UserID, SearchText: l.SearchText,
	}
	if l.Lat != nil && l.Lng != nil {
		d.Location = &events.Point{Lat: *l.Lat, Lng: *l.Lng}
	}
	return d
}

func (s *server) enqueue(ctx context.Context, tx pgx.Tx, l *row) error {
	var subject string
	var payload any
	if l.Status == "active" {
		subject, payload = events.SubjectUpserted, s.doc(ctx, l)
	} else {
		subject, payload = events.SubjectRemoved, events.ListingRemoved{ID: l.ID}
	}
	return s.publishEvent(ctx, tx, subject, payload)
}

// publishEvent writes an event to the outbox inside the caller's transaction.
func (s *server) publishEvent(ctx context.Context, tx pgx.Tx, subject string, payload any) error {
	_, err := tx.Exec(ctx, `INSERT INTO outbox(subject, payload) VALUES ($1,$2)`, subject, payload)
	return err
}

// relayOutbox publishes pending outbox rows in order. One replica of listings is
// enough for the target load; with more replicas, SKIP LOCKED keeps them from
// double-publishing (JetStream also dedupes by message id).
func (s *server) relayOutbox(ctx context.Context) {
	tick := time.NewTicker(2 * time.Second)
	cleanup := time.NewTicker(time.Hour)
	defer tick.Stop()
	for {
		select {
		case <-s.wake:
		case <-tick.C:
		case <-cleanup.C:
			_, _ = s.db.Exec(ctx, `DELETE FROM outbox WHERE published_at < now() - interval '3 days'`)
			continue
		}
		for {
			n, err := s.publishBatch(ctx)
			if err != nil {
				slog.Error("outbox relay", "err", err)
				break
			}
			if n < 100 {
				break
			}
		}
	}
}

func (s *server) publishBatch(ctx context.Context) (int, error) {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)
	rows, err := tx.Query(ctx, `SELECT id, subject, payload::text FROM outbox WHERE published_at IS NULL ORDER BY id LIMIT 100 FOR UPDATE SKIP LOCKED`)
	if err != nil {
		return 0, err
	}
	type msg struct {
		id      int64
		subject string
		payload string
	}
	var batch []msg
	for rows.Next() {
		var m msg
		if err := rows.Scan(&m.id, &m.subject, &m.payload); err != nil {
			rows.Close()
			return 0, err
		}
		batch = append(batch, m)
	}
	rows.Close()
	ids := make([]int64, 0, len(batch))
	for _, m := range batch {
		pctx, cancel := context.WithTimeout(ctx, 5*time.Second)
		_, err := s.js.Publish(pctx, m.subject, []byte(m.payload), jetstream.WithMsgID(strconv.FormatInt(m.id, 10)))
		cancel()
		if err != nil {
			break // keep order: stop at first failure, retry later
		}
		ids = append(ids, m.id)
	}
	if len(ids) > 0 {
		if _, err := tx.Exec(ctx, `UPDATE outbox SET published_at=now() WHERE id = ANY($1)`, ids); err != nil {
			return 0, err
		}
	}
	return len(ids), tx.Commit(ctx)
}
