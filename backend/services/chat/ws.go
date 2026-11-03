package main

import (
	"context"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/coder/websocket"

	"kup/pkg/httpx"
)

// hub keeps this instance's open sockets by user id.
type hub struct {
	mu    sync.Mutex
	conns map[string]map[*client]struct{}
}

type client struct {
	out chan []byte
}

func newHub() *hub { return &hub{conns: map[string]map[*client]struct{}{}} }

func (h *hub) add(uid string, c *client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.conns[uid] == nil {
		h.conns[uid] = map[*client]struct{}{}
	}
	h.conns[uid][c] = struct{}{}
}

func (h *hub) remove(uid string, c *client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.conns[uid], c)
	if len(h.conns[uid]) == 0 {
		delete(h.conns, uid)
	}
}

// deliver hands an event to every socket of uid. A socket that can't keep up is skipped
// for this event; the client re-syncs over REST after reconnecting anyway.
func (h *hub) deliver(uid string, data []byte) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for c := range h.conns[uid] {
		select {
		case c.out <- data:
		default:
		}
	}
}

const (
	closeUnauthorized websocket.StatusCode = 4401
	pingEvery                              = 30 * time.Second
)

func (s *server) ws(w http.ResponseWriter, r *http.Request) {
	// Auth is a bearer token in the query, not a cookie, so cross-site pages can't
	// ride on the user's session: the origin check adds nothing here.
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{InsecureSkipVerify: true})
	if err != nil {
		return
	}
	uid := httpx.UserID(r)
	if uid == "" || r.Header.Get("X-Auth-Failed") != "" {
		conn.Close(closeUnauthorized, "unauthorized")
		return
	}
	ctx := conn.CloseRead(r.Context()) // the client never sends anything
	c := &client{out: make(chan []byte, 64)}
	s.hub.add(uid, c)
	defer s.hub.remove(uid, c)

	ping := time.NewTicker(pingEvery)
	defer ping.Stop()
	for {
		select {
		case <-ctx.Done():
			conn.Close(websocket.StatusNormalClosure, "")
			return
		case msg := <-c.out:
			wctx, cancel := context.WithTimeout(ctx, 10*time.Second)
			err := conn.Write(wctx, websocket.MessageText, msg)
			cancel()
			if err != nil {
				return
			}
		case <-ping.C:
			pctx, cancel := context.WithTimeout(ctx, 10*time.Second)
			err := conn.Ping(pctx)
			cancel()
			if err != nil {
				slog.Debug("ws ping failed", "err", err)
				return
			}
		}
	}
}
