// Catalog service: categories, attribute schemas, filters and dictionaries.
// Data is embedded JSON (data/), loaded and validated at startup.
package main

import (
	"embed"
	"encoding/json"
	"fmt"
	"io/fs"
	"log/slog"
	"net/http"
	"os"
	"sort"
	"strings"

	"github.com/go-chi/chi/v5"

	"kup/pkg/clients"
	"kup/pkg/config"
	"kup/pkg/httpx"
)

//go:embed data
var dataFS embed.FS

// categorySource is the on-disk format: an attribute may carry filter settings.
type categorySource struct {
	Slug       string            `json:"slug"`
	Name       string            `json:"name"`
	Icon       string            `json:"icon"`
	Position   int               `json:"position"`
	Groups     []clients.Group   `json:"groups"`
	Attributes []attributeSource `json:"attributes"`
	Sorts      []clients.Option  `json:"sorts"`
	Highlights []string          `json:"highlights"`
}

type attributeSource struct {
	clients.Attribute
	Filter *filterSource `json:"filter"`
}

type filterSource struct {
	Widget  string    `json:"widget"`
	Label   string    `json:"label"`
	Pinned  bool      `json:"pinned"`
	Facet   bool      `json:"facet"`
	Presets []float64 `json:"presets"`
}

type category struct {
	Slug string `json:"slug"`
	Name string `json:"name"`
	Icon string `json:"icon"`
	pos  int
}

type store struct {
	categories []category
	schemas    map[string]*clients.Schema
	refs       map[string][]clients.RefItem
}

func main() {
	httpx.SetupLogger("catalog")
	s, err := load(dataFS)
	if err != nil {
		slog.Error("load catalog data", "err", err)
		os.Exit(1)
	}

	r := httpx.NewRouter()
	r.Get("/v1/categories", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Cache-Control", "public, max-age=300")
		httpx.JSON(w, 200, map[string]any{"items": s.categories})
	})
	r.Method("GET", "/v1/categories/{slug}/schema", httpx.Handler(func(w http.ResponseWriter, r *http.Request) error {
		sc, ok := s.schemas[chi.URLParam(r, "slug")]
		if !ok {
			return httpx.NotFound()
		}
		w.Header().Set("Cache-Control", "public, max-age=300")
		httpx.JSON(w, 200, sc)
		return nil
	}))
	r.Method("GET", "/v1/refs/{ref}", httpx.Handler(func(w http.ResponseWriter, r *http.Request) error {
		items, ok := s.refs[chi.URLParam(r, "ref")]
		if !ok {
			return httpx.NotFound()
		}
		w.Header().Set("Cache-Control", "public, max-age=300")
		httpx.JSON(w, 200, map[string]any{"items": filterRefs(items, r.URL.Query().Get("parent"), r.URL.Query().Get("q"))})
		return nil
	}))
	// Full dictionaries for other services (validation, labels).
	r.Get("/internal/refs", func(w http.ResponseWriter, _ *http.Request) { httpx.JSON(w, 200, s.refs) })

	httpx.Serve(config.String("ADDR", ":8082"), r)
}

type publicRef struct {
	ID     string  `json:"id"`
	Name   string  `json:"name"`
	Parent *string `json:"parent"`
}

func filterRefs(items []clients.RefItem, parent, q string) []publicRef {
	parents := map[string]bool{}
	for _, p := range strings.Split(parent, ",") {
		if p = strings.TrimSpace(p); p != "" {
			parents[p] = true
		}
	}
	q = strings.ToLower(strings.TrimSpace(q))
	out := []publicRef{}
	for _, it := range items {
		if len(parents) > 0 && (it.Parent == nil || !parents[*it.Parent]) {
			continue
		}
		if q != "" && !matches(it, q) {
			continue
		}
		out = append(out, publicRef{it.ID, it.Name, it.Parent})
	}
	return out
}

func matches(it clients.RefItem, q string) bool {
	if strings.Contains(strings.ToLower(it.Name), q) {
		return true
	}
	for _, a := range it.Aliases {
		if strings.Contains(strings.ToLower(a), q) {
			return true
		}
	}
	return false
}

func ptr[T any](v T) *T { return &v }

// commonFilters apply to every category and map to top-level listing fields.
func commonFilters() []clients.Filter {
	return []clients.Filter{
		{Key: "price", Label: "Цена", Widget: "range", Type: "int", Group: "common", Unit: ptr("₸"), Min: ptr(0.0), Pinned: true},
		{Key: "city", Label: "Город", Widget: "ref", Type: "ref", Group: "common", Ref: ptr("city"), Pinned: true, Facet: true},
		{Key: "with_photo", Label: "Только с фото", Widget: "toggle", Type: "bool", Group: "common"},
		{Key: "posted_within", Label: "Размещено", Widget: "select", Type: "enum", Group: "common", Options: []clients.Option{
			{Value: "1", Label: "За сутки"}, {Value: "3", Label: "За 3 дня"}, {Value: "7", Label: "За неделю"}, {Value: "30", Label: "За месяц"},
		}},
	}
}

var defaultWidget = map[string]string{"int": "range", "decimal": "range", "enum": "multi", "multi_enum": "multi_all", "bool": "toggle", "ref": "ref"}

