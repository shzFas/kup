package main

import (
	"encoding/json"
	"testing"

	"kup/pkg/clients"
	"kup/pkg/events"
)

var schema = &clients.Schema{Category: "cars", Filters: []clients.Filter{
	{Key: "price", Widget: "range"},
	{Key: "city", Widget: "ref"},
	{Key: "make", Widget: "ref"},
	{Key: "fuel", Widget: "multi", Options: []clients.Option{{Value: "petrol"}, {Value: "diesel"}}},
	{Key: "options", Widget: "multi_all"},
	{Key: "with_photo", Widget: "toggle"},
	{Key: "seller_langs", Widget: "multi", Options: []clients.Option{{Value: "ru"}, {Value: "uk"}}},
}}

func req(t *testing.T, s string) searchRequest {
	var r searchRequest
	if err := json.Unmarshal([]byte(s), &r); err != nil {
		t.Fatal(err)
	}
	return r
}

func TestMatch(t *testing.T) {
	doc := &events.ListingDoc{Category: "cars", Title: "Škoda Octavia, 2019", Price: 350000, City: events.City{ID: "praha"},
		Photos: []string{"x"}, Attributes: map[string]any{"make": "skoda", "fuel": "diesel", "options": []any{"abs", "navi"},
			"seller_langs": []any{"ru", "cs"}},
		I18n: map[string]events.Localized{"cs": {Title: "Škoda Octavia, 2019"}}}
	cases := []struct {
		req  string
		want bool
	}{
		{`{"category":"cars","filters":{}}`, true},
		{`{"category":"cars","filters":{"price":{"lte":400000}}}`, true},
		{`{"category":"cars","filters":{"price":{"gte":400000}}}`, false},
		{`{"category":"cars","filters":{"city":{"in":["praha","brno"]}}}`, true},
		{`{"category":"cars","filters":{"city":{"in":["brno"]}}}`, false},
		{`{"category":"cars","filters":{"fuel":{"in":["petrol"]}}}`, false},
		{`{"category":"cars","filters":{"options":{"all":["abs","navi"]}}}`, true},
		{`{"category":"cars","filters":{"options":{"all":["abs","leather"]}}}`, false},
		{`{"category":"cars","filters":{"with_photo":{"eq":true}}}`, true},
		{`{"category":"cars","filters":{"seller_langs":{"in":["uk","ru"]}}}`, true},
		{`{"category":"cars","query":"octavia","filters":{}}`, true},
		{`{"category":"cars","query":"fabia","filters":{}}`, false},
	}
	for _, c := range cases {
		m, err := compile(req(t, c.req), schema)
		if err != nil {
			t.Fatalf("%s: %v", c.req, err)
		}
		if got := m.match(doc); got != c.want {
			t.Errorf("%s: got %v want %v", c.req, got, c.want)
		}
	}
}

func TestCompileErrors(t *testing.T) {
	for _, s := range []string{
		`{"category":"cars","filters":{"junk":{"in":["a"]}}}`,
		`{"category":"cars","filters":{"fuel":{"in":["coal"]}}}`,
		`{"category":"cars","filters":{"price":{"in":["1"]}}}`,
	} {
		if _, err := compile(req(t, s), schema); err == nil {
			t.Errorf("%s: expected error", s)
		}
	}
}
