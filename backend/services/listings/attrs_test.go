package main

import (
	"image"
	"image/color"
	"testing"

	"kup/pkg/clients"
)

func p[T any](v T) *T { return &v }

var testRefs = map[string]map[string]clients.RefItem{
	"car_make":  {"toyota": {ID: "toyota", Name: "Toyota", Aliases: []string{"тойота"}}, "bmw": {ID: "bmw", Name: "BMW"}},
	"car_model": {"toyota-camry": {ID: "toyota-camry", Name: "Camry", Parent: p("toyota"), Aliases: []string{"камри"}}},
}

var carSchema = &clients.Schema{
	Category:   "cars",
	Highlights: []string{"year", "mileage_km", "fuel"},
	Attributes: []clients.Attribute{
		{Key: "make", Type: "ref", Label: "Марка", Required: true, Ref: p("car_make")},
		{Key: "model", Type: "ref", Label: "Модель", Required: true, Ref: p("car_model"), Parent: p("make")},
		{Key: "year", Type: "int", Label: "Год", Required: true, Min: p(1960.0), Max: p(2027.0)},
		{Key: "mileage_km", Type: "int", Label: "Пробег", Unit: p("км"), Required: true},
		{Key: "fuel", Type: "enum", Label: "Топливо", Required: true, Options: []clients.Option{{Value: "petrol", Label: "Бензин"}, {Value: "electric", Label: "Электро"}}},
		{Key: "engine_volume", Type: "decimal", Label: "Объём", Unit: p("л"), Required: true, DependsOn: &clients.DependsOn{Key: "fuel", Values: []string{"petrol"}}},
		{Key: "options", Type: "multi_enum", Label: "Опции", Options: []clients.Option{{Value: "abs", Label: "ABS"}}},
		{Key: "vin", Type: "text", Label: "VIN"},
	},
}

func TestValidateOK(t *testing.T) {
	raw := map[string]any{"make": "toyota", "model": "toyota-camry", "year": 2018.0, "mileage_km": "85000",
		"fuel": "petrol", "engine_volume": 2.5, "options": []any{"abs", "abs"}, "vin": "jtnb11hk103456789"}
	out, errs := validateAttributes(carSchema, testRefs, raw)
	if len(errs) != 0 {
		t.Fatalf("unexpected errors: %v", errs)
	}
	if out["year"] != int64(2018) || out["mileage_km"] != int64(85000) {
		t.Errorf("ints not normalized: %#v", out)
	}
	if got := out["options"].([]string); len(got) != 1 {
		t.Errorf("multi_enum not deduped: %v", got)
	}
	if out["vin"] != "JTNB11HK103456789" {
		t.Errorf("vin not uppercased: %v", out["vin"])
	}
	d := derive(carSchema, testRefs, out, "Алматы")
	if d.Title != "Toyota Camry, 2018" {
		t.Errorf("title = %q", d.Title)
	}
	if d.Labels["mileage_km"] != "85 000 км" || d.Labels["year"] != "2018" || d.Labels["engine_volume"] != "2,5 л" {
		t.Errorf("labels = %#v", d.Labels)
	}
	if len(d.Highlights) != 3 {
		t.Errorf("highlights = %v", d.Highlights)
	}
}

func TestValidateErrors(t *testing.T) {
	raw := map[string]any{"make": "bmw", "model": "toyota-camry", "year": 1900.0, "fuel": "electric", "engine_volume": 2.0, "junk": 1.0}
	out, errs := validateAttributes(carSchema, testRefs, raw)
	for _, k := range []string{"attributes.model", "attributes.year", "attributes.mileage_km", "attributes.junk"} {
		if errs[k] == "" {
			t.Errorf("expected error for %s, got %v", k, errs)
		}
	}
	if _, ok := out["engine_volume"]; ok {
		t.Error("engine_volume must be dropped when fuel=electric")
	}
	if errs["attributes.engine_volume"] != "" {
		t.Error("no error expected for non-applicable field")
	}
}

func TestComputedApartments(t *testing.T) {
	a := map[string]any{"deal_type": "sale", "rooms": "2", "floor": int64(1), "floors_total": int64(9), "area_total": 50.0}
	addComputed("apartments", a, 25_000_000)
	if a["not_first_floor"] != false || a["not_last_floor"] != true || a["price_per_m2"] != int64(500000) || a["floor_label"] != "1/9 эт." {
		t.Errorf("computed = %#v", a)
	}
	labels := map[string]string{"area_total": "50 м²", "floor_label": "1/9 эт."}
	if got := makeTitle("apartments", labels, a); got != "2-комн. квартира, 50 м², 1/9 эт." {
		t.Errorf("title = %q", got)
	}
}

func TestLicenseCategory(t *testing.T) {
	cases := []struct {
		cc, hp float64
		want   string
	}{{125, 11, "A1"}, {400, 45, "A2"}, {1000, 200, "A"}}
	for _, c := range cases {
		a := map[string]any{"engine_cc": int64(c.cc), "power_hp": int64(c.hp)}
		addComputed("motorcycles", a, 0)
		if a["license_category"] != c.want {
			t.Errorf("%v cc %v hp: got %v want %v", c.cc, c.hp, a["license_category"], c.want)
		}
	}
}

func TestOrientation(t *testing.T) {
	src := image.NewRGBA(image.Rect(0, 0, 3, 2))
	src.Set(0, 0, color.RGBA{255, 0, 0, 255}) // red top-left
	out := applyOrientation(src, 6)           // rotate 90° clockwise
	if b := out.Bounds(); b.Dx() != 2 || b.Dy() != 3 {
		t.Fatalf("bounds = %v", b)
	}
	if r, _, _, _ := out.At(1, 0).RGBA(); r>>8 != 255 {
		t.Error("after 90° CW the top-left pixel should be at top-right")
	}
}
