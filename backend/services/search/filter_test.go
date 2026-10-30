package main

import (
	"encoding/json"
	"strings"
	"testing"

	"kup/pkg/clients"
)

func ops(t *testing.T, s string) map[string]json.RawMessage {
	var m map[string]json.RawMessage
	if err := json.Unmarshal([]byte(s), &m); err != nil {
		t.Fatal(err)
	}
	return m
}

func TestFilterExpr(t *testing.T) {
	fuel := clients.Filter{Key: "fuel", Widget: "multi", Options: []clients.Option{{Value: "petrol"}, {Value: "diesel"}}}
	cases := []struct {
		def  clients.Filter
		in   string
		want string
	}{
		{clients.Filter{Key: "year", Widget: "range"}, `{"gte":2015,"lte":2020}`, "attrs.year >= 2015 AND attrs.year <= 2020"},
		{clients.Filter{Key: "price", Widget: "range"}, `{"lte":5000000}`, "price <= 5000000"},
		{fuel, `{"in":["petrol","diesel"]}`, `attrs.fuel IN ["petrol", "diesel"]`},
		{clients.Filter{Key: "city", Widget: "ref"}, `{"in":["almaty"]}`, `city_id IN ["almaty"]`},
		{clients.Filter{Key: "options", Widget: "multi_all", Options: []clients.Option{{Value: "abs"}, {Value: "esp"}}}, `{"all":["abs","esp"]}`, `attrs.options = "abs" AND attrs.options = "esp"`},
		{clients.Filter{Key: "customs_cleared", Widget: "toggle"}, `{"eq":true}`, "attrs.customs_cleared = true"},
		{clients.Filter{Key: "customs_cleared", Widget: "toggle"}, `{"eq":false}`, ""},
	}
	for _, c := range cases {
		got, err := filterExpr(c.def, ops(t, c.in))
		if err != nil || got != c.want {
			t.Errorf("%s %s: got %q, %v; want %q", c.def.Key, c.in, got, err, c.want)
		}
	}
}

func TestFilterExprRejects(t *testing.T) {
	fuel := clients.Filter{Key: "fuel", Widget: "multi", Options: []clients.Option{{Value: "petrol"}}}
	bad := []struct {
		def clients.Filter
		in  string
	}{
		{fuel, `{"in":["gas"]}`}, // not an option
		{fuel, `{"gte":1}`},      // wrong operator for widget
		{clients.Filter{Key: "make", Widget: "ref"}, `{"in":["a\" OR x = \"b"]}`}, // injection attempt
		{clients.Filter{Key: "year", Widget: "range"}, `{"gte":"abc"}`},
	}
	for _, c := range bad {
		if _, err := filterExpr(c.def, ops(t, c.in)); err == nil {
			t.Errorf("%s %s: expected error", c.def.Key, c.in)
		}
	}
}

func TestPostedWithin(t *testing.T) {
	def := clients.Filter{Key: "posted_within", Widget: "select", Options: []clients.Option{{Value: "7"}}}
	got, err := filterExpr(def, ops(t, `{"eq":"7"}`))
	if err != nil || !strings.HasPrefix(got, "published_ts >= ") {
		t.Errorf("got %q, %v", got, err)
	}
}

func TestDisjunctiveFacets(t *testing.T) {
	p := &plan{base: []string{`category = "cars"`}, byKey: map[string]string{"make": "M", "fuel": "F"}}
	all := strings.Join(p.filters(""), "|")
	noMake := strings.Join(p.filters("make"), "|")
	if all != `category = "cars"|F|M` || noMake != `category = "cars"|F` {
		t.Errorf("all=%q noMake=%q", all, noMake)
	}
}
