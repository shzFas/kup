// Search service: keeps a Meilisearch index in sync from NATS events and
// serves faceted search over category schemas.
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/nats-io/nats.go/jetstream"

	"kup/pkg/clients"
	"kup/pkg/config"
	"kup/pkg/events"
	"kup/pkg/httpx"
)

type server struct {
	ms          *meili
	catalog     *clients.Catalog
	listingsURL string
	http        *http.Client
}

func main() {
	httpx.SetupLogger("search")
	ctx := context.Background()
	s := &server{
		ms: &meili{base: config.String("MEILI_URL", "http://meilisearch:7700"), key: os.Getenv("MEILI_MASTER_KEY"),
			index: "listings", http: &http.Client{Timeout: 30 * time.Second}},
		catalog:     clients.NewCatalog(config.String("CATALOG_URL", "http://catalog:8082")),
		listingsURL: config.String("LISTINGS_URL", "http://listings:8083"),
		http:        &http.Client{Timeout: 30 * time.Second},
	}
	if err := s.ms.waitReady(ctx); err != nil {
		slog.Error("meilisearch not ready", "err", err)
		os.Exit(1)
	}
	if err := s.configureIndex(ctx); err != nil {
		slog.Error("configure index", "err", err)
		os.Exit(1)
	}
	_, js, err := events.Connect(ctx, config.String("NATS_URL", "nats://nats:4222"))
	if err != nil {
		slog.Error("nats", "err", err)
		os.Exit(1)
	}
	go func() {
		// Rebuild from the source of truth if the index is empty (first start or lost volume).
		if n, err := s.ms.count(ctx); err == nil && n == 0 {
			if err := s.resync(ctx); err != nil {
				slog.Error("initial resync", "err", err)
			}
		}
		s.consume(ctx, js)
	}()

	r := httpx.NewRouter()
	r.Method("POST", "/v1/search", httpx.Handler(s.search))
	r.Method("POST", "/v1/search/count", httpx.Handler(s.count))
	r.Method("POST", "/internal/reindex", httpx.Handler(func(w http.ResponseWriter, r *http.Request) error {
		if err := s.ms.deleteAll(r.Context()); err != nil {
			return err
		}
		if err := s.resync(r.Context()); err != nil {
			return err
		}
		httpx.JSON(w, 200, map[string]string{"status": "ok"})
		return nil
	}))
	httpx.Serve(config.String("ADDR", ":8084"), r)
}

// ---------- index ----------

var sortFields = map[string]string{
	"date_desc":        "published_ts:desc",
	"price_asc":        "price:asc",
	"price_desc":       "price:desc",
	"year_desc":        "attrs.year:desc",
	"mileage_asc":      "attrs.mileage_km:asc",
	"price_per_m2_asc": "attrs.price_per_m2:asc",
	"area_desc":        "attrs.area_total:desc",
}

// fieldFor maps a filter key to the index field.
func fieldFor(key string) string {
	switch key {
	case "price":
		return "price"
	case "city":
		return "city_id"
	case "with_photo":
		return "has_photo"
	case "posted_within":
		return "published_ts"
	}
	return "attrs." + key
}

func (s *server) configureIndex(ctx context.Context) error {
	var cats []string
	var err error
	for i := 0; i < 30; i++ {
		if cats, err = s.catalog.Categories(ctx); err == nil {
			break
		}
		slog.Warn("waiting for catalog", "err", err)
		time.Sleep(time.Second)
	}
	if err != nil {
		return err
	}
	filterable := map[string]bool{"category": true, "_geo": true}
	for _, c := range cats {
		sc, err := s.catalog.Schema(ctx, c)
		if err != nil {
			return err
		}
		for _, f := range sc.Filters {
			filterable[fieldFor(f.Key)] = true
		}
	}
	fl := make([]string, 0, len(filterable))
	for f := range filterable {
		fl = append(fl, f)
	}
	sort.Strings(fl)
	sortable := []string{"_geo"}
	for _, f := range sortFields {
		sortable = append(sortable, strings.TrimSuffix(strings.TrimSuffix(f, ":desc"), ":asc"))
	}
	return s.ms.ensureIndex(ctx, map[string]any{
		"filterableAttributes": fl,
		"sortableAttributes":   sortable,
		"searchableAttributes": []string{"title", "search_text", "description"},
		"pagination":           map[string]int{"maxTotalHits": 10000},
		"faceting":             map[string]int{"maxValuesPerFacet": 300},
	})
}

