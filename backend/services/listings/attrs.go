package main

import (
	"fmt"
	"math"
	"regexp"
	"strconv"
	"strings"

	"kup/pkg/clients"
	"kup/pkg/events"
	"kup/pkg/i18n"
)

// localized holds display texts for one language.
type localized = events.Localized

// derived holds everything computed from validated attributes.
type derived struct {
	Attributes map[string]any
	I18n       map[string]localized // by language code
	SearchText string               // all languages, for full-text search
}

type refMap = map[string]map[string]clients.RefItem

var vinRe = regexp.MustCompile(`^[A-HJ-NPR-Z0-9]{17}$`)

// validateAttributes checks raw input against the category schema and returns
// cleaned values. Errors are keyed as "attributes.<key>" and written in lang.
func validateAttributes(sc *clients.Schema, refs refMap, raw map[string]any, lang i18n.Lang) (map[string]any, map[string]string) {
	errs := map[string]string{}
	out := map[string]any{}
	known := map[string]bool{}
	for _, a := range sc.Attributes {
		known[a.Key] = true
	}
	for k := range raw {
		if !known[k] {
			errs["attributes."+k] = i18n.T(lang, "unknown_field")
		}
	}

	for _, a := range sc.Attributes {
		if a.Computed || !depMet(a.DependsOn, out) {
			continue // dropped: computed by us or not applicable
		}
		field := "attributes." + a.Key
		v, present := raw[a.Key]
		if present && isEmpty(v) {
			present = false
		}
		if !present {
			if a.Required {
				errs[field] = i18n.T(lang, "required")
			}
			continue
		}
		parentLabel := ""
		if a.Parent != nil {
			for _, p := range sc.Attributes {
				if p.Key == *a.Parent {
					parentLabel = p.Label
				}
			}
		}
		val, msg := checkValue(a, v, refs, out, parentLabel, lang)
		if msg != "" {
			errs[field] = msg
			continue
		}
		if val == false {
			continue // an unticked checkbox means "not specified", not "No"
		}
		out[a.Key] = val
	}
	crossCheck(sc.Category, out, errs, lang)
	return out, errs
}

// crossCheck validates rules that involve several attributes.
func crossCheck(category string, a map[string]any, errs map[string]string, lang i18n.Lang) {
	if category != "apartments" {
		return
	}
	floor, ok1 := num(a["floor"])
	total, ok2 := num(a["floors_total"])
	if ok1 && ok2 && floor > total {
		errs["attributes.floor"] = i18n.T(lang, "floor_above_total")
	}
}

func isEmpty(v any) bool {
	switch x := v.(type) {
	case nil:
		return true
	case string:
		return strings.TrimSpace(x) == ""
	case []any:
		return len(x) == 0
	}
	return false
}

func depMet(d *clients.DependsOn, vals map[string]any) bool {
	if d == nil {
		return true
	}
	v, ok := vals[d.Key]
	if !ok {
		return false
	}
	s := fmt.Sprint(v)
	for _, want := range d.Values {
		if want == s {
			return true
		}
	}
	return false
}

func toNumber(v any) (float64, bool) {
	switch x := v.(type) {
	case float64:
		return x, true
	case string:
		f, err := strconv.ParseFloat(strings.ReplaceAll(strings.TrimSpace(x), ",", "."), 64)
		return f, err == nil
	}
	return 0, false
}

