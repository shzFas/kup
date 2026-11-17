// Catalog service: categories, attribute schemas, filters, dictionaries and
// search suggestions, in every supported language. Data is embedded JSON
// (data/), loaded and validated at startup.
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
	"kup/pkg/i18n"
)

//go:embed data
var dataFS embed.FS

type text = i18n.Text

// ---------- source format (see docs/API.md, stage 3) ----------

type categorySource struct {
	Slug       string            `json:"slug"`
	Name       text              `json:"name"`
	Icon       string            `json:"icon"`
	Position   int               `json:"position"`
	Groups     []groupSource     `json:"groups"`
	Attributes []attributeSource `json:"attributes"`
	Sorts      []optionSource    `json:"sorts"`
	Highlights []string          `json:"highlights"`
}

type groupSource struct {
	Key   string `json:"key"`
	Label text   `json:"label"`
}

type optionSource struct {
	Value string `json:"value"`
	Label text   `json:"label"`
}

type attributeSource struct {
	Key       string             `json:"key"`
	Type      string             `json:"type"`
	Label     text               `json:"label"`
	Group     string             `json:"group"`
	Required  bool               `json:"required"`
	Ref       *string            `json:"ref"`
	Parent    *string            `json:"parent"`
	Options   []optionSource     `json:"options"`
	Min       *float64           `json:"min"`
	Max       *float64           `json:"max"`
	Step      *float64           `json:"step"`
	Unit      text               `json:"unit"`
	DependsOn *clients.DependsOn `json:"depends_on"`
	Computed  bool               `json:"computed"`
	Hint      text               `json:"hint"`
	Filter    *filterSource      `json:"filter"`
}

type filterSource struct {
	Widget  string    `json:"widget"`
	Label   text      `json:"label"`
	Pinned  bool      `json:"pinned"`
	Facet   bool      `json:"facet"`
	Presets []float64 `json:"presets"`
	Hint    text      `json:"hint"`
}

type refSource struct {
	ID      string   `json:"id"`
	Name    text     `json:"name"`
	Aliases []string `json:"aliases"`
}

type makeSource struct {
	ID      string   `json:"id"`
	Name    text     `json:"name"`
	Aliases []string `json:"aliases"`
	Models  []struct {
		ID      string   `json:"id"`
		Name    text     `json:"name"`
		Aliases []string `json:"aliases"`
	} `json:"models"`
}

// ---------- resolved store ----------

type category struct {
	Slug string `json:"slug"`
	Name string `json:"name"`
	Icon string `json:"icon"`
}

type store struct {
	order      []string                                 // category slugs by position
	categories map[i18n.Lang][]category                 // per language
	schemas    map[i18n.Lang]map[string]*clients.Schema // lang -> slug -> schema
	refs       map[string][]clients.RefItem             // multilingual
	refCat     map[string]string                        // ref type -> category slug (car_make -> cars)
	suggest    []suggestEntry
}

func main() {
	httpx.SetupLogger("catalog")
	s, err := load(dataFS)
	if err != nil {
		slog.Error("load catalog data", "err", err)
		os.Exit(1)
	}

	r := httpx.NewRouter()
	r.Get("/v1/categories", func(w http.ResponseWriter, r *http.Request) {
		cache(w)
		httpx.JSON(w, 200, map[string]any{"items": s.categories[i18n.FromRequest(r)]})
	})
	r.Method("GET", "/v1/categories/{slug}/schema", httpx.Handler(func(w http.ResponseWriter, r *http.Request) error {
		sc, ok := s.schemas[i18n.FromRequest(r)][chi.URLParam(r, "slug")]
		if !ok {
			return httpx.NotFound()
		}
		cache(w)
		httpx.JSON(w, 200, sc)
		return nil
	}))
	r.Method("GET", "/v1/refs/{ref}", httpx.Handler(func(w http.ResponseWriter, r *http.Request) error {
		items, ok := s.refs[chi.URLParam(r, "ref")]
		if !ok {
			return httpx.NotFound()
		}
		cache(w)
		q := r.URL.Query()
		httpx.JSON(w, 200, map[string]any{"items": filterRefs(items, q.Get("parent"), q.Get("q"), i18n.FromRequest(r))})
		return nil
	}))
	r.Get("/v1/suggest", func(w http.ResponseWriter, r *http.Request) {
		cache(w)
		httpx.JSON(w, 200, map[string]any{"items": s.suggestFor(r.URL.Query().Get("q"), r.URL.Query().Get("limit"), i18n.FromRequest(r))})
	})
	// Full multilingual dictionaries for other services (validation, labels).
	r.Get("/internal/refs", func(w http.ResponseWriter, _ *http.Request) { httpx.JSON(w, 200, s.refs) })

	httpx.Serve(config.String("ADDR", ":8082"), r)
}

