// Gateway: the only public entry point. Verifies JWTs, rate-limits by IP,
// handles CORS and routes /v1/* to services and /media/* to object storage.
package main

import (
	"log/slog"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5/middleware"
	"golang.org/x/time/rate"

	"kup/pkg/config"
	"kup/pkg/httpx"
	"kup/pkg/i18n"
	"kup/pkg/jwtx"
)

func main() {
	httpx.SetupLogger("gateway")
	secret := []byte(config.MustString("JWT_SECRET"))

	auth := proxy(config.String("AUTH_URL", "http://auth:8081"))
	catalog := proxy(config.String("CATALOG_URL", "http://catalog:8082"))
	listings := proxy(config.String("LISTINGS_URL", "http://listings:8083"))
	search := proxy(config.String("SEARCH_URL", "http://search:8084"))
	notify := proxy(config.String("NOTIFY_URL", "http://notify:8085"))
	chat := proxy(config.String("CHAT_URL", "http://chat:8086"))
	media := mediaProxy(config.String("S3_URL", "http://minio:9000"), config.String("S3_BUCKET", "media"))

	limiter := newIPLimiter(rate.Limit(config.Int("RATE_LIMIT_RPS", 20)), config.Int("RATE_LIMIT_BURST", 60))
	otpLimiter := newIPLimiter(rate.Every(20*time.Second), 5) // OTP requests are expensive (SMS)

	var mw []func(http.Handler) http.Handler
	if config.Bool("TRUST_PROXY", false) {
		// Only behind our own load balancer: otherwise clients could spoof X-Forwarded-For.
		mw = append(mw, middleware.RealIP)
	}
	mw = append(mw, cors(strings.Split(config.String("CORS_ORIGINS", "*"), ",")), limiter.middleware, withUser(secret))
	r := httpx.NewRouter(mw...)

	r.With(otpLimiter.middleware).Handle("/v1/auth/otp/request", auth)
	r.Handle("/v1/auth/*", auth)
	r.Handle("/v1/me", auth)
	r.Handle("/v1/categories", catalog)
	r.Handle("/v1/categories/*", catalog)
	r.Handle("/v1/refs/*", catalog)
	r.Handle("/v1/suggest", catalog)
	r.Handle("/v1/listings", listings)
	r.Handle("/v1/listings/*", listings)
	r.Handle("/v1/me/saved-searches", notify)
	r.Handle("/v1/me/saved-searches/*", notify)
	r.Handle("/v1/me/notifications", notify)
	r.Handle("/v1/me/notifications/*", notify)
	r.Handle("/v1/me/*", listings)
	r.Handle("/v1/reports", listings)
	r.Handle("/v1/admin/*", listings)
	r.Handle("/v1/chats", chat)
	r.Handle("/v1/chats/*", chat)
	r.Handle("/v1/ws", chat)
	r.With(maxBody(12<<20)).Handle("/v1/media/*", listings)
	r.Handle("/v1/search", search)
	r.Handle("/v1/search/*", search)
	r.Get("/media/photos/*", media)
	r.NotFound(func(w http.ResponseWriter, req *http.Request) {
		httpx.JSON(w, 404, httpx.ErrorBody{Error: "not_found", Message: i18n.T(i18n.FromRequest(req), "not_found")})
	})

	httpx.Serve(config.String("ADDR", ":8080"), r)
}

func proxy(target string) http.Handler {
	u, err := url.Parse(target)
	if err != nil {
		panic(err)
	}
	p := httputil.NewSingleHostReverseProxy(u)
	p.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		slog.Error("upstream", "target", target, "path", r.URL.Path, "err", err)
		httpx.JSON(w, 502, httpx.ErrorBody{Error: "unavailable", Message: i18n.T(i18n.FromRequest(r), "unavailable")})
	}
	return p
}

// mediaProxy serves public photos from the bucket. Only GET of photos/* is allowed.
func mediaProxy(s3URL, bucket string) http.HandlerFunc {
	u, _ := url.Parse(s3URL)
	p := &httputil.ReverseProxy{
		Rewrite: func(pr *httputil.ProxyRequest) {
			pr.SetURL(u)
			pr.Out.URL.Path = "/" + bucket + strings.TrimPrefix(pr.In.URL.Path, "/media")
			pr.Out.URL.RawQuery = ""
			pr.Out.Header.Del("Authorization")
			pr.Out.Header.Del("Cookie")
		},
		ModifyResponse: func(res *http.Response) error {
			for _, h := range []string{"X-Amz-Request-Id", "X-Amz-Id-2", "Server", "X-Minio-Deployment-Id"} {
				res.Header.Del(h)
			}
			if res.StatusCode == 200 {
				res.Header.Set("Cache-Control", "public, max-age=31536000, immutable")
			}
			return nil
		},
	}
	return func(w http.ResponseWriter, r *http.Request) {
		if strings.Contains(r.URL.Path, "..") {
			http.NotFound(w, r)
			return
		}
		p.ServeHTTP(w, r)
	}
}