func load(fsys fs.FS) (*store, error) {
	s := &store{schemas: map[string]*clients.Schema{}, refs: map[string][]clients.RefItem{}}

	refFiles, _ := fs.Glob(fsys, "data/refs/*.json")
	for _, f := range refFiles {
		b, _ := fs.ReadFile(fsys, f)
		var items []clients.RefItem
		if err := json.Unmarshal(b, &items); err != nil {
			return nil, fmt.Errorf("%s: %w", f, err)
		}
		name := strings.TrimSuffix(f[strings.LastIndex(f, "/")+1:], ".json")
		s.refs[name] = items
	}
	// Models are stored nested under makes for readability: expand "make.models".
	if err := expandModels(fsys, s); err != nil {
		return nil, err
	}

	catFiles, _ := fs.Glob(fsys, "data/categories/*.json")
	for _, f := range catFiles {
		b, _ := fs.ReadFile(fsys, f)
		var src categorySource
		dec := json.NewDecoder(strings.NewReader(string(b)))
		dec.DisallowUnknownFields()
		if err := dec.Decode(&src); err != nil {
			return nil, fmt.Errorf("%s: %w", f, err)
		}
		sc, err := buildSchema(src, s.refs)
		if err != nil {
			return nil, fmt.Errorf("%s: %w", f, err)
		}
		s.schemas[src.Slug] = sc
		s.categories = append(s.categories, category{src.Slug, src.Name, src.Icon, src.Position})
	}
	sort.Slice(s.categories, func(i, j int) bool { return s.categories[i].pos < s.categories[j].pos })
	slog.Info("catalog loaded", "categories", len(s.categories), "refs", len(s.refs))
	return s, nil
}

type makeWithModels struct {
	ID      string   `json:"id"`
	Name    string   `json:"name"`
	Aliases []string `json:"aliases"`
	Models  []struct {
		Name    string   `json:"name"`
		Aliases []string `json:"aliases"`
	} `json:"models"`
}

// expandModels reads data/makes/<prefix>.json ([{id,name,models:[...]}]) into <prefix>_make and <prefix>_model refs.
func expandModels(fsys fs.FS, s *store) error {
	files, _ := fs.Glob(fsys, "data/makes/*.json")
	for _, f := range files {
		prefix := strings.TrimSuffix(f[strings.LastIndex(f, "/")+1:], ".json")
		b, _ := fs.ReadFile(fsys, f)
		var makes []makeWithModels
		if err := json.Unmarshal(b, &makes); err != nil {
			return fmt.Errorf("%s: %w", f, err)
		}
		var mk, md []clients.RefItem
		seen := map[string]bool{}
		for _, m := range makes {
			mk = append(mk, clients.RefItem{ID: m.ID, Name: m.Name, Aliases: m.Aliases})
			for _, model := range m.Models {
				id := m.ID + "-" + slug(model.Name)
				if seen[id] {
					return fmt.Errorf("%s: duplicate model id %q", f, id)
				}
				seen[id] = true
				md = append(md, clients.RefItem{ID: id, Name: model.Name, Parent: ptr(m.ID), Aliases: model.Aliases})
			}
		}
		s.refs[prefix+"_make"] = mk
		s.refs[prefix+"_model"] = md
	}
	return nil
}

func slug(s string) string {
	var b strings.Builder
	dash := false
	for _, r := range strings.ToLower(s) {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
			dash = false
		} else if !dash && b.Len() > 0 {
			b.WriteByte('-')
			dash = true
		}
	}
	return strings.TrimSuffix(b.String(), "-")
}

func buildSchema(src categorySource, refs map[string][]clients.RefItem) (*clients.Schema, error) {
	sc := &clients.Schema{
		Category:   src.Slug,
		Name:       src.Name,
		Groups:     append([]clients.Group{{Key: "common", Label: "Общие"}}, src.Groups...),
		Sorts:      src.Sorts,
		Highlights: src.Highlights,
		Filters:    commonFilters(),
	}
	groups := map[string]bool{}
	for _, g := range src.Groups {
		groups[g.Key] = true
	}
	keys := map[string]bool{"price": true, "city": true, "with_photo": true, "posted_within": true}
	for _, a := range src.Attributes {
		at := a.Attribute
		if keys[at.Key] {
			return nil, fmt.Errorf("duplicate attribute %q", at.Key)
		}
		keys[at.Key] = true
		if !groups[at.Group] {
			return nil, fmt.Errorf("attribute %q: unknown group %q", at.Key, at.Group)
		}
		if _, ok := defaultWidget[at.Type]; !ok && at.Type != "text" {
			return nil, fmt.Errorf("attribute %q: bad type %q", at.Key, at.Type)
		}
		if (at.Type == "enum" || at.Type == "multi_enum") && len(at.Options) == 0 {
			return nil, fmt.Errorf("attribute %q: options required", at.Key)
		}
		if at.Type == "ref" {
			if at.Ref == nil || refs[*at.Ref] == nil {
				return nil, fmt.Errorf("attribute %q: unknown ref", at.Key)
			}
		}
		if at.DependsOn != nil && !keys[at.DependsOn.Key] {
			return nil, fmt.Errorf("attribute %q depends on later/unknown %q", at.Key, at.DependsOn.Key)
		}
		sc.Attributes = append(sc.Attributes, at)

		if a.Filter == nil {
			continue
		}
		widget := a.Filter.Widget
		if widget == "" {
			widget = defaultWidget[at.Type]
		}
		label := a.Filter.Label
		if label == "" {
			label = at.Label
		}
		sc.Filters = append(sc.Filters, clients.Filter{
			Key: at.Key, Label: label, Widget: widget, Type: at.Type, Group: at.Group,
			Ref: at.Ref, Parent: at.Parent, Options: at.Options, Min: at.Min, Max: at.Max, Step: at.Step, Unit: at.Unit,
			Presets: a.Filter.Presets, Pinned: a.Filter.Pinned, Facet: a.Filter.Facet, DependsOn: at.DependsOn,
		})
	}
	return sc, nil
}
