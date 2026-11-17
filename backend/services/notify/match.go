package main

import (
	"encoding/json"
	"fmt"
	"strings"

	"kup/pkg/clients"
	"kup/pkg/events"
)

// searchRequest is the stored part of a search (POST /v1/search without sort/page).
type searchRequest struct {
	Category string                                `json:"category"`
	Query    string                                `json:"query"`
	Filters  map[string]map[string]json.RawMessage `json:"filters"`
}

// cond is one compiled filter.
type cond struct {
	key      string
	min, max *float64
	in       []string // any of
	all      []string // all of
	isTrue   bool
	eq       string
}

// matcher checks a new listing against a saved search, without a search engine.
type matcher struct {
	category string
	words    []string
	conds    []cond
}

// filterError says which filter is wrong; the message is localized by the caller.
type filterError struct{ key, reason string }

func (e *filterError) Error() string { return e.key + ": " + e.reason }

// compile validates req against the schema the same way the search service does.
func compile(req searchRequest, sc *clients.Schema) (*matcher, error) {
	m := &matcher{category: sc.Category, words: strings.Fields(strings.ToLower(req.Query))}
	defs := map[string]clients.Filter{}
	for _, f := range sc.Filters {
		defs[f.Key] = f
	}
	for key, ops := range req.Filters {
		def, ok := defs[key]
		if !ok {
			return nil, &filterError{key, "unknown"}
		}
		c := cond{key: key}
		bad := func(r string) error { return &filterError{key, r} }
		for op, raw := range ops {
			switch {
			case def.Widget == "range" && (op == "gte" || op == "lte"):
				if string(raw) == "null" {
					continue
				}
				var n float64
				if err := json.Unmarshal(raw, &n); err != nil {
					return nil, bad("number expected")
				}
				if op == "gte" {
					c.min = &n
				} else {
					c.max = &n
				}
			case (def.Widget == "multi" || def.Widget == "ref") && op == "in",
				def.Widget == "multi_all" && op == "all":
				var vals []string
				if err := json.Unmarshal(raw, &vals); err != nil || len(vals) > 100 {
					return nil, bad("list of strings expected")
				}
				for _, v := range vals {
					if def.Options != nil && !hasOption(def, v) {
						return nil, bad(fmt.Sprintf("invalid value %q", v))
					}
				}
				if op == "in" {
					c.in = vals
				} else {
					c.all = vals
				}
			case def.Widget == "toggle" && op == "eq":
				if err := json.Unmarshal(raw, &c.isTrue); err != nil {
					return nil, bad("true/false expected")
				}
			case def.Widget == "select" && op == "eq":
				if err := json.Unmarshal(raw, &c.eq); err != nil || !hasOption(def, c.eq) {
					return nil, bad("invalid value")
				}
				if key == "posted_within" {
					c.eq = "" // a new listing is always recent
				}
			default:
				return nil, bad(fmt.Sprintf("operator %q is not supported", op))
			}
		}
		m.conds = append(m.conds, c)
	}
	return m, nil
}

func hasOption(def clients.Filter, v string) bool {
	for _, o := range def.Options {
		if o.Value == v {
			return true
		}
	}
	return false
}

// value returns the listing value for a filter key.
func value(d *events.ListingDoc, key string) any {
	switch key {
	case "price":
		return float64(d.Price)
	case "city":
		return d.City.ID
	case "with_photo":
		return len(d.Photos) > 0
	}
	return d.Attributes[key]
}

func (m *matcher) match(d *events.ListingDoc) bool {
	if d.Category != m.category {
		return false
	}
	for _, c := range m.conds {
		if !c.match(value(d, c.key)) {
			return false
		}
	}
	if len(m.words) == 0 {
		return true
	}
	var b strings.Builder
	b.WriteString(d.Title + " " + d.SearchText + " " + d.Description)
	for _, t := range d.I18n {
		b.WriteString(" " + t.Title)
	}
	text := strings.ToLower(b.String())
	for _, w := range m.words {
		if !strings.Contains(text, w) {
			return false
		}
	}
	return true
}

func (c cond) match(v any) bool {
	if c.min != nil || c.max != nil {
		n, ok := v.(float64)
		if !ok {
			return false
		}
		return (c.min == nil || n >= *c.min) && (c.max == nil || n <= *c.max)
	}
	has := func(want string) bool {
		switch x := v.(type) {
		case string:
			return x == want
		case float64:
			return fmt.Sprint(x) == want
		case bool:
			return fmt.Sprint(x) == want
		case []any:
			for _, it := range x {
				if fmt.Sprint(it) == want {
					return true
				}
			}
		}
		return false
	}
	if len(c.in) > 0 {
		ok := false
		for _, w := range c.in {
			ok = ok || has(w)
		}
		if !ok {
			return false
		}
	}
	for _, w := range c.all {
		if !has(w) {
			return false
		}
	}
	if c.isTrue && v != true {
		return false
	}
	if c.eq != "" && !has(c.eq) {
		return false
	}
	return true
}
