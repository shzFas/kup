// Package httpx holds small HTTP helpers shared by all services.
package httpx

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

// UserHeader is set by the gateway after verifying the JWT. Services trust it
// because they are only reachable from the internal network.
const UserHeader = "X-User-ID"

type ErrorBody struct {
	Error   string            `json:"error"`
	Message string            `json:"message"`
	Fields  map[string]string `json:"fields,omitempty"`
}

// Error is an error that maps to an HTTP response.
type Error struct {
	Status int
	Body   ErrorBody
}

func (e *Error) Error() string { return e.Body.Error + ": " + e.Body.Message }

func NewError(status int, code, msg string) *Error {
	return &Error{Status: status, Body: ErrorBody{Error: code, Message: msg}}
}

func BadRequest(msg string) *Error { return NewError(400, "bad_request", msg) }
func NotFound() *Error             { return NewError(404, "not_found", "Не найдено") }
func Forbidden() *Error            { return NewError(403, "forbidden", "Нет доступа") }
func Unauthorized() *Error         { return NewError(401, "unauthorized", "Требуется вход") }
func Validation(fields map[string]string) *Error {
	return &Error{Status: 400, Body: ErrorBody{Error: "validation_failed", Message: "Проверьте заполнение полей", Fields: fields}}
}

func JSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if v != nil {
		_ = json.NewEncoder(w).Encode(v)
	}
}

// Fail writes err as JSON. Unknown errors become 500 and are logged.
func Fail(w http.ResponseWriter, r *http.Request, err error) {
	var he *Error
	if errors.As(err, &he) {
		JSON(w, he.Status, he.Body)
		return
	}
	slog.Error("request failed", "path", r.URL.Path, "err", err, "req_id", middleware.GetReqID(r.Context()))
	JSON(w, 500, ErrorBody{Error: "internal", Message: "Внутренняя ошибка, попробуйте позже"})
}

// Handler lets handlers return errors instead of writing them.
type Handler func(w http.ResponseWriter, r *http.Request) error

func (h Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if err := h(w, r); err != nil {
		Fail(w, r, err)
	}
}

// Decode reads a JSON body (max 1 MB) and rejects unknown fields.
func Decode(r *http.Request, v any) error {
	dec := json.NewDecoder(http.MaxBytesReader(nil, r.Body, 1<<20))
	dec.DisallowUnknownFields()
	if err := dec.Decode(v); err != nil {
		return BadRequest("Некорректный JSON: " + err.Error())
	}
	return nil
}

func UserID(r *http.Request) string { return r.Header.Get(UserHeader) }

// RequireUser returns 401 when the gateway did not attach a user.
func RequireUser(r *http.Request) (string, error) {
	id := UserID(r)
	if id == "" {
		return "", Unauthorized()
	}
	return id, nil
}

// NewRouter returns a chi router with the standard middleware and /healthz.
// Extra middleware is applied after the standard ones (chi needs all of them before routes).
func NewRouter(extra ...func(http.Handler) http.Handler) *chi.Mux {
	r := chi.NewRouter()
	r.Use(middleware.RequestID, accessLog, middleware.Recoverer)
	r.Use(extra...)
	r.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) { JSON(w, 200, map[string]string{"status": "ok"}) })
	return r
}

func accessLog(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
		next.ServeHTTP(ww, r)
		if r.URL.Path == "/healthz" {
			return
		}
		slog.Info("http", "method", r.Method, "path", r.URL.Path, "status", ww.Status(),
			"ms", time.Since(start).Milliseconds(), "req_id", middleware.GetReqID(r.Context()))
	})
}

// Serve runs the server until SIGINT/SIGTERM, then shuts down gracefully.
func Serve(addr string, h http.Handler) {
	srv := &http.Server{Addr: addr, Handler: h, ReadHeaderTimeout: 10 * time.Second}
	go func() {
		slog.Info("listening", "addr", addr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("server", "err", err)
			os.Exit(1)
		}
	}()
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	<-ctx.Done()
	sctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	_ = srv.Shutdown(sctx)
}

// SetupLogger configures JSON logging tagged with the service name.
// `<binary> healthcheck` probes /healthz and exits: the images are distroless (no curl).
func SetupLogger(service string) {
	if len(os.Args) > 1 && os.Args[1] == "healthcheck" {
		addr := os.Getenv("ADDR")
		if strings.HasPrefix(addr, ":") {
			addr = "127.0.0.1" + addr
		}
		c := http.Client{Timeout: 3 * time.Second}
		res, err := c.Get("http://" + addr + "/healthz")
		if err != nil || res.StatusCode != 200 {
			os.Exit(1)
		}
		os.Exit(0)
	}
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)).With("service", service))
}
