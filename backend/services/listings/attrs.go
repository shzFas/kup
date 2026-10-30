package main

import (
	"fmt"
	"math"
	"regexp"
	"strconv"
	"strings"

	"kup/pkg/clients"
)

// derived holds everything computed from validated attributes.
type derived struct {
	Attributes  map[string]any
	Labels      map[string]string
	Title       string
	Highlights  []string
	PriceSuffix string
	SearchText  string
}

var vinRe = regexp.MustCompile(`^[A-HJ-NPR-Z0-9]{17}$`)

// validateAttributes checks raw input against the category schema and returns
// cleaned values. Errors are keyed as "attributes.<key>".
func validateAttributes(sc *clients.Schema, refs map[string]map[string]clients.RefItem, raw map[string]any) (map[string]any, map[string]string) {
	errs := map[string]string{}
	out := map[string]any{}
	known := map[string]bool{}
	for _, a := range sc.Attributes {
		known[a.Key] = true
	}
	for k := range raw {
		if !known[k] {
			errs["attributes."+k] = "Неизвестное поле"
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
				errs[field] = "Обязательное поле"
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
		val, msg := checkValue(a, v, refs, out, parentLabel)
		if msg != "" {
			errs[field] = msg
			continue
		}
		if val == false {
			continue // an unticked checkbox means "not specified", not "Нет"
		}
		out[a.Key] = val
	}
	crossCheck(sc.Category, out, errs)
	return out, errs
}

// crossCheck validates rules that involve several attributes.
func crossCheck(category string, a map[string]any, errs map[string]string) {
	if category != "apartments" {
		return
	}
	floor, ok1 := num(a["floor"])
	total, ok2 := num(a["floors_total"])
	if ok1 && ok2 && floor > total {
		errs["attributes.floor"] = "Этаж не может быть выше этажности дома"
	}
	kitchen, ok1 := num(a["area_kitchen"])
	area, ok2 := num(a["area_total"])
	if ok1 && ok2 && kitchen >= area {
		errs["attributes.area_kitchen"] = "Кухня должна быть меньше общей площади"
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

func checkValue(a clients.Attribute, v any, refs map[string]map[string]clients.RefItem, cur map[string]any, parentLabel string) (any, string) {
	switch a.Type {
	case "int", "decimal":
		f, ok := toNumber(v)
		if !ok || math.IsNaN(f) || math.IsInf(f, 0) {
			return nil, "Введите число"
		}
		if a.Type == "int" && f != math.Trunc(f) {
			return nil, "Введите целое число"
		}
		if a.Min != nil && f < *a.Min {
			return nil, "Минимум " + fmtNum(*a.Min)
		}
		if a.Max != nil && f > *a.Max {
			return nil, "Максимум " + fmtNum(*a.Max)
		}
		if a.Type == "int" {
			return int64(f), ""
		}
		return math.Round(f*100) / 100, ""
	case "enum":
		s, ok := v.(string)
		if !ok || !hasOption(a, s) {
			return nil, "Выберите значение из списка"
		}
		return s, ""
	case "multi_enum":
		arr, ok := v.([]any)
		if !ok {
			return nil, "Ожидается список"
		}
		seen := map[string]bool{}
		res := []string{}
		for _, it := range arr {
			s, ok := it.(string)
			if !ok || !hasOption(a, s) {
				return nil, "Недопустимое значение"
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
			return nil, "Ожидается да/нет"
		}
		return b, ""
	case "ref":
		s, ok := v.(string)
		if !ok {
			return nil, "Выберите значение из списка"
		}
		item, ok := refs[*a.Ref][s]
		if !ok {
			return nil, "Выберите значение из списка"
		}
		if a.Parent != nil {
			if p, _ := cur[*a.Parent].(string); item.Parent == nil || *item.Parent != p {
				return nil, "Не подходит к выбранному значению поля «" + parentLabel + "»"
			}
		}
		return s, ""
	case "text":
		s, ok := v.(string)
		if !ok {
			return nil, "Ожидается текст"
		}
		s = strings.TrimSpace(s)
		if len([]rune(s)) > 200 {
			return nil, "Не более 200 символов"
		}
		if a.Key == "vin" {
			s = strings.ToUpper(s)
			if !vinRe.MatchString(s) {
				return nil, "VIN — 17 символов (латиница без I, O, Q и цифры)"
			}
		}
		return s, ""
	}
	return nil, "Неподдерживаемый тип"
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

// addComputed fills in server-side attributes (license category, floor flags...).
func addComputed(category string, attrs map[string]any, price int64) {
	switch category {
	case "motorcycles":
		cc, _ := num(attrs["engine_cc"])
		hp, hasHP := num(attrs["power_hp"])
		switch {
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
		attrs["floor_label"] = fmt.Sprintf("%d/%d эт.", int(floor), int(total))
		if attrs["deal_type"] == "sale" {
			if area, ok := num(attrs["area_total"]); ok && area > 0 {
				attrs["price_per_m2"] = int64(math.Round(float64(price) / area))
			}
		}
	}
}

// labelFor renders a value for display ("85 000 км", "Автомат", "Да").
func labelFor(a clients.Attribute, v any, refs map[string]map[string]clients.RefItem) string {
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
		parts := make([]string, len(vals))
		for i, s := range vals {
			parts[i] = optionLabel(a, s)
		}
		return strings.Join(parts, ", ")
	case "bool":
		if v == true {
			return "Да"
		}
		return "Нет"
	case "ref":
		if it, ok := refs[*a.Ref][fmt.Sprint(v)]; ok {
			return it.Name
		}
	}
	return fmt.Sprint(v)
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

// groupNum formats 85000 as "85 000" (non-breaking spaces), keeping decimals.
func groupNum(f float64) string {
	s := strconv.FormatFloat(math.Abs(f), 'f', -1, 64)
	intPart, frac, _ := strings.Cut(s, ".")
	var b strings.Builder
	for i, r := range intPart {
		if i > 0 && (len(intPart)-i)%3 == 0 {
			b.WriteRune(' ')
		}
		b.WriteRune(r)
	}
	res := b.String()
	if frac != "" {
		res += "," + frac
	}
	if f < 0 {
		res = "-" + res
	}
	return res
}

// derive builds labels, title, highlights and search text for validated attributes.
func derive(sc *clients.Schema, refs map[string]map[string]clients.RefItem, attrs map[string]any, cityName string) derived {
	d := derived{Attributes: attrs, Labels: map[string]string{}}
	var search []string
	for _, a := range sc.Attributes {
		v, ok := attrs[a.Key]
		if !ok {
			continue
		}
		d.Labels[a.Key] = labelFor(a, v, refs)
		if a.Type == "ref" {
			if it, ok := refs[*a.Ref][fmt.Sprint(v)]; ok {
				search = append(search, it.Name)
				search = append(search, it.Aliases...)
			}
		} else if a.Type == "enum" || a.Type == "multi_enum" {
			search = append(search, d.Labels[a.Key])
		}
	}
	d.Title = makeTitle(sc.Category, d.Labels, attrs)
	for _, k := range sc.Highlights {
		if l, ok := d.Labels[k]; ok && l != "" {
			d.Highlights = append(d.Highlights, l)
		}
	}
	if d.Highlights == nil {
		d.Highlights = []string{}
	}
	switch attrs["deal_type"] {
	case "rent_long":
		d.PriceSuffix = "/мес"
	case "rent_daily":
		d.PriceSuffix = "/сутки"
	}
	d.SearchText = strings.Join(append([]string{d.Title, cityName}, search...), " ")
	return d
}

func makeTitle(category string, l map[string]string, attrs map[string]any) string {
	switch category {
	case "apartments":
		var kind string
		switch attrs["rooms"] {
		case "studio":
			kind = "Студия"
		case "5":
			kind = "5+-комн. квартира"
		default:
			kind = fmt.Sprintf("%s-комн. квартира", attrs["rooms"])
		}
		return fmt.Sprintf("%s, %s, %s", kind, l["area_total"], l["floor_label"])
	default:
		t := strings.TrimSpace(l["make"] + " " + l["model"])
		if y := l["year"]; y != "" {
			t += ", " + y
		}
		return t
	}
}