func cache(w http.ResponseWriter) {
	w.Header().Set("Cache-Control", "public, max-age=300")
	w.Header().Set("Vary", "Accept-Language")
}

type publicRef struct {
	ID     string  `json:"id"`
	Name   string  `json:"name"`
	Parent *string `json:"parent"`
}

func filterRefs(items []clients.RefItem, parent, q string, lang i18n.Lang) []publicRef {
	parents := map[string]bool{}
	for _, p := range strings.Split(parent, ",") {
		if p = strings.TrimSpace(p); p != "" {
			parents[p] = true
		}
	}
	words := tokens(q)
	out := []publicRef{}
	for _, it := range items {
		if len(parents) > 0 && (it.Parent == nil || !parents[*it.Parent]) {
			continue
		}
		if len(words) > 0 && !matchAll(words, refTokens(it)) {
			continue
		}
		out = append(out, publicRef{it.ID, it.Name(string(lang)), it.Parent})
	}
	return out
}

func refTokens(it clients.RefItem) []string {
	var t []string
	for _, n := range it.Names {
		t = append(t, tokens(n)...)
	}
	for _, a := range it.Aliases {
		t = append(t, tokens(a)...)
	}
	return t
}

func ptr[T any](v T) *T { return &v }

// ---------- loading ----------

func readJSON(fsys fs.FS, path string, v any) error {
	b, err := fs.ReadFile(fsys, path)
	if err != nil {
		return err
	}
	dec := json.NewDecoder(strings.NewReader(string(b)))
	dec.DisallowUnknownFields()
	if err := dec.Decode(v); err != nil {
		return fmt.Errorf("%s: %w", path, err)
	}
	return nil
}

var refCategories = map[string]string{"car": "cars", "moto": "motorcycles", "moped": "mopeds"}

func load(fsys fs.FS) (*store, error) {
	s := &store{
		categories: map[i18n.Lang][]category{},
		schemas:    map[i18n.Lang]map[string]*clients.Schema{},
		refs:       map[string][]clients.RefItem{},
		refCat:     map[string]string{},
	}

	refFiles, _ := fs.Glob(fsys, "data/refs/*.json")
	for _, f := range refFiles {
		var src []refSource
		if err := readJSON(fsys, f, &src); err != nil {
			return nil, err
		}
		name := strings.TrimSuffix(f[strings.LastIndex(f, "/")+1:], ".json")
		seen := map[string]bool{}
		for _, it := range src {
			if it.ID == "" || seen[it.ID] {
				return nil, fmt.Errorf("%s: empty or duplicate id %q", f, it.ID)
			}
			seen[it.ID] = true
			s.refs[name] = append(s.refs[name], clients.RefItem{ID: it.ID, Names: names(it.Name), Aliases: lower(it.Aliases)})
		}
	}

	makeFiles, _ := fs.Glob(fsys, "data/makes/*.json")
	for _, f := range makeFiles {
		prefix := strings.TrimSuffix(f[strings.LastIndex(f, "/")+1:], ".json")
		var makes []makeSource
		if err := readJSON(fsys, f, &makes); err != nil {
			return nil, err
		}
		seen := map[string]bool{}
		var mk, md []clients.RefItem
		for _, m := range makes {
			if m.ID == "" || seen[m.ID] {
				return nil, fmt.Errorf("%s: empty or duplicate make id %q", f, m.ID)
			}
			seen[m.ID] = true
			mk = append(mk, clients.RefItem{ID: m.ID, Names: names(m.Name), Aliases: lower(m.Aliases)})
			for _, model := range m.Models {
				if model.ID == "" || seen[model.ID] || !strings.HasPrefix(model.ID, m.ID+"-") {
					return nil, fmt.Errorf("%s: model id %q must be unique and start with %q", f, model.ID, m.ID+"-")
				}
				seen[model.ID] = true
				md = append(md, clients.RefItem{ID: model.ID, Names: names(model.Name), Parent: ptr(m.ID), Aliases: lower(model.Aliases)})
			}
		}
		s.refs[prefix+"_make"] = mk
		s.refs[prefix+"_model"] = md
		if c, ok := refCategories[prefix]; ok {
			s.refCat[prefix+"_make"], s.refCat[prefix+"_model"] = c, c
		}
	}

	var cats []categorySource
	catFiles, _ := fs.Glob(fsys, "data/categories/*.json")
	for _, f := range catFiles {
		var src categorySource
		if err := readJSON(fsys, f, &src); err != nil {
			return nil, err
		}
		src.Groups = append(src.Groups, contactGroup)
		src.Attributes = append(src.Attributes, sellerLangs)
		if err := validate(src, s.refs); err != nil {
			return nil, fmt.Errorf("%s: %w", f, err)
		}
		cats = append(cats, src)
	}
	sort.Slice(cats, func(i, j int) bool { return cats[i].Position < cats[j].Position })
	for _, c := range cats {
		s.order = append(s.order, c.Slug)
	}
	for _, lang := range i18n.All {
		s.schemas[lang] = map[string]*clients.Schema{}
		for _, c := range cats {
			s.schemas[lang][c.Slug] = resolve(c, lang)
			s.categories[lang] = append(s.categories[lang], category{c.Slug, c.Name.Get(lang), c.Icon})
		}
	}
	s.buildSuggest(cats)
	slog.Info("catalog loaded", "categories", len(cats), "refs", len(s.refs), "suggest_entries", len(s.suggest))
	return s, nil
}

