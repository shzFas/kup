// Auth service: phone + OTP login, JWT access tokens, rotating refresh tokens, profiles.
package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"embed"
	"encoding/base64"
	"errors"
	"fmt"
	"io/fs"
	"log/slog"
	"math/big"
	"net/http"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"kup/pkg/config"
	"kup/pkg/db"
	"kup/pkg/httpx"
	"kup/pkg/i18n"
	"kup/pkg/jwtx"
)

//go:embed migrations/*.sql
var migrations embed.FS

const (
	accessTTL   = 15 * time.Minute
	refreshTTL  = 30 * 24 * time.Hour
	otpTTL      = 5 * time.Minute
	otpResend   = 60 * time.Second
	otpAttempts = 5
)

type server struct {
	db      *pgxpool.Pool
	secret  []byte
	devMode bool
	sms     SMSSender
	admins  map[string]bool // phones that always get the admin role
}

func (s *server) roleFor(phone string) string {
	if s.admins[phone] {
		return "admin"
	}
	return "user"
}

// SMSSender delivers OTP codes. Production must plug in a self-hosted SMS gateway.
type SMSSender interface {
	Send(ctx context.Context, phone, text string) error
}

type logSender struct{}

func (logSender) Send(_ context.Context, phone, _ string) error {
	slog.Warn("SMS sending is not configured; code not delivered", "phone", maskPhone(phone))
	return nil
}

func main() {
	httpx.SetupLogger("auth")
	ctx := context.Background()
	pool, err := db.Connect(ctx, config.MustString("DATABASE_URL"))
	if err != nil {
		slog.Error("db", "err", err)
		os.Exit(1)
	}
	sub, _ := fs.Sub(migrations, "migrations")
	if err := db.Migrate(ctx, pool, sub); err != nil {
		slog.Error("migrate", "err", err)
		os.Exit(1)
	}
	s := &server{
		db:      pool,
		secret:  []byte(config.MustString("JWT_SECRET")),
		devMode: config.Bool("OTP_DEV_MODE", false),
		sms:     logSender{},
		admins:  map[string]bool{},
	}
	for _, p := range strings.Split(config.String("ADMIN_PHONES", ""), ",") {
		if p, err := normalizePhone(p, i18n.Default); err == nil {
			s.admins[p] = true
		}
	}
	if s.devMode {
		slog.Warn("OTP_DEV_MODE is on: codes are returned in API responses. Never enable in production.")
	}

	r := httpx.NewRouter()
	r.Method("POST", "/v1/auth/otp/request", httpx.Handler(s.requestOTP))
	r.Method("POST", "/v1/auth/otp/verify", httpx.Handler(s.verifyOTP))
	r.Method("POST", "/v1/auth/refresh", httpx.Handler(s.refresh))
	r.Method("POST", "/v1/auth/logout", httpx.Handler(s.logout))
	r.Method("GET", "/v1/me", httpx.Handler(s.getMe))
	r.Method("PATCH", "/v1/me", httpx.Handler(s.patchMe))
	r.Method("GET", "/internal/users/{id}", httpx.Handler(s.internalUser))

	go s.cleanupLoop(ctx)
	httpx.Serve(config.String("ADDR", ":8081"), r)
}

var (
	phoneRe   = regexp.MustCompile(`^\+[1-9]\d{7,14}$`)
	czLocalRe = regexp.MustCompile(`^[1-9]\d{8}$`)
)

// normalizePhone returns E.164. Czech local numbers (9 digits) get +420,
// "00" international prefix becomes "+". Foreign numbers (+380, +7...) are kept as is.
func normalizePhone(p string, lang i18n.Lang) (string, error) {
	p = strings.NewReplacer(" ", "", "-", "", "(", "", ")", "", ".", "").Replace(strings.TrimSpace(p))
	switch {
	case strings.HasPrefix(p, "00"):
		p = "+" + p[2:]
	case czLocalRe.MatchString(p):
		p = "+420" + p
	}
	if !phoneRe.MatchString(p) {
		return "", httpx.Validation(map[string]string{"phone": i18n.T(lang, "phone_format")})
	}
	return p, nil
}

const userCols = `id, phone, name, role, lang, created_at`

func scanUser(row pgx.Row, u *user) error {
	return row.Scan(&u.ID, &u.Phone, &u.Name, &u.Role, &u.Lang, &u.CreatedAt)
}

func hashCode(phone, code string) []byte {
	h := sha256.Sum256([]byte(phone + ":" + code))
	return h[:]
}