func toIndexDoc(d events.ListingDoc) map[string]any {
	m := map[string]any{
		"id": d.ID, "category": d.Category, "title": d.Title, "description": d.Description, "search_text": d.SearchText,
		"price": d.Price, "currency": d.Currency, "price_suffix": d.PriceSuffix, "city": d.City, "city_id": d.City.ID,
		"photos": d.Photos, "has_photo": len(d.Photos) > 0, "attrs": d.Attributes, "attribute_labels": d.AttributeLabels,
		"highlights": d.Highlights, "status": d.Status, "published_at": d.PublishedAt, "published_ts": d.PublishedAt.Unix(),
	}
	if d.Location != nil {
		m["_geo"] = map[string]float64{"lat": d.Location.Lat, "lng": d.Location.Lng}
	}
	return m
}

// consume applies listing events in batches. Within a batch only the last event per id matters.
func (s *server) consume(ctx context.Context, js jetstream.JetStream) {
	cons, err := js.CreateOrUpdateConsumer(ctx, events.StreamListings, jetstream.ConsumerConfig{
		Durable: events.ConsumerIndexer, AckPolicy: jetstream.AckExplicitPolicy, MaxAckPending: 1000, AckWait: time.Minute,
	})
	if err != nil {
		slog.Error("create consumer", "err", err)
		os.Exit(1)
	}
	slog.Info("indexer started")
	for ctx.Err() == nil {
		batch, err := cons.Fetch(200, jetstream.FetchMaxWait(2*time.Second))
		if err != nil {
			slog.Warn("fetch", "err", err)
			time.Sleep(time.Second)
			continue
		}
		var msgs []jetstream.Msg
		for m := range batch.Messages() {
			msgs = append(msgs, m)
		}
		if len(msgs) == 0 {
			continue
		}
		if err := s.applyBatch(ctx, msgs); err != nil {
			slog.Error("index batch", "err", err, "n", len(msgs))
			for _, m := range msgs {
				_ = m.NakWithDelay(5 * time.Second)
			}
			continue
		}
		for _, m := range msgs {
			_ = m.Ack()
		}
	}
}

func (s *server) applyBatch(ctx context.Context, msgs []jetstream.Msg) error {
	latest := map[string]*events.ListingDoc{} // nil value = remove
	var order []string
	for _, m := range msgs {
		var id string
		var doc *events.ListingDoc
		switch m.Subject() {
		case events.SubjectUpserted:
			var d events.ListingDoc
			if err := json.Unmarshal(m.Data(), &d); err != nil {
				slog.Error("bad event, skipping", "err", err)
				continue
			}
			id, doc = d.ID, &d
		case events.SubjectRemoved:
			var d events.ListingRemoved
			if err := json.Unmarshal(m.Data(), &d); err != nil {
				continue
			}
			id = d.ID
		default:
			continue
		}
		if _, seen := latest[id]; !seen {
			order = append(order, id)
		}
		latest[id] = doc
	}
	var upserts []map[string]any
	var removes []string
	for _, id := range order {
		if d := latest[id]; d != nil {
			upserts = append(upserts, toIndexDoc(*d))
		} else {
			removes = append(removes, id)
		}
	}
	if len(upserts) > 0 {
		if _, err := s.ms.upsert(ctx, upserts); err != nil {
			return err
		}
	}
	if len(removes) > 0 {
		if _, err := s.ms.deleteIDs(ctx, removes); err != nil {
			return err
		}
	}
	slog.Info("indexed", "upserts", len(upserts), "removes", len(removes))
	return nil
}

// resync pages through all active listings from the listings service.
func (s *server) resync(ctx context.Context) error {
	after, total := "", 0
	for {
		url := s.listingsURL + "/internal/export?limit=500&after=" + after
		var res struct {
			Items []events.ListingDoc `json:"items"`
		}
		var err error
		for i := 0; i < 30; i++ {
			if err = s.getJSON(ctx, url, &res); err == nil {
				break
			}
			time.Sleep(2 * time.Second)
		}
		if err != nil {
			return err
		}
		if len(res.Items) == 0 {
			break
		}
		docs := make([]map[string]any, len(res.Items))
		for i, d := range res.Items {
			docs[i] = toIndexDoc(d)
		}
		uid, err := s.ms.upsert(ctx, docs)
		if err != nil {
			return err
		}
		if err := s.ms.waitTask(ctx, uid); err != nil {
			return err
		}
		total += len(docs)
		after = res.Items[len(res.Items)-1].ID
	}
	slog.Info("resync done", "docs", total)
	return nil
}