// withUser replaces any client-sent identity headers with the verified token
// subject and role. An invalid or expired token is a 401 so clients know to refresh.
// WebSocket clients can't set headers, so /v1/ws takes the token from ?access_token=.
func withUser(secret []byte) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			r.Header.Del(httpx.UserHeader)
			r.Header.Del(httpx.RoleHeader)
			token, hasToken := "", false
			if h := r.Header.Get("Authorization"); h != "" {
				token, hasToken = strings.CutPrefix(h, "Bearer ")
				if !hasToken {
					token, hasToken = "", true // malformed header -> 401 below
				}
			} else if r.URL.Path == "/v1/ws" {
				q := r.URL.Query()
				token, hasToken = q.Get("access_token"), q.Has("access_token")
				q.Del("access_token")
				r.URL.RawQuery = q.Encode()
			}
			if hasToken {
				uid, role, err := jwtx.Verify(secret, token)
				if err != nil {
					if r.URL.Path == "/v1/ws" {
						// Let the upgrade happen so the chat service can close with 4401.
						r.Header.Set("X-Auth-Failed", "1")
						next.ServeHTTP(w, r)
						return
					}
					httpx.JSON(w, 401, httpx.ErrorBody{Error: "unauthorized", Message: i18n.T(i18n.FromRequest(r), "session_expired")})
					return
				}
				r.Header.Set(httpx.UserHeader, uid)
				r.Header.Set(httpx.RoleHeader, role)
			}
			next.ServeHTTP(w, r)
		})
	}
}

func cors(origins []string) func(http.Handler) http.Handler {
	allowAll := len(origins) == 1 && origins[0] == "*"
	allowed := map[string]bool{}
	for _, o := range origins {
		allowed[strings.TrimSpace(o)] = true
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			if origin != "" && (allowAll || allowed[origin]) {
				h := w.Header()
				h.Set("Access-Control-Allow-Origin", origin)
				h.Set("Vary", "Origin")
				h.Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
				h.Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
				h.Set("Access-Control-Max-Age", "600")
			}
			if r.Method == http.MethodOptions {
				w.WriteHeader(204)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func maxBody(n int64) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			r.Body = http.MaxBytesReader(w, r.Body, n)
			next.ServeHTTP(w, r)
		})
	}
}

// ipLimiter is an in-memory token bucket per client IP. Fine for a single gateway
// replica; with several replicas move it to Redis or sticky load balancing.
type ipLimiter struct {
	mu    sync.Mutex
	r     rate.Limit
	burst int
	ips   map[string]*entry
}

type entry struct {
	l    *rate.Limiter
	seen time.Time
}

func newIPLimiter(r rate.Limit, burst int) *ipLimiter {
	l := &ipLimiter{r: r, burst: burst, ips: map[string]*entry{}}
	go func() {
		for range time.Tick(time.Minute) {
			l.mu.Lock()
			for ip, e := range l.ips {
				if time.Since(e.seen) > 10*time.Minute {
					delete(l.ips, ip)
				}
			}
			l.mu.Unlock()
		}
	}()
	return l
}

func (l *ipLimiter) middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/healthz" || strings.HasPrefix(r.URL.Path, "/media/") {
			next.ServeHTTP(w, r)
			return
		}
		ip, _, err := net.SplitHostPort(r.RemoteAddr)
		if err != nil {
			ip = r.RemoteAddr
		}
		l.mu.Lock()
		e, ok := l.ips[ip]
		if !ok {
			e = &entry{l: rate.NewLimiter(l.r, l.burst)}
			l.ips[ip] = e
		}
		e.seen = time.Now()
		allow := e.l.Allow()
		l.mu.Unlock()
		if !allow {
			w.Header().Set("Retry-After", "1")
			httpx.JSON(w, 429, httpx.ErrorBody{Error: "too_many_requests", Message: i18n.T(i18n.FromRequest(r), "rate_limited")})
			return
		}
		next.ServeHTTP(w, r)
	})
}