func (s *server) requestOTP(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		Phone string `json:"phone"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	lang := i18n.FromRequest(r)
	phone, err := normalizePhone(in.Phone, lang)
	if err != nil {
		return err
	}
	var lastSent time.Time
	err = s.db.QueryRow(r.Context(), `SELECT last_sent_at FROM otp_codes WHERE phone=$1`, phone).Scan(&lastSent)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return err
	}
	if wait := otpResend - time.Since(lastSent); err == nil && wait > 0 {
		return httpx.Err(429, "too_many_requests", "otp_wait", int(wait.Seconds())+1)
	}
	n, _ := rand.Int(rand.Reader, big.NewInt(10000))
	code := fmt.Sprintf("%04d", n.Int64())
	_, err = s.db.Exec(r.Context(), `
		INSERT INTO otp_codes(phone, code_hash, expires_at, attempts, last_sent_at) VALUES ($1,$2,$3,0,now())
		ON CONFLICT (phone) DO UPDATE SET code_hash=$2, expires_at=$3, attempts=0, last_sent_at=now()`,
		phone, hashCode(phone, code), time.Now().Add(otpTTL))
	if err != nil {
		return err
	}
	if err := s.sms.Send(r.Context(), phone, i18n.T(lang, "otp_sms", code)); err != nil {
		return err
	}
	resp := map[string]any{"sent": true, "retry_after_sec": int(otpResend.Seconds())}
	if s.devMode {
		resp["dev_code"] = code
	}
	httpx.JSON(w, 200, resp)
	return nil
}

func (s *server) verifyOTP(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		Phone string `json:"phone"`
		Code  string `json:"code"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	lang := i18n.FromRequest(r)
	phone, err := normalizePhone(in.Phone, lang)
	if err != nil {
		return err
	}
	invalid := httpx.Err(400, "invalid_code", "otp_invalid")

	tx, err := s.db.Begin(r.Context())
	if err != nil {
		return err
	}
	defer tx.Rollback(r.Context())

	var hash []byte
	var expires time.Time
	var attempts int
	err = tx.QueryRow(r.Context(), `SELECT code_hash, expires_at, attempts FROM otp_codes WHERE phone=$1 FOR UPDATE`, phone).
		Scan(&hash, &expires, &attempts)
	if errors.Is(err, pgx.ErrNoRows) {
		return invalid
	}
	if err != nil {
		return err
	}
	if time.Now().After(expires) || attempts >= otpAttempts {
		return invalid
	}
	if subtle.ConstantTimeCompare(hash, hashCode(phone, strings.TrimSpace(in.Code))) != 1 {
		if _, err := tx.Exec(r.Context(), `UPDATE otp_codes SET attempts=attempts+1 WHERE phone=$1`, phone); err != nil {
			return err
		}
		if err := tx.Commit(r.Context()); err != nil {
			return err
		}
		return invalid
	}
	if _, err := tx.Exec(r.Context(), `DELETE FROM otp_codes WHERE phone=$1`, phone); err != nil {
		return err
	}
	var u user
	err = tx.QueryRow(r.Context(), `
		INSERT INTO users(id, phone, role, lang) VALUES ($1,$2,$3,$4)
		ON CONFLICT (phone) DO UPDATE SET role = CASE WHEN $3 = 'admin' THEN 'admin' ELSE users.role END
		RETURNING `+userCols, uuid.New(), phone, s.roleFor(phone), string(lang)).Scan(&u.ID, &u.Phone, &u.Name, &u.Role, &u.Lang, &u.CreatedAt)
	if err != nil {
		return err
	}
	resp, err := s.issue(r.Context(), tx, u)
	if err != nil {
		return err
	}
	if err := tx.Commit(r.Context()); err != nil {
		return err
	}
	httpx.JSON(w, 200, resp)
	return nil
}

type user struct {
	ID        string    `json:"id"`
	Phone     string    `json:"phone"`
	Name      string    `json:"name"`
	Role      string    `json:"role"`
	Lang      string    `json:"lang"`
	CreatedAt time.Time `json:"created_at"`
}

type authResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int    `json:"expires_in"`
	User         user   `json:"user"`
}

func (s *server) issue(ctx context.Context, tx pgx.Tx, u user) (*authResponse, error) {
	access, err := jwtx.Sign(s.secret, u.ID, u.Role, accessTTL)
	if err != nil {
		return nil, err
	}
	raw := make([]byte, 32)
	_, _ = rand.Read(raw)
	refresh := base64.RawURLEncoding.EncodeToString(raw)
	h := sha256.Sum256([]byte(refresh))
	_, err = tx.Exec(ctx, `INSERT INTO refresh_tokens(id, user_id, token_hash, expires_at) VALUES ($1,$2,$3,$4)`,
		uuid.New(), u.ID, h[:], time.Now().Add(refreshTTL))
	if err != nil {
		return nil, err
	}
	return &authResponse{AccessToken: access, RefreshToken: refresh, ExpiresIn: int(accessTTL.Seconds()), User: u}, nil
}