func (s *server) getJSON(ctx context.Context, url string, out any) error {
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	res, err := s.http.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		return fmt.Errorf("%s: %d", url, res.StatusCode)
	}
	return json.NewDecoder(res.Body).Decode(out)
}

// ---------- search API ----------

type searchReq struct {
	Category string                                `json:"category"`
	Query    string                                `json:"query"`
	Filters  map[string]map[string]json.RawMessage `json:"filters"`
	Geo      *struct {
		Lat      float64 `json:"lat"`
		Lng      float64 `json:"lng"`
		RadiusKm float64 `json:"radius_km"`
	} `json:"geo"`
	Sort   string   `json:"sort"`
	Page   int      `json:"page"`
	Limit  int      `json:"limit"`
	Facets []string `json:"facets"`
}

type plan struct {
	sc     *clients.Schema
	base   []string          // category + geo
	byKey  map[string]string // filter expression per filter key
	query  string
	sort   []string
	page   int
	limit  int
	facets []string // filter keys
}

var safeValue = regexp.MustCompile(`^[A-Za-z0-9_.+\-]{1,64}$`)

func (s *server) buildPlan(ctx context.Context, r *http.Request) (*plan, error) {
	var in searchReq
	if err := httpx.Decode(r, &in); err != nil {
		return nil, err
	}
	sc, err := s.catalog.Schema(ctx, in.Category)
	if errors.Is(err, clients.ErrNotFound) {
		return nil, httpx.BadRequest("Неизвестная категория")
	}
	if err != nil {
		return nil, err
	}
	p := &plan{sc: sc, byKey: map[string]string{}, query: strings.TrimSpace(in.Query), page: in.Page, limit: in.Limit}
	if len([]rune(p.query)) > 200 {
		return nil, httpx.BadRequest("Слишком длинный запрос")
	}
	if p.page < 1 {
		p.page = 1
	}
	if p.limit <= 0 {
		p.limit = 30
	}
	if p.limit > 60 {
		p.limit = 60
	}
	p.base = []string{fmt.Sprintf("category = %q", sc.Category)}
	if g := in.Geo; g != nil {
		if g.RadiusKm <= 0 || g.RadiusKm > 500 || g.Lat < -90 || g.Lat > 90 || g.Lng < -180 || g.Lng > 180 {
			return nil, httpx.BadRequest("Некорректные параметры гео-фильтра")
		}
		p.base = append(p.base, fmt.Sprintf("_geoRadius(%f, %f, %d)", g.Lat, g.Lng, int(g.RadiusKm*1000)))
	}

	defs := map[string]clients.Filter{}
	for _, f := range sc.Filters {
		defs[f.Key] = f
	}
	for key, ops := range in.Filters {
		def, ok := defs[key]
		if !ok {
			return nil, httpx.BadRequest("Неизвестный фильтр: " + key)
		}
		expr, err := filterExpr(def, ops)
		if err != nil {
			return nil, httpx.BadRequest(fmt.Sprintf("Фильтр %s: %v", key, err))
		}
		if expr != "" {
			p.byKey[key] = expr
		}
	}

	sortKey := in.Sort
	if sortKey == "" {
		sortKey = "date_desc"
	}
	valid := false
	for _, o := range sc.Sorts {
		valid = valid || o.Value == sortKey
	}
	if !valid {
		return nil, httpx.BadRequest("Неизвестная сортировка")
	}
	p.sort = []string{sortFields[sortKey]}
	if sortKey != "date_desc" {
		p.sort = append(p.sort, "published_ts:desc")
	}

	if in.Facets == nil {
		for _, f := range sc.Filters {
			if f.Facet {
				p.facets = append(p.facets, f.Key)
			}
		}
	} else {
		for _, k := range in.Facets {
			if d, ok := defs[k]; !ok || !d.Facet {
				return nil, httpx.BadRequest("Фасет недоступен: " + k)
			}
			p.facets = append(p.facets, k)
		}
	}
	return p, nil
}

