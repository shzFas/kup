package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"kup/pkg/httpx"
)

// similar returns listings like the given one: first a strict match
// (same model / same rooms & deal), then looser filters to fill up the list.
func (s *server) similar(w http.ResponseWriter, r *http.Request) error {
	id := chi.URLParam(r, "id")
	if _, err := uuid.Parse(id); err != nil {
		return httpx.NotFound()
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit <= 0 || limit > 20 {
		limit = 8
	}
	var doc struct {
		Category string         `json:"category"`
		CityID   string         `json:"city_id"`
		Attrs    map[string]any `json:"attrs"`
	}
	if err := s.ms.do(r.Context(), "GET", "/indexes/"+s.ms.index+"/documents/"+id, nil, &doc); err != nil {
		if me, ok := err.(*meiliError); ok && me.Status == 404 {
			httpx.JSON(w, 200, map[string]any{"items": []card{}}) // not indexed (inactive): nothing similar
			return nil
		}
		return err
	}
	base := []string{fmt.Sprintf("category = %q", doc.Category), fmt.Sprintf("id != %q", id)}
	eq := func(key string) string {
		v, ok := doc.Attrs[key].(string)
		if !ok || !safeValue.MatchString(v) {
			return ""
		}
		return fmt.Sprintf("attrs.%s = %q", key, v)
	}
	var tiers [][]string
	if doc.Category == "apartments" {
		tiers = [][]string{{eq("deal_type"), eq("rooms"), fmt.Sprintf("city_id = %q", doc.CityID)}, {eq("deal_type"), fmt.Sprintf("city_id = %q", doc.CityID)}}
	} else {
		year := ""
		if y, ok := doc.Attrs["year"].(float64); ok {
			year = fmt.Sprintf("attrs.year >= %d AND attrs.year <= %d", int(y)-3, int(y)+3)
		}
		tiers = [][]string{{eq("model"), year}, {eq("make")}, {eq("moto_type"), eq("moped_type")}}
	}

	items := []card{}
	seen := map[string]bool{}
	for _, tier := range tiers {
		f := append([]string{}, base...)
		for _, c := range tier {
			if c != "" {
				f = append(f, c)
			}
		}
		if len(f) == len(base) {
			continue
		}
		hits, err := s.query(r.Context(), f, limit)
		if err != nil {
			return err
		}
		for _, h := range hits {
			if !seen[h.ID] && len(items) < limit {
				seen[h.ID] = true
				items = append(items, h)
			}
		}
		if len(items) >= limit {
			break
		}
	}
	httpx.JSON(w, 200, map[string]any{"items": items})
	return nil
}

func (s *server) query(ctx context.Context, filter []string, limit int) ([]card, error) {
	res, err := s.ms.multiSearch(ctx, []msQuery{{IndexUID: s.ms.index, Filter: filter, Sort: []string{"published_ts:desc"},
		Page: 1, HitsPerPage: limit, AttributesToRetrieve: retrieve}})
	if err != nil {
		return nil, err
	}
	out := make([]card, 0, len(res[0].Hits))
	for _, raw := range res[0].Hits {
		var h hitDoc
		if err := json.Unmarshal(raw, &h); err != nil {
			return nil, err
		}
		out = append(out, card{h.ID, h.Category, h.Title, h.Price, h.Currency, h.PriceSuffix, h.City, h.Photos, h.Attributes,
			h.AttributeLabels, h.Highlights, h.Status, h.PublishedAt, nil})
	}
	return out, nil
}
