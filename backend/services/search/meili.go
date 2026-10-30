package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// meili is a minimal Meilisearch HTTP client (only what we use).
type meili struct {
	base  string
	key   string
	index string
	http  *http.Client
}

func (m *meili) do(ctx context.Context, method, path string, body, out any) error {
	var rd io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return err
		}
		rd = bytes.NewReader(b)
	}
	req, _ := http.NewRequestWithContext(ctx, method, m.base+path, rd)
	req.Header.Set("Content-Type", "application/json")
	if m.key != "" {
		req.Header.Set("Authorization", "Bearer "+m.key)
	}
	res, err := m.http.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	data, _ := io.ReadAll(res.Body)
	if res.StatusCode >= 300 {
		return &meiliError{Status: res.StatusCode, Body: string(data)}
	}
	if out != nil {
		return json.Unmarshal(data, out)
	}
	return nil
}

type meiliError struct {
	Status int
	Body   string
}

func (e *meiliError) Error() string { return fmt.Sprintf("meilisearch %d: %s", e.Status, e.Body) }

type task struct {
	TaskUID int64 `json:"taskUid"`
}

// waitTask blocks until a Meilisearch task finishes.
func (m *meili) waitTask(ctx context.Context, uid int64) error {
	for i := 0; i < 600; i++ {
		var t struct {
			Status string          `json:"status"`
			Error  json.RawMessage `json:"error"`
		}
		if err := m.do(ctx, "GET", fmt.Sprintf("/tasks/%d", uid), nil, &t); err != nil {
			return err
		}
		switch t.Status {
		case "succeeded":
			return nil
		case "failed", "canceled":
			return fmt.Errorf("task %d %s: %s", uid, t.Status, t.Error)
		}
		time.Sleep(100 * time.Millisecond)
	}
	return fmt.Errorf("task %d timeout", uid)
}

func (m *meili) waitReady(ctx context.Context) error {
	var err error
	for i := 0; i < 60; i++ {
		if err = m.do(ctx, "GET", "/health", nil, nil); err == nil {
			return nil
		}
		time.Sleep(time.Second)
	}
	return err
}

func (m *meili) ensureIndex(ctx context.Context, settings map[string]any) error {
	var t task
	err := m.do(ctx, "POST", "/indexes", map[string]string{"uid": m.index, "primaryKey": "id"}, &t)
	if err == nil {
		_ = m.waitTask(ctx, t.TaskUID) // "already exists" fails the task; that's fine
	}
	if err := m.do(ctx, "PATCH", "/indexes/"+m.index+"/settings", settings, &t); err != nil {
		return err
	}
	return m.waitTask(ctx, t.TaskUID)
}

func (m *meili) count(ctx context.Context) (int, error) {
	var s struct {
		NumberOfDocuments int `json:"numberOfDocuments"`
	}
	err := m.do(ctx, "GET", "/indexes/"+m.index+"/stats", nil, &s)
	return s.NumberOfDocuments, err
}

func (m *meili) upsert(ctx context.Context, docs []map[string]any) (int64, error) {
	var t task
	err := m.do(ctx, "PUT", "/indexes/"+m.index+"/documents", docs, &t)
	return t.TaskUID, err
}

func (m *meili) deleteIDs(ctx context.Context, ids []string) (int64, error) {
	var t task
	err := m.do(ctx, "POST", "/indexes/"+m.index+"/documents/delete-batch", ids, &t)
	return t.TaskUID, err
}

func (m *meili) deleteAll(ctx context.Context) error {
	var t task
	if err := m.do(ctx, "DELETE", "/indexes/"+m.index+"/documents", nil, &t); err != nil {
		return err
	}
	return m.waitTask(ctx, t.TaskUID)
}

type msQuery struct {
	IndexUID             string   `json:"indexUid"`
	Q                    string   `json:"q,omitempty"`
	Filter               []string `json:"filter,omitempty"`
	Facets               []string `json:"facets,omitempty"`
	Sort                 []string `json:"sort,omitempty"`
	Page                 int      `json:"page"`
	HitsPerPage          int      `json:"hitsPerPage"`
	AttributesToRetrieve []string `json:"attributesToRetrieve,omitempty"`
}

type msResult struct {
	Hits         []json.RawMessage         `json:"hits"`
	TotalHits    int                       `json:"totalHits"`
	FacetDistrib map[string]map[string]int `json:"facetDistribution"`
}

func (m *meili) multiSearch(ctx context.Context, qs []msQuery) ([]msResult, error) {
	var out struct {
		Results []msResult `json:"results"`
	}
	err := m.do(ctx, "POST", "/multi-search", map[string]any{"queries": qs}, &out)
	return out.Results, err
}