func filterExpr(def clients.Filter, ops map[string]json.RawMessage) (string, error) {
	field := fieldFor(def.Key)
	allowed := map[string][]string{
		"range": {"gte", "lte"}, "multi": {"in"}, "ref": {"in"}, "multi_all": {"all"}, "toggle": {"eq"}, "select": {"eq"},
	}[def.Widget]
	for op := range ops {
		ok := false
		for _, a := range allowed {
			ok = ok || a == op
		}
		if !ok {
			return "", fmt.Errorf("оператор %q не поддерживается", op)
		}
	}
	switch def.Widget {
	case "range":
		var parts []string
		for _, op := range []string{"gte", "lte"} {
			raw, ok := ops[op]
			if !ok || string(raw) == "null" {
				continue
			}
			var n float64
			if err := json.Unmarshal(raw, &n); err != nil {
				return "", fmt.Errorf("ожидается число")
			}
			sym := ">="
			if op == "lte" {
				sym = "<="
			}
			parts = append(parts, fmt.Sprintf("%s %s %s", field, sym, strconv.FormatFloat(n, 'f', -1, 64)))
		}
		return strings.Join(parts, " AND "), nil
	case "multi", "ref", "multi_all":
		op := "in"
		if def.Widget == "multi_all" {
			op = "all"
		}
		var vals []string
		if err := json.Unmarshal(ops[op], &vals); err != nil {
			return "", fmt.Errorf("ожидается список строк")
		}
		if len(vals) == 0 {
			return "", nil
		}
		if len(vals) > 100 {
			return "", fmt.Errorf("слишком много значений")
		}
		quoted := make([]string, len(vals))
		for i, v := range vals {
			if !safeValue.MatchString(v) || (def.Options != nil && !hasOption(def, v)) {
				return "", fmt.Errorf("недопустимое значение %q", v)
			}
			quoted[i] = strconv.Quote(v)
		}
		if op == "all" {
			parts := make([]string, len(quoted))
			for i, q := range quoted {
				parts[i] = field + " = " + q
			}
			return strings.Join(parts, " AND "), nil
		}
		return fmt.Sprintf("%s IN [%s]", field, strings.Join(quoted, ", ")), nil
	case "toggle":
		var b bool
		if err := json.Unmarshal(ops["eq"], &b); err != nil {
			return "", fmt.Errorf("ожидается true/false")
		}
		if !b {
			return "", nil
		}
		return field + " = true", nil
	case "select":
		var v string
		if err := json.Unmarshal(ops["eq"], &v); err != nil {
			return "", fmt.Errorf("ожидается строка")
		}
		if !hasOption(def, v) {
			return "", fmt.Errorf("недопустимое значение %q", v)
		}
		if def.Key == "posted_within" {
			days, _ := strconv.Atoi(v)
			return fmt.Sprintf("published_ts >= %d", time.Now().Add(-time.Duration(days)*24*time.Hour).Unix()), nil
		}
		return fmt.Sprintf("%s = %q", field, v), nil
	}
	return "", fmt.Errorf("неизвестный виджет")
}

func hasOption(def clients.Filter, v string) bool {
	for _, o := range def.Options {
		if o.Value == v {
			return true
		}
	}
	return false
}

// filters returns base + all filter expressions except the one for skip.
func (p *plan) filters(skip string) []string {
	out := append([]string{}, p.base...)
	keys := make([]string, 0, len(p.byKey))
	for k := range p.byKey {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		if k != skip {
			out = append(out, p.byKey[k])
		}
	}
	return out
}

type hitDoc struct {
	ID              string            `json:"id"`
	Category        string            `json:"category"`
	Title           string            `json:"title"`
	Price           int64             `json:"price"`
	Currency        string            `json:"currency"`
	PriceSuffix     string            `json:"price_suffix"`
	City            events.City       `json:"city"`
	Photos          []string          `json:"photos"`
	Attributes      map[string]any    `json:"attrs"`
	AttributeLabels map[string]string `json:"attribute_labels"`
	Highlights      []string          `json:"highlights"`
	Status          string            `json:"status"`
	PublishedAt     time.Time         `json:"published_at"`
}

