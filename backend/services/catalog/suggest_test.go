package main

import "testing"

func TestMatchFolding(t *testing.T) {
	cases := []struct {
		q, text string
		want    bool
	}{
		{"okt", "Škoda Octavia", true},
		{"skoda okt", "Škoda Octavia", true},
		{"plzen", "Plzeň", true},
		{"фольк", "Фольксваген", true},
		{"2+kk", "2+kk", true},
		{"fabia", "Škoda Octavia", false},
	}
	for _, c := range cases {
		if got := matchAll(tokens(c.q), tokens(c.text)); got != c.want {
			t.Errorf("%q in %q: got %v", c.q, c.text, got)
		}
	}
}