func names(t text) map[string]string {
	out := map[string]string{}
	for l, v := range t {
		out[string(l)] = v
	}
	return out
}

func lower(in []string) []string {
	out := make([]string, len(in))
	for i, v := range in {
		out[i] = strings.ToLower(strings.TrimSpace(v))
	}
	return out
}

var defaultWidget = map[string]string{"int": "range", "decimal": "range", "enum": "multi", "multi_enum": "multi_all", "bool": "toggle", "ref": "ref"}

func validate(src categorySource, refs map[string][]clients.RefItem) error {
	if len(src.Name) == 0 {
		return fmt.Errorf("category name required")
	}
	groups := map[string]bool{}
	for _, g := range src.Groups {
		groups[g.Key] = true
	}
	keys := map[string]bool{"price": true, "city": true, "with_photo": true, "posted_within": true}
	for _, a := range src.Attributes {
		if keys[a.Key] {
			return fmt.Errorf("duplicate or reserved attribute %q", a.Key)
		}
		keys[a.Key] = true
		if len(a.Label) == 0 {
			return fmt.Errorf("attribute %q: label required", a.Key)
		}
		if !groups[a.Group] {
			return fmt.Errorf("attribute %q: unknown group %q", a.Key, a.Group)
		}
		if _, ok := defaultWidget[a.Type]; !ok && a.Type != "text" {
			return fmt.Errorf("attribute %q: bad type %q", a.Key, a.Type)
		}
		if a.Type == "enum" || a.Type == "multi_enum" {
			if len(a.Options) == 0 {
				return fmt.Errorf("attribute %q: options required", a.Key)
			}
			seen := map[string]bool{}
			for _, o := range a.Options {
				if o.Value == "" || seen[o.Value] || len(o.Label) == 0 {
					return fmt.Errorf("attribute %q: bad or duplicate option %q", a.Key, o.Value)
				}
				seen[o.Value] = true
			}
		}
		if a.Type == "ref" && (a.Ref == nil || refs[*a.Ref] == nil) {
			return fmt.Errorf("attribute %q: unknown ref", a.Key)
		}
		if a.DependsOn != nil && !keys[a.DependsOn.Key] {
			return fmt.Errorf("attribute %q depends on later/unknown %q", a.Key, a.DependsOn.Key)
		}
		if a.Filter != nil && a.Type == "text" {
			return fmt.Errorf("attribute %q: text attributes can't be filters", a.Key)
		}
	}
	for _, h := range src.Highlights {
		if !keys[h] {
			return fmt.Errorf("highlight %q is not an attribute", h)
		}
	}
	for _, o := range src.Sorts {
		if _, ok := sortWhitelist[o.Value]; !ok {
			return fmt.Errorf("unknown sort %q", o.Value)
		}
	}
	return nil
}

// Sorts the search service knows how to apply.
var sortWhitelist = map[string]bool{"date_desc": true, "price_asc": true, "price_desc": true, "year_desc": true,
	"mileage_asc": true, "price_per_m2_asc": true, "area_desc": true}

func resolve(c categorySource, l i18n.Lang) *clients.Schema {
	sc := &clients.Schema{Category: c.Slug, Name: c.Name.Get(l), Highlights: c.Highlights, Filters: commonFilters(l)}
	sc.Groups = append(sc.Groups, clients.Group{Key: "common", Label: commonGroup.Get(l)})
	for _, g := range c.Groups {
		sc.Groups = append(sc.Groups, clients.Group{Key: g.Key, Label: g.Label.Get(l)})
	}
	for _, o := range c.Sorts {
		sc.Sorts = append(sc.Sorts, clients.Option{Value: o.Value, Label: o.Label.Get(l)})
	}
	for _, a := range c.Attributes {
		var opts []clients.Option
		for _, o := range a.Options {
			opts = append(opts, clients.Option{Value: o.Value, Label: o.Label.Get(l)})
		}
		at := clients.Attribute{
			Key: a.Key, Type: a.Type, Label: a.Label.Get(l), Group: a.Group, Required: a.Required, Ref: a.Ref, Parent: a.Parent,
			Options: opts, Min: a.Min, Max: a.Max, Step: a.Step, Unit: a.Unit.Ptr(l), DependsOn: a.DependsOn, Computed: a.Computed,
			Hint: a.Hint.Ptr(l),
		}
		sc.Attributes = append(sc.Attributes, at)
		if a.Filter == nil {
			continue
		}
		f := a.Filter
		widget := f.Widget
		if widget == "" {
			widget = defaultWidget[a.Type]
		}
		label, hint := at.Label, at.Hint
		if len(f.Label) > 0 {
			label = f.Label.Get(l)
		}
		if len(f.Hint) > 0 {
			hint = f.Hint.Ptr(l)
		}
		sc.Filters = append(sc.Filters, clients.Filter{
			Key: a.Key, Label: label, Widget: widget, Type: a.Type, Group: a.Group, Ref: a.Ref, Parent: a.Parent,
			Options: opts, Min: a.Min, Max: a.Max, Step: a.Step, Unit: at.Unit, Presets: f.Presets,
			Pinned: f.Pinned, Facet: f.Facet, DependsOn: a.DependsOn, Hint: hint,
		})
	}
	return sc
}

