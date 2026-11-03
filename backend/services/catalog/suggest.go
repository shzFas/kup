package main

import (
	"sort"
	"strconv"
	"strings"
	"unicode"

	"golang.org/x/text/runes"
	"golang.org/x/text/transform"
	"golang.org/x/text/unicode/norm"

	"kup/pkg/i18n"
)

// suggestEntry is one thing the search box can suggest.
type suggestEntry struct {
	typ      string // category | make | model | city | layout
	rank     int    // lower = shown first on equal score
	label    text
	sublabel text // category name, empty for categories
	category string
	filters  map[string]any
	tokens   []string // normalized words from every language + aliases
	primary  []string // normalized words of the label itself (boost)
}

type suggestion struct {
	Type     string         `json:"type"`
	Label    string         `json:"label"`
	Sublabel *string        `json:"sublabel"`
	Category string         `json:"category"`
	Filters  map[string]any `json:"filters"`
}

var stripMarks = transform.Chain(norm.NFD, runes.Remove(runes.In(unicode.Mn)), norm.NFC)

// normalize lowercases, removes diacritics (š→s, ř→r) and folds ё→е, ї→і.
func normalize(s string) string {
	out, _, err := transform.String(stripMarks, strings.ToLower(s))
	if err != nil {
		out = strings.ToLower(s)
	}
	return strings.NewReplacer("ё", "е", "ї", "і", "й", "и").Replace(out)
}

// tokens splits text into normalized words. "2+kk" stays one token.
func tokens(s string) []string {
	return strings.FieldsFunc(normalize(s), func(r rune) bool {
		return !(unicode.IsLetter(r) || unicode.IsDigit(r) || r == '+')
	})
}

// matchAll: every query word is a prefix of some token.
func matchAll(words, toks []string) bool {
	for _, w := range words {
		found := false
		for _, t := range toks {
			if strings.HasPrefix(t, w) {
				found = true
				break
			}
		}
		if !found {
			return false
		}
	}
	return true
}

func textTokens(t text, aliases []string) []string {
	var out []string
	for _, v := range t {
		out = append(out, tokens(v)...)
	}
	for _, a := range aliases {
		out = append(out, tokens(a)...)
	}
	return out
}

func refText(names map[string]string) text {
	t := text{}
	for l, v := range names {
		t[i18n.Lang(l)] = v
	}
	return t
}

func inFilter(key string, vals ...string) map[string]any {
	return map[string]any{key: map[string]any{"in": vals}}
}

// Categories that get a city suggestion ("Прага" → apartments in Praha, cars in Praha).
var cityCategories = []string{"apartments", "cars"}

func (s *store) buildSuggest(cats []categorySource) {
	catName := map[string]text{}
	for _, c := range cats {
		catName[c.Slug] = c.Name
		s.suggest = append(s.suggest, suggestEntry{typ: "category", rank: 4, label: c.Name, category: c.Slug,
			filters: map[string]any{}, tokens: textTokens(c.Name, nil), primary: textTokens(c.Name, nil)})
		for _, a := range c.Attributes {
			if a.Key != "layout" {
				continue
			}
			for _, o := range a.Options {
				toks := textTokens(o.Label, []string{o.Value})
				s.suggest = append(s.suggest, suggestEntry{typ: "layout", rank: 2, label: o.Label, sublabel: c.Name, category: c.Slug,
					filters: inFilter("layout", o.Value), tokens: toks, primary: toks})
			}
		}
	}
	for ref, cat := range s.refCat {
		if !strings.HasSuffix(ref, "_make") {
			continue
		}
		makes := map[string][]string{}
		makeNames := map[string]text{}
		for _, m := range s.refs[ref] {
			toks := textTokens(refText(m.Names), m.Aliases)
			makes[m.ID], makeNames[m.ID] = toks, refText(m.Names)
			s.suggest = append(s.suggest, suggestEntry{typ: "make", rank: 1, label: refText(m.Names), sublabel: catName[cat], category: cat,
				filters: inFilter("make", m.ID), tokens: toks, primary: toks})
		}
		for _, md := range s.refs[strings.TrimSuffix(ref, "_make")+"_model"] {
			parent := *md.Parent
			label := text{}
			for _, l := range i18n.All {
				label[l] = makeNames[parent].Get(l) + " " + md.Name(string(l))
			}
			own := textTokens(refText(md.Names), md.Aliases)
			s.suggest = append(s.suggest, suggestEntry{typ: "model", rank: 0, label: label, sublabel: catName[cat], category: cat,
				filters: map[string]any{"make": map[string]any{"in": []string{parent}}, "model": map[string]any{"in": []string{md.ID}}},
				tokens:  append(append([]string{}, makes[parent]...), own...), primary: own})
		}
	}
	for _, c := range s.refs["city"] {
		for _, cat := range cityCategories {
			toks := textTokens(refText(c.Names), c.Aliases)
			s.suggest = append(s.suggest, suggestEntry{typ: "city", rank: 3, label: refText(c.Names), sublabel: catName[cat], category: cat,
				filters: inFilter("city", c.ID), tokens: toks, primary: toks})
		}
	}
}

func (s *store) suggestFor(q, limitStr string, l i18n.Lang) []suggestion {
	limit, _ := strconv.Atoi(limitStr)
	if limit <= 0 || limit > 20 {
		limit = 8
	}
	words := tokens(q)
	out := []suggestion{}
	if len(words) == 0 || len(words) > 6 {
		return out
	}
	type scored struct {
		e     *suggestEntry
		score int
	}
	var hits []scored
	for i := range s.suggest {
		e := &s.suggest[i]
		if !matchAll(words, e.tokens) {
			continue
		}
		score := 0
		for _, w := range words {
			for _, t := range e.primary {
				if t == w {
					score += 3 // exact word
					break
				} else if strings.HasPrefix(t, w) {
					score++
					break
				}
			}
		}
		// A query that names only a make shouldn't be flooded by its models.
		if e.typ == "model" && len(words) == 1 && !matchAll(words, e.primary) {
			score -= 2
		}
		hits = append(hits, scored{e, score})
	}
	sort.SliceStable(hits, func(i, j int) bool {
		if hits[i].score != hits[j].score {
			return hits[i].score > hits[j].score
		}
		if hits[i].e.rank != hits[j].e.rank {
			return hits[i].e.rank < hits[j].e.rank
		}
		return hits[i].e.label.Get(l) < hits[j].e.label.Get(l)
	})
	seen := map[string]bool{}
	for _, h := range hits {
		key := h.e.typ + h.e.category + h.e.label.Get(l)
		if seen[key] {
			continue
		}
		seen[key] = true
		sug := suggestion{Type: h.e.typ, Label: h.e.label.Get(l), Category: h.e.category, Filters: h.e.filters}
		if len(h.e.sublabel) > 0 {
			sug.Sublabel = h.e.sublabel.Ptr(l)
		}
		out = append(out, sug)
		if len(out) == limit {
			break
		}
	}
	return out
}
