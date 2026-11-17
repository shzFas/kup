package clients

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"
)

// UserInfo is the public part of a user, as returned by auth /internal/users/{id}.
type UserInfo struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Lang string `json:"lang"`
}

// Users looks up users in the auth service with a short cache.
type Users struct {
	base string
	http *http.Client

	mu    sync.Mutex
	cache map[string]cached[UserInfo]
}

func NewUsers(base string) *Users {
	return &Users{base: base, http: &http.Client{Timeout: 5 * time.Second}, cache: map[string]cached[UserInfo]{}}
}

func (u *Users) Get(ctx context.Context, id string) (UserInfo, error) {
	u.mu.Lock()
	if c, ok := u.cache[id]; ok && time.Since(c.at) < 5*time.Minute {
		u.mu.Unlock()
		return c.v, nil
	}
	u.mu.Unlock()
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, u.base+"/internal/users/"+id, nil)
	res, err := u.http.Do(req)
	if err != nil {
		return UserInfo{}, err
	}
	defer res.Body.Close()
	if res.StatusCode == 404 {
		return UserInfo{}, ErrNotFound
	}
	if res.StatusCode != 200 {
		return UserInfo{}, fmt.Errorf("auth users: %d", res.StatusCode)
	}
	var v UserInfo
	if err := json.NewDecoder(res.Body).Decode(&v); err != nil {
		return UserInfo{}, err
	}
	u.mu.Lock()
	if len(u.cache) > 50000 {
		u.cache = map[string]cached[UserInfo]{}
	}
	u.cache[id] = cached[UserInfo]{v, time.Now()}
	u.mu.Unlock()
	return v, nil
}

// Forget drops a cached user (after a profile change).
func (u *Users) Forget(id string) {
	u.mu.Lock()
	delete(u.cache, id)
	u.mu.Unlock()
}