func (s *server) refresh(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		RefreshToken string `json:"refresh_token"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	h := sha256.Sum256([]byte(in.RefreshToken))
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		return err
	}
	defer tx.Rollback(r.Context())

	var id, userID string
	var expires time.Time
	var revoked *time.Time
	err = tx.QueryRow(r.Context(), `SELECT id, user_id, expires_at, revoked_at FROM refresh_tokens WHERE token_hash=$1 FOR UPDATE`, h[:]).
		Scan(&id, &userID, &expires, &revoked)
	if errors.Is(err, pgx.ErrNoRows) {
		return httpx.Unauthorized()
	}
	if err != nil {
		return err
	}
	if revoked != nil {
		// A rotated token was used again: likely stolen. Revoke the whole family.
		slog.Warn("refresh token reuse detected", "user_id", userID)
		_, _ = tx.Exec(r.Context(), `UPDATE refresh_tokens SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL`, userID)
		_ = tx.Commit(r.Context())
		return httpx.Unauthorized()
	}
	if time.Now().After(expires) {
		return httpx.Unauthorized()
	}
	if _, err := tx.Exec(r.Context(), `UPDATE refresh_tokens SET revoked_at=now() WHERE id=$1`, id); err != nil {
		return err
	}
	var u user
	if err := scanUser(tx.QueryRow(r.Context(), `SELECT `+userCols+` FROM users WHERE id=$1`, userID), &u); err != nil {
		return err
	}
	resp, err := s.issue(r.Context(), tx, u)
	if err != nil {
		return err
	}
	if err := tx.Commit(r.Context()); err != nil {
		return err
	}
	httpx.JSON(w, 200, resp)
	return nil
}

func (s *server) logout(w http.ResponseWriter, r *http.Request) error {
	uid, err := httpx.RequireUser(r)
	if err != nil {
		return err
	}
	var in struct {
		RefreshToken string `json:"refresh_token"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	h := sha256.Sum256([]byte(in.RefreshToken))
	_, err = s.db.Exec(r.Context(), `UPDATE refresh_tokens SET revoked_at=now() WHERE token_hash=$1 AND user_id=$2 AND revoked_at IS NULL`, h[:], uid)
	if err != nil {
		return err
	}
	w.WriteHeader(204)
	return nil
}

func (s *server) loadUser(ctx context.Context, id string) (*user, error) {
	if _, err := uuid.Parse(id); err != nil {
		return nil, httpx.NotFound()
	}
	var u user
	err := scanUser(s.db.QueryRow(ctx, `SELECT `+userCols+` FROM users WHERE id=$1`, id), &u)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, httpx.NotFound()
	}
	return &u, err
}

func (s *server) getMe(w http.ResponseWriter, r *http.Request) error {
	uid, err := httpx.RequireUser(r)
	if err != nil {
		return err
	}
	u, err := s.loadUser(r.Context(), uid)
	if err != nil {
		return err
	}
	httpx.JSON(w, 200, u)
	return nil
}

func (s *server) patchMe(w http.ResponseWriter, r *http.Request) error {
	uid, err := httpx.RequireUser(r)
	if err != nil {
		return err
	}
	var in struct {
		Name *string `json:"name"`
		Lang *string `json:"lang"`
	}
	if err := httpx.Decode(r, &in); err != nil {
		return err
	}
	lang := i18n.FromRequest(r)
	errs := map[string]string{}
	var name, newLang *string
	if in.Name != nil {
		n := strings.TrimSpace(*in.Name)
		if l := len([]rune(n)); l < 1 || l > 60 {
			errs["name"] = i18n.T(lang, "name_length")
		}
		name = &n
	}
	if in.Lang != nil {
		if !i18n.Valid(*in.Lang) {
			errs["lang"] = i18n.T(lang, "lang_invalid")
		}
		newLang = in.Lang
	}
	if len(errs) > 0 {
		return httpx.Validation(errs)
	}
	if _, err := s.db.Exec(r.Context(), `UPDATE users SET name=COALESCE($1, name), lang=COALESCE($2, lang), updated_at=now() WHERE id=$3`,
		name, newLang, uid); err != nil {
		return err
	}
	u, err := s.loadUser(r.Context(), uid)
	if err != nil {
		return err
	}
	httpx.JSON(w, 200, u)
	return nil
}

// internalUser is used by listings for seller info and phone reveal. Not routed by the gateway.
func (s *server) internalUser(w http.ResponseWriter, r *http.Request) error {
	u, err := s.loadUser(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		return err
	}
	httpx.JSON(w, 200, u)
	return nil
}

func (s *server) cleanupLoop(ctx context.Context) {
	t := time.NewTicker(time.Hour)
	defer t.Stop()
	for range t.C {
		_, _ = s.db.Exec(ctx, `DELETE FROM otp_codes WHERE expires_at < now() - interval '1 hour'`)
		_, _ = s.db.Exec(ctx, `DELETE FROM refresh_tokens WHERE expires_at < now() OR revoked_at < now() - interval '7 days'`)
	}
}

func maskPhone(p string) string {
	if len(p) < 6 {
		return "***"
	}
	return p[:4] + strings.Repeat("*", len(p)-6) + p[len(p)-2:]
}
