package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"kup/pkg/events"
	"kup/pkg/httpx"
)

// Links in descriptions are a classic way to lure buyers off the platform.
var linkRe = regexp.MustCompile(`(?i)(https?://|www\.|t\.me/|wa\.me/|\b[a-z0-9-]+\.(ru|kz|com|net|org|io|me|su)\b)`)

func hasLink(s string) bool { return linkRe.MatchString(s) }

func isModerator(r *http.Request) bool {
	role := r.Header.Get(httpx.RoleHeader)
	return httpx.UserID(r) != "" && (role == "moderator" || role == "admin")
}

type pricePoint struct {
	Price int64     `json:"price"`
	At    time.Time `json:"at"`
}

func (s *server) priceHistory(ctx context.Context, id string) []pricePoint {
	out := []pricePoint{}
	rows, err := s.db.Query(ctx, `SELECT price, at FROM listing_prices WHERE listing_id=$1 ORDER BY at LIMIT 100`, id)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var p pricePoint
		if rows.Scan(&p.Price, &p.At) == nil {
			out = append(out, p)
		}
	}
	return out
}

// expireLoop moves listings past expires_at to "expired" and removes them from search.
func (s *server) expireLoop(ctx context.Context) {
	t := time.NewTicker(5 * time.Minute)
	defer t.Stop()
	for {
		if n, err := s.expireBatch(ctx); err != nil {
			slog.Error("expire listings", "err", err)
		} else if n > 0 {
			slog.Info("listings expired", "n", n)
		}
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
	}
}

func (s *server) expireBatch(ctx context.Context) (int, error) {
	total := 0
	for {
		n := 0
		err := s.inTx(ctx, func(tx pgx.Tx) error {
			rows, err := tx.Query(ctx, `UPDATE listings SET status='expired', updated_at=now()
				WHERE id IN (SELECT id FROM listings WHERE status='active' AND expires_at < now() LIMIT 200 FOR UPDATE SKIP LOCKED)
				RETURNING id::text`)
			if err != nil {
				return err
			}
			var ids []string
			for rows.Next() {
				var id string
				if err := rows.Scan(&id); err != nil {
					rows.Close()
					return err
				}
				ids = append(ids, id)
			}
			rows.Close()
			for _, id := range ids {
				if err := s.publishEvent(ctx, tx, events.SubjectRemoved, events.ListingRemoved{ID: id}); err != nil {
					return err
				}
			}
			n = len(ids)
			return nil
		})
		total += n
		if err != nil || n < 200 {
			return total, err
		}
	}
}

// ---------- internal API for chat and notify ----------

func (s *server) brief(w http.ResponseWriter, r *http.Request) error {
	l, err := s.byID(r.Context(), chi.URLParam(r, "id"), nil)
	if err != nil {
		return err
	}
	var photo *string
	if len(l.Photos) > 0 {
		p := photoURL(l.Photos[0], true)
		photo = &p
	}
	httpx.JSON(w, 200, map[string]any{
		"id": l.ID, "user_id": l.UserID, "title": l.Title, "photo": photo,
		"price": l.Price, "currency": l.Currency, "status": l.Status,
	})
	return nil
}

func (s *server) favoriteUsers(w http.ResponseWriter, r *http.Request) error {
	id := r.URL.Query().Get("listing_id")
	if _, err := uuid.Parse(id); err != nil {
		return httpx.BadRequest("listing_id")
	}
	rows, err := s.db.Query(r.Context(), `SELECT user_id::text FROM favorites WHERE listing_id=$1 LIMIT 10000`, id)
	if err != nil {
		return err
	}
	defer rows.Close()
	ids := []string{}
	for rows.Next() {
		var u string
		if rows.Scan(&u) == nil {
			ids = append(ids, u)
		}
	}
	httpx.JSON(w, 200, map[string]any{"user_ids": ids})
	return rows.Err()
}

// ---------- reports ----------

var reportReasons = map[string]bool{"fraud": true, "wrong_price": true, "sold": true, "duplicate": true,
	"wrong_category": true, "offensive": true, "other": true}