// ---------- shared definitions ----------

func tx(ru, uk, cs, en string) text { return text{i18n.RU: ru, i18n.UK: uk, i18n.CS: cs, i18n.EN: en} }

var commonGroup = tx("Общие", "Загальні", "Obecné", "General")

var contactGroup = groupSource{Key: "contact", Label: tx("Связь с продавцом", "Зв'язок із продавцем", "Kontakt s prodejcem", "Contacting the seller")}

// sellerLangs is added to every category: the main audience prefers sellers who speak Russian or Ukrainian.
var sellerLangs = attributeSource{
	Key: "seller_langs", Type: "multi_enum", Group: "contact",
	Label: tx("Язык общения", "Мова спілкування", "Jazyk komunikace", "Languages spoken"),
	Hint: tx("На каких языках вы готовы общаться с покупателями", "Якими мовами ви готові спілкуватися з покупцями",
		"Jakými jazyky můžete s kupujícími komunikovat", "Which languages you can use with buyers"),
	Options: []optionSource{
		{"ru", tx("Русский", "Російська", "Ruština", "Russian")},
		{"uk", tx("Украинский", "Українська", "Ukrajinština", "Ukrainian")},
		{"cs", tx("Чешский", "Чеська", "Čeština", "Czech")},
		{"sk", tx("Словацкий", "Словацька", "Slovenština", "Slovak")},
		{"en", tx("Английский", "Англійська", "Angličtina", "English")},
	},
	Filter: &filterSource{Widget: "multi", Facet: true,
		Label: tx("Продавец говорит", "Продавець говорить", "Prodejce mluví", "Seller speaks"),
		Hint: tx("Покажем объявления продавцов, которые говорят хотя бы на одном из выбранных языков",
			"Покажемо оголошення продавців, які говорять хоча б однією з вибраних мов",
			"Zobrazíme inzeráty prodejců, kteří mluví alespoň jedním ze zvolených jazyků",
			"Shows listings from sellers who speak at least one of the selected languages")},
}

// commonFilters apply to every category and map to top-level listing fields.
func commonFilters(l i18n.Lang) []clients.Filter {
	return []clients.Filter{
		{Key: "price", Label: tx("Цена", "Ціна", "Cena", "Price").Get(l), Widget: "range", Type: "int", Group: "common",
			Unit: ptr("Kč"), Min: ptr(0.0), Pinned: true,
			Hint: tx("Цены указаны в чешских кронах (Kč)", "Ціни вказано в чеських кронах (Kč)", "Ceny jsou uvedeny v korunách (Kč)", "Prices are in Czech crowns (Kč)").Ptr(l)},
		{Key: "city", Label: tx("Город", "Місто", "Město", "City").Get(l), Widget: "ref", Type: "ref", Group: "common", Ref: ptr("city"), Pinned: true, Facet: true},
		{Key: "with_photo", Label: tx("Только с фото", "Лише з фото", "Pouze s fotkou", "With photos only").Get(l), Widget: "toggle", Type: "bool", Group: "common"},
		{Key: "posted_within", Label: tx("Размещено", "Розміщено", "Přidáno", "Posted").Get(l), Widget: "select", Type: "enum", Group: "common", Options: []clients.Option{
			{Value: "1", Label: tx("За сутки", "За добу", "Za 24 hodin", "Last 24 hours").Get(l)},
			{Value: "3", Label: tx("За 3 дня", "За 3 дні", "Za 3 dny", "Last 3 days").Get(l)},
			{Value: "7", Label: tx("За неделю", "За тиждень", "Za týden", "Last week").Get(l)},
			{Value: "30", Label: tx("За месяц", "За місяць", "Za měsíc", "Last month").Get(l)},
		}},
	}
}