func checkValue(a clients.Attribute, v any, refs refMap, cur map[string]any, parentLabel string, lang i18n.Lang) (any, string) {
	t := func(key string, args ...any) string { return i18n.T(lang, key, args...) }
	switch a.Type {
	case "int", "decimal":
		f, ok := toNumber(v)
		if !ok || math.IsNaN(f) || math.IsInf(f, 0) {
			return nil, t("enter_number")
		}
		if a.Type == "int" && f != math.Trunc(f) {
			return nil, t("enter_integer")
		}
		if a.Min != nil && f < *a.Min {
			return nil, t("min", fmtNum(*a.Min))
		}
		if a.Max != nil && f > *a.Max {
			return nil, t("max", fmtNum(*a.Max))
		}
		if a.Type == "int" {
			return int64(f), ""
		}
		return math.Round(f*100) / 100, ""
	case "enum":
		s, ok := v.(string)
		if !ok || !hasOption(a, s) {
			return nil, t("choose_option")
		}
		return s, ""
	case "multi_enum":
		arr, ok := v.([]any)
		if !ok {
			return nil, t("expect_list")
		}
		seen := map[string]bool{}
		res := []string{}
		for _, it := range arr {
			s, ok := it.(string)
			if !ok || !hasOption(a, s) {
				return nil, t("bad_value")
			}
			if !seen[s] {
				seen[s] = true
				res = append(res, s)
			}
		}
		return res, ""
	case "bool":
		b, ok := v.(bool)
		if !ok {
			return nil, t("expect_bool")
		}
		return b, ""
	case "ref":
		s, ok := v.(string)
		if !ok {
			return nil, t("choose_option")
		}
		item, ok := refs[*a.Ref][s]
		if !ok {
			return nil, t("choose_option")
		}
		if a.Parent != nil {
			if p, _ := cur[*a.Parent].(string); item.Parent == nil || *item.Parent != p {
				return nil, t("parent_mismatch", parentLabel)
			}
		}
		return s, ""
	case "text":
		s, ok := v.(string)
		if !ok {
			return nil, t("expect_text")
		}
		s = strings.TrimSpace(s)
		if len([]rune(s)) > 200 {
			return nil, t("text_200")
		}
		if a.Key == "vin" {
			s = strings.ToUpper(s)
			if !vinRe.MatchString(s) {
				return nil, t("vin_format")
			}
		}
		return s, ""
	}
	return nil, t("unsupported_type")
}

func hasOption(a clients.Attribute, v string) bool {
	for _, o := range a.Options {
		if o.Value == v {
			return true
		}
	}
	return false
}

func num(v any) (float64, bool) {
	switch x := v.(type) {
	case int64:
		return float64(x), true
	case float64:
		return x, true
	}
	return 0, false
}

// addComputed fills in server-side attributes (licence category, floor flags...).
func addComputed(category string, attrs map[string]any, price int64) {
	switch category {
	case "motorcycles":
		// EU licence categories: AM ≤ 50 cm³; A1 ≤ 125 cm³ and ≤ 11 kW (~15 hp); A2 ≤ 35 kW (~47 hp); otherwise A.
		cc, _ := num(attrs["engine_cc"])
		hp, hasHP := num(attrs["power_hp"])
		switch {
		case cc > 0 && cc <= 50:
			attrs["license_category"] = "AM"
		case cc <= 125 && (!hasHP || hp <= 15):
			attrs["license_category"] = "A1"
		case hasHP && hp <= 47:
			attrs["license_category"] = "A2"
		default:
			attrs["license_category"] = "A"
		}
	case "apartments":
		floor, _ := num(attrs["floor"])
		total, _ := num(attrs["floors_total"])
		attrs["not_first_floor"] = floor > 1
		attrs["not_last_floor"] = floor < total
		attrs["floor_label"] = fmt.Sprintf("%d/%d", int(floor), int(total))
		if attrs["deal_type"] == "sale" {
			if area, ok := num(attrs["area_total"]); ok && area > 0 {
				attrs["price_per_m2"] = int64(math.Round(float64(price) / area))
			}
		}
	}
}