type card struct {
	ID              string            `json:"id"`
	Category        string            `json:"category"`
	Title           string            `json:"title"`
	Price           int64             `json:"price"`
	Currency        string            `json:"currency"`
	PriceSuffix     string            `json:"price_suffix"`
	City            events.City       `json:"city"`
	Photos          []string          `json:"photos"`
	Attributes      map[string]any    `json:"attributes"`
	AttributeLabels map[string]string `json:"attribute_labels"`
	Highlights      []string          `json:"highlights"`
	Status          string            `json:"status"`
	PublishedAt     time.Time         `json:"published_at"`
	IsFavorite      *bool             `json:"is_favorite,omitempty"`
}

var retrieve = []string{"id", "category", "title", "price", "currency", "price_suffix", "city", "photos", "attrs", "attribute_labels", "highlights", "status", "published_at"}

func (s *server) search(w http.ResponseWriter, r *http.Request) error {
	p, err := s.buildPlan(r.Context(), r)
	if err != nil {
		return err
	}
	main := msQuery{IndexUID: s.ms.index, Q: p.query, Filter: p.filters(""), Sort: p.sort, Page: p.page, HitsPerPage: p.limit, AttributesToRetrieve: retrieve}
	queries := []msQuery{main}
	// Facets of filtered keys are computed without their own filter (disjunctive faceting).
	var separate []string
	for _, k := range p.facets {
		if _, filtered := p.byKey[k]; filtered {
			separate = append(separate, k)
			queries = append(queries, msQuery{IndexUID: s.ms.index, Q: p.query, Filter: p.filters(k), Facets: []string{fieldFor(k)}, Page: 1, HitsPerPage: 0})
		} else {
			queries[0].Facets = append(queries[0].Facets, fieldFor(k))
		}
	}
	res, err := s.ms.multiSearch(r.Context(), queries)
	if err != nil {
		return err
	}
	facets := map[string]map[string]int{}
	for _, k := range p.facets {
		facets[k] = map[string]int{}
	}
	for _, k := range p.facets {
		if d, ok := res[0].FacetDistrib[fieldFor(k)]; ok {
			facets[k] = d
		}
	}
	for i, k := range separate {
		if d, ok := res[i+1].FacetDistrib[fieldFor(k)]; ok {
			facets[k] = d
		}
	}

	items := make([]card, 0, len(res[0].Hits))
	ids := make([]string, 0, len(res[0].Hits))
	for _, raw := range res[0].Hits {
		var h hitDoc
		if err := json.Unmarshal(raw, &h); err != nil {
			return err
		}
		items = append(items, card{h.ID, h.Category, h.Title, h.Price, h.Currency, h.PriceSuffix, h.City, h.Photos, h.Attributes,
			h.AttributeLabels, h.Highlights, h.Status, h.PublishedAt, nil})
		ids = append(ids, h.ID)
	}
	if uid := httpx.UserID(r); uid != "" && len(ids) > 0 {
		favs := s.favorites(r.Context(), uid, ids)
		for i := range items {
			f := favs[items[i].ID]
			items[i].IsFavorite = &f
		}
	}
	httpx.JSON(w, 200, map[string]any{"total": res[0].TotalHits, "page": p.page, "limit": p.limit, "items": items, "facets": facets})
	return nil
}

func (s *server) count(w http.ResponseWriter, r *http.Request) error {
	p, err := s.buildPlan(r.Context(), r)
	if err != nil {
		return err
	}
	res, err := s.ms.multiSearch(r.Context(), []msQuery{{IndexUID: s.ms.index, Q: p.query, Filter: p.filters(""), Page: 1, HitsPerPage: 0}})
	if err != nil {
		return err
	}
	httpx.JSON(w, 200, map[string]int{"total": res[0].TotalHits})
	return nil
}

// favorites asks listings which of ids the user saved. Failures just mean "no hearts".
func (s *server) favorites(ctx context.Context, uid string, ids []string) map[string]bool {
	out := map[string]bool{}
	body, _ := json.Marshal(map[string]any{"user_id": uid, "ids": ids})
	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, s.listingsURL+"/internal/favorites/check", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	res, err := s.http.Do(req)
	if err != nil {
		slog.Warn("favorites check", "err", err)
		return out
	}
	defer res.Body.Close()
	var v struct {
		IDs []string `json:"ids"`
	}
	if json.NewDecoder(res.Body).Decode(&v) == nil {
		for _, id := range v.IDs {
			out[id] = true
		}
	}
	return out
}