func (s *server) createReport(w http.ResponseWriter, r *http.Request) error {
	uid, err := httpx.RequireUser(r)
	if err != nil {
		return err
	}
	var in struct {
		ListingID string `json:"listing_id"`
		Reason    string `json:"reason"`
		Comment   string `json:"comment"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	if !reportReasons[in.Reason] {
		return httpx.Validation(map[string]string{"reason": "Выберите причину"})
	}
	if len([]rune(in.Comment)) > 1000 {
		return httpx.Validation(map[string]string{"comment": "Не более 1000 символов"})
	}
	l, err := s.byID(r.Context(), in.ListingID, nil)
	if err != nil {
		return err
	}
	if l.UserID == uid {
		return httpx.BadRequest("Нельзя пожаловаться на своё объявление")
	}
	_, err = s.db.Exec(r.Context(), `INSERT INTO reports(id, listing_id, reporter_id, reason, comment) VALUES ($1,$2,$3,$4,$5)
		ON CONFLICT (listing_id, reporter_id) DO NOTHING`, uuid.New(), l.ID, uid, in.Reason, strings.TrimSpace(in.Comment))
	if err != nil {
		return err
	}
	w.WriteHeader(204)
	return nil
}

func page(r *http.Request) (limit, offset int) {
	p, _ := strconv.Atoi(r.URL.Query().Get("page"))
	if p < 1 {
		p = 1
	}
	return 30, (p - 1) * 30
}

func (s *server) adminReports(w http.ResponseWriter, r *http.Request) error {
	if _, err := httpx.RequireModerator(r); err != nil {
		return err
	}
	status := r.URL.Query().Get("status")
	if status == "" {
		status = "open"
	}
	limit, offset := page(r)
	var total int
	if err := s.db.QueryRow(r.Context(), `SELECT count(*) FROM reports WHERE status=$1`, status).Scan(&total); err != nil {
		return err
	}
	rows, err := s.db.Query(r.Context(), `
		SELECT rp.id, rp.reason, rp.comment, rp.reporter_id, rp.status, rp.created_at,
		       (SELECT count(*) FROM reports x WHERE x.listing_id = rp.listing_id AND x.status='open'), `+prefixed("l.")+`
		FROM reports rp JOIN listings l ON l.id = rp.listing_id
		WHERE rp.status=$1 ORDER BY rp.created_at DESC LIMIT $2 OFFSET $3`, status, limit, offset)
	if err != nil {
		return err
	}
	defer rows.Close()
	type report struct {
		ID         string    `json:"id"`
		Listing    card      `json:"listing"`
		Reason     string    `json:"reason"`
		Comment    string    `json:"comment"`
		ReporterID string    `json:"reporter_id"`
		Status     string    `json:"status"`
		CreatedAt  time.Time `json:"created_at"`
		Count      int       `json:"reports_for_listing"`
	}
	items := []report{}
	for rows.Next() {
		var rp report
		var l row
		err := rows.Scan(&rp.ID, &rp.Reason, &rp.Comment, &rp.ReporterID, &rp.Status, &rp.CreatedAt, &rp.Count,
			&l.ID, &l.UserID, &l.Category, &l.Status, &l.Title, &l.Description, &l.Price, &l.Currency, &l.PriceSuffix,
			&l.City, &l.Lat, &l.Lng, &l.Attributes, &l.Labels, &l.Highlights, &l.SearchText, &l.Photos, &l.Views,
			&l.PublishedAt, &l.UpdatedAt, &l.ExpiresAt, &l.ModReason)
		if err != nil {
			return err
		}
		rp.Listing = s.toCard(r.Context(), &l, true)
		items = append(items, rp)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	httpx.JSON(w, 200, map[string]any{"items": items, "total": total})
	return nil
}

func (s *server) resolveReport(w http.ResponseWriter, r *http.Request) error {
	mod, err := httpx.RequireModerator(r)
	if err != nil {
		return err
	}
	var in struct {
		Action string `json:"action"`
		Reason string `json:"reason"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	if in.Action != "dismiss" && in.Action != "block" {
		return httpx.Validation(map[string]string{"action": "dismiss или block"})
	}
	id := chi.URLParam(r, "id")
	if _, err := uuid.Parse(id); err != nil {
		return httpx.NotFound()
	}
	err = s.inTx(r.Context(), func(tx pgx.Tx) error {
		var listingID string
		err := tx.QueryRow(r.Context(), `UPDATE reports SET status='resolved', resolution=$2, resolved_by=$3, resolved_at=now()
			WHERE id=$1 RETURNING listing_id::text`, id, in.Action, mod).Scan(&listingID)
		if errors.Is(err, pgx.ErrNoRows) {
			return httpx.NotFound()
		}
		if err != nil || in.Action == "dismiss" {
			return err
		}
		if _, err := tx.Exec(r.Context(), `UPDATE reports SET status='resolved', resolution='block', resolved_by=$2, resolved_at=now()
			WHERE listing_id=$1 AND status='open'`, listingID, mod); err != nil {
			return err
		}
		return s.setBlocked(r.Context(), tx, listingID, true, in.Reason)
	})
	if err != nil {
		return err
	}
	w.WriteHeader(204)
	return nil
}

// setBlocked blocks or unblocks a listing within tx and syncs search.
func (s *server) setBlocked(ctx context.Context, tx pgx.Tx, id string, block bool, reason string) error {
	l, err := s.byID(ctx, id, tx)
	if err != nil {
		return err
	}
	if block {
		reason = strings.TrimSpace(reason)
		if reason == "" {
			reason = "Нарушение правил размещения"
		}
		l.Status, l.ModReason = "blocked", &reason
	} else {
		if l.Status != "blocked" {
			return nil
		}
		l.Status, l.ModReason = "active", nil
		l.PublishedAt = time.Now().UTC().Truncate(time.Microsecond)
		l.ExpiresAt = l.PublishedAt.Add(listingTTL)
	}
	_, err = tx.Exec(ctx, `UPDATE listings SET status=$2, moderation_reason=$3, published_at=$4, expires_at=$5, updated_at=now() WHERE id=$1`,
		l.ID, l.Status, l.ModReason, l.PublishedAt, l.ExpiresAt)
	if err != nil {
		return err
	}
	return s.enqueue(ctx, tx, l)
}

func (s *server) blockListing(w http.ResponseWriter, r *http.Request) error {
	if _, err := httpx.RequireModerator(r); err != nil {
		return err
	}
	var in struct {
		Reason string `json:"reason"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	if err := s.inTx(r.Context(), func(tx pgx.Tx) error { return s.setBlocked(r.Context(), tx, chi.URLParam(r, "id"), true, in.Reason) }); err != nil {
		return err
	}
	w.WriteHeader(204)
	return nil
}

func (s *server) unblockListing(w http.ResponseWriter, r *http.Request) error {
	if _, err := httpx.RequireModerator(r); err != nil {
		return err
	}
	if err := s.inTx(r.Context(), func(tx pgx.Tx) error { return s.setBlocked(r.Context(), tx, chi.URLParam(r, "id"), false, "") }); err != nil {
		return err
	}
	w.WriteHeader(204)
	return nil
}

func (s *server) adminListings(w http.ResponseWriter, r *http.Request) error {
	if _, err := httpx.RequireModerator(r); err != nil {
		return err
	}
	q := r.URL.Query()
	where := []string{"status<>'deleted'"}
	var args []any
	add := func(cond string, v any) {
		args = append(args, v)
		where = append(where, strings.ReplaceAll(cond, "?", "$"+strconv.Itoa(len(args))))
	}
	if st := q.Get("status"); st != "" {
		add("status = ?", st)
	}
	if u := q.Get("user_id"); u != "" {
		if _, err := uuid.Parse(u); err != nil {
			return httpx.BadRequest("user_id")
		}
		add("user_id = ?", u)
	}
	if text := strings.TrimSpace(q.Get("q")); text != "" {
		add("(title ILIKE ? OR description ILIKE ?)", "%"+strings.NewReplacer("%", `\%`, "_", `\_`).Replace(text)+"%")
	}
	cond := strings.Join(where, " AND ")
	var total int
	if err := s.db.QueryRow(r.Context(), `SELECT count(*) FROM listings WHERE `+cond, args...).Scan(&total); err != nil {
		return err
	}
	limit, offset := page(r)
	args = append(args, limit, offset)
	rows, err := s.db.Query(r.Context(), `SELECT `+cols+` FROM listings WHERE `+cond+
		` ORDER BY updated_at DESC LIMIT $`+strconv.Itoa(len(args)-1)+` OFFSET $`+strconv.Itoa(len(args)), args...)
	if err != nil {
		return err
	}
	defer rows.Close()
	items := []card{}
	for rows.Next() {
		l, err := scanRow(rows)
		if err != nil {
			return err
		}
		items = append(items, s.toCard(r.Context(), l, true))
	}
	httpx.JSON(w, 200, map[string]any{"items": items, "total": total})
	return rows.Err()
}
