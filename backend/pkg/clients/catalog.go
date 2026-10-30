// Package clients holds HTTP clients for internal service-to-service calls.
package clients

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"
)

// Schema mirrors the catalog schema response (docs/API.md) plus internal fields.
type Schema struct {
	Category   string      `json:"category"`
	Name       string      `json:"name"`
	Groups     []Group     `json:"groups"`
	Attributes []Attribute `json:"attributes"`
	Filters    []Filter    `json:"filters"`
	Sorts      []Option    `json:"sorts"`
	Highlights []string    `json:"highlights"`
}

type Group struct {
	Key   string `json:"key"`
	Label string `json:"label"`
}

type Option struct {
	Value string `json:"value"`
	Label string `json:"label"`
}

type DependsOn struct {
	Key    string   `json:"key"`
	Values []string `json:"values"`
}

type Attribute struct {
	Key       string     `json:"key"`
	Type      string     `json:"type"`
	Label     string     `json:"label"`
	Group     string     `json:"group"`
	Required  bool       `json:"required"`
	Ref       *string    `json:"ref"`
	Parent    *string    `json:"parent"`
	Options   []Option   `json:"options"`
	Min       *float64   `json:"min"`
	Max       *float64   `json:"max"`
	Step      *float64   `json:"step"`
	Unit      *string    `json:"unit"`
	DependsOn *DependsOn `json:"depends_on"`
	Computed  bool       `json:"computed"`
}

type Filter struct {
	Key       string     `json:"key"`
	Label     string     `json:"label"`
	Widget    string     `json:"widget"`
	Type      string     `json:"type"`
	Group     string     `json:"group"`
	Ref       *string    `json:"ref"`
	Parent    *string    `json:"parent"`
	Options   []Option   `json:"options"`
	Min       *float64   `json:"min"`
	Max       *float64   `json:"max"`
	Step      *float64   `json:"step"`
	Unit      *string    `json:"unit"`
	Presets   []float64  `json:"presets"`
	Pinned    bool       `json:"pinned"`
	Facet     bool       `json:"facet"`
	DependsOn *DependsOn `json:"depends_on"`
}

// RefItem is a dictionary entry (make, model, city...).
type RefItem struct {
	ID      string   `json:"id"`
	Name    string   `json:"name"`
	Parent  *string  `json:"parent"`
	Aliases []string `json:"aliases,omitempty"`
}

// Catalog fetches schemas and refs from the catalog service and caches them.
// Catalog data changes only on deploy, so a few minutes of staleness is fine.
type Catalog struct {
	base string
	http *http.Client
	ttl  time.Duration

	mu      sync.Mutex
	schemas map[string]cached[*Schema]
	refs    cached[map[string]map[string]RefItem] // ref type -> id -> item
}

type cached[T any] struct {
	v  T
	at time.Time
}

func NewCatalog(base string) *Catalog {
	return &Catalog{base: base, http: &http.Client{Timeout: 5 * time.Second}, ttl: 5 * time.Minute, schemas: map[string]cached[*Schema]{}}
}

func (c *Catalog) get(ctx context.Context, path string, v any) error {
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, c.base+path, nil)
	res, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode == 404 {
		return ErrNotFound
	}
	if res.StatusCode != 200 {
		return fmt.Errorf("catalog %s: status %d", path, res.StatusCode)
	}
	return json.NewDecoder(res.Body).Decode(v)
}

var ErrNotFound = fmt.Errorf("not found")

// Schema returns the category schema; ErrNotFound for unknown categories.
func (c *Catalog) Schema(ctx context.Context, slug string) (*Schema, error) {
	c.mu.Lock()
	if s, ok := c.schemas[slug]; ok && time.Since(s.at) < c.ttl {
		c.mu.Unlock()
		return s.v, nil
	}
	c.mu.Unlock()
	var s Schema
	if err := c.get(ctx, "/v1/categories/"+slug+"/schema", &s); err != nil {
		return nil, err
	}
	c.mu.Lock()
	c.schemas[slug] = cached[*Schema]{&s, time.Now()}
	c.mu.Unlock()
	return &s, nil
}

// Categories lists category slugs.
func (c *Catalog) Categories(ctx context.Context) ([]string, error) {
	var res struct {
		Items []struct {
			Slug string `json:"slug"`
		} `json:"items"`
	}
	if err := c.get(ctx, "/v1/categories", &res); err != nil {
		return nil, err
	}
	out := make([]string, len(res.Items))
	for i, it := range res.Items {
		out[i] = it.Slug
	}
	return out, nil
}

// Refs returns all dictionaries indexed by type and id.
func (c *Catalog) Refs(ctx context.Context) (map[string]map[string]RefItem, error) {
	c.mu.Lock()
	if c.refs.v != nil && time.Since(c.refs.at) < c.ttl {
		v := c.refs.v
		c.mu.Unlock()
		return v, nil
	}
	c.mu.Unlock()
	var raw map[string][]RefItem
	if err := c.get(ctx, "/internal/refs", &raw); err != nil {
		return nil, err
	}
	out := make(map[string]map[string]RefItem, len(raw))
	for t, items := range raw {
		m := make(map[string]RefItem, len(items))
		for _, it := range items {
			m[it.ID] = it
		}
		out[t] = m
	}
	c.mu.Lock()
	c.refs = cached[map[string]map[string]RefItem]{out, time.Now()}
	c.mu.Unlock()
	return out, nil
}