// labelFor renders a value for display ("85 000 km", "Automat", "Ano").
func labelFor(a clients.Attribute, v any, refs refMap, lang i18n.Lang) string {
	if a.Key == "floor_label" {
		var f, t int
		if _, err := fmt.Sscanf(fmt.Sprint(v), "%d/%d", &f, &t); err == nil {
			return i18n.T(lang, "floor_of", f, t)
		}
	}
	unit := ""
	if a.Unit != nil {
		unit = " " + *a.Unit
	}
	switch a.Type {
	case "int", "decimal":
		f, _ := num(v)
		if a.Unit == nil {
			return fmtNum(f) // years, floors: no thousands grouping
		}
		return groupNum(f) + unit
	case "enum":
		return optionLabel(a, fmt.Sprint(v))
	case "multi_enum":
		vals, _ := v.([]string)
		if vals == nil {
			for _, x := range anySlice(v) {
				vals = append(vals, fmt.Sprint(x))
			}
		}
		parts := make([]string, len(vals))
		for i, s := range vals {
			parts[i] = optionLabel(a, s)
		}
		return strings.Join(parts, ", ")
	case "bool":
		if v == true {
			return i18n.T(lang, "yes")
		}
		return i18n.T(lang, "no")
	case "ref":
		if it, ok := refs[*a.Ref][fmt.Sprint(v)]; ok {
			return it.Name(string(lang))
		}
	}
	return fmt.Sprint(v)
}

func anySlice(v any) []any {
	a, _ := v.([]any)
	return a
}

func optionLabel(a clients.Attribute, v string) string {
	for _, o := range a.Options {
		if o.Value == v {
			return o.Label
		}
	}
	return v
}

func fmtNum(f float64) string {
	return strings.Replace(strconv.FormatFloat(f, 'f', -1, 64), ".", ",", 1)
}

// groupNum formats 85000 as "85 000" (non-breaking spaces), keeping decimals; 4-digit numbers stay ungrouped.
func groupNum(f float64) string {
	s := strconv.FormatFloat(math.Abs(f), 'f', -1, 64)
	intPart, frac, _ := strings.Cut(s, ".")
	if math.Abs(f) >= 10000 {
		var b strings.Builder
		for i, r := range intPart {
			if i > 0 && (len(intPart)-i)%3 == 0 {
				b.WriteRune(' ')
			}
			b.WriteRune(r)
		}
		intPart = b.String()
	}
	res := intPart
	if frac != "" {
		res += "," + frac
	}
	if f < 0 {
		res = "-" + res
	}
	return res
}

// derive builds labels, title and highlights in every language plus search text.
// schemas holds the category schema per language.
func derive(schemas map[i18n.Lang]*clients.Schema, refs refMap, attrs map[string]any, city clients.RefItem) derived {
	d := derived{Attributes: attrs, I18n: map[string]localized{}}
	search := map[string]bool{}
	addSearch := func(s ...string) {
		for _, v := range s {
			if v = strings.TrimSpace(v); v != "" {
				search[v] = true
			}
		}
	}
	addSearch(city.Aliases...)
	for _, lang := range i18n.All {
		sc := schemas[lang]
		loc := localized{Labels: map[string]string{}, Highlights: []string{}}
		for _, a := range sc.Attributes {
			v, ok := attrs[a.Key]
			if !ok {
				continue
			}
			loc.Labels[a.Key] = labelFor(a, v, refs, lang)
			switch a.Type {
			case "ref":
				if it, ok := refs[*a.Ref][fmt.Sprint(v)]; ok {
					addSearch(it.Name(string(lang)))
					addSearch(it.Aliases...)
				}
			case "enum", "multi_enum":
				addSearch(loc.Labels[a.Key])
			}
		}
		loc.Title = makeTitle(sc.Category, loc.Labels, lang)
		for _, k := range sc.Highlights {
			if l, ok := loc.Labels[k]; ok && l != "" {
				loc.Highlights = append(loc.Highlights, l)
			}
		}
		if attrs["deal_type"] == "rent_long" {
			loc.PriceSuffix = i18n.T(lang, "per_month")
		}
		addSearch(loc.Title, city.Name(string(lang)))
		d.I18n[string(lang)] = loc
	}
	parts := make([]string, 0, len(search))
	for s := range search {
		parts = append(parts, s)
	}
	d.SearchText = strings.Join(parts, " ")
	return d
}

func makeTitle(category string, l map[string]string, lang i18n.Lang) string {
	if category == "apartments" {
		return i18n.T(lang, "apt_title", l["layout"], l["area_total"], l["floor_label"])
	}
	t := strings.TrimSpace(l["make"] + " " + l["model"])
	if y := l["year"]; y != "" {
		t += ", " + y
	}
	return t
}
