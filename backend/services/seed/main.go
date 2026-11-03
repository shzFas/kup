// Seed creates demo users and listings through the public API, generating
// attribute values from each category schema. Requires OTP_DEV_MODE=true.
//
//	go run ./services/seed -api http://localhost:8180 -n 200
package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	"io"
	"log"
	"math"
	"math/rand/v2"
	"mime/multipart"
	"net/http"
	"time"

	"kup/pkg/clients"
)

var api string

func main() {
	flag.StringVar(&api, "api", "http://localhost:8180", "gateway URL")
	n := flag.Int("n", 200, "number of listings")
	users := flag.Int("users", 5, "number of demo users")
	photos := flag.Int("photos", 2, "photos per listing")
	flag.Parse()

	var cats struct {
		Items []struct{ Slug string } `json:"items"`
	}
	must(call("GET", "/v1/categories", "", nil, &cats))
	schemas := map[string]*clients.Schema{}
	for _, c := range cats.Items {
		var s clients.Schema
		must(call("GET", "/v1/categories/"+c.Slug+"/schema", "", nil, &s))
		schemas[c.Slug] = &s
	}
	var cities refList
	must(call("GET", "/v1/refs/city", "", nil, &cities))

	var tokens []string
	for i := 0; i < *users; i++ {
		tokens = append(tokens, login(fmt.Sprintf("+420777%06d", 1000+i), demoNames[i%len(demoNames)]))
	}
	log.Printf("logged in %d users", len(tokens))

	created := 0
	for i := 0; i < *n; i++ {
		cat := cats.Items[i%len(cats.Items)].Slug
		tok := tokens[rand.IntN(len(tokens))]
		attrs := genAttrs(schemas[cat])
		var ids []string
		for k := 0; k < *photos; k++ {
			ids = append(ids, upload(tok))
		}
		body := map[string]any{
			"category": cat, "price": genPrice(cat, attrs), "currency": "CZK",
			"city": pickCity(cities), "description": descriptions[rand.IntN(len(descriptions))],
			"photos": ids, "attributes": attrs,
		}
		var res map[string]any
		if err := call("POST", "/v1/listings", tok, body, &res); err != nil {
			log.Printf("listing %d (%s): %v", i, cat, err)
			continue
		}
		created++
		if created%25 == 0 {
			log.Printf("created %d listings", created)
		}
	}
	log.Printf("done: %d listings", created)
}

type refList struct {
	Items []struct {
		ID string `json:"id"`
	} `json:"items"`
}

var demoNames = []string{"Олег", "Марія", "Jan Novák", "Анна", "Дмитрий", "Petra", "Тарас"}

// Mixed languages on purpose: that is what the board looks like for the CIS community in Czechia.
var descriptions = []string{
	"Отличное состояние, все вопросы по телефону. Говорю по-русски и по-чешски.",
	"Срочно, торг. Документы в порядке, STK действительна.",
	"Один владелец, сервисная книжка. Без вложений.",
	"Можливий обмін. Покажу в будь-який зручний час.",
	"Чистий, доглянутий. Реальному покупцю — знижка.",
	"Výborný stav, první majitel. Možná výměna.",
	"Pěkný stav, servisní knížka, nekuřácké.",
}

func pickCity(c refList) string {
	// Bias towards the biggest cities so demo filters show meaningful counts.
	if rand.Float64() < 0.6 {
		return []string{"praha", "praha", "brno", "ostrava", "plzen"}[rand.IntN(5)]
	}
	return c.Items[rand.IntN(len(c.Items))].ID
}

// realistic ranges for common keys; everything else uses schema min/max.
var ranges = map[string][2]float64{
	"year": {2005, 2026}, "mileage_km": {0, 250000}, "engine_volume": {1.2, 4.0}, "power_hp": {80, 320},
	"owners": {1, 4}, "seats": {2, 8}, "range_km": {200, 600}, "area_total": {22, 140},
	"floors_total": {2, 14}, "year_built": {1930, 2026}, "motor_w": {800, 6000}, "battery_kwh": {30, 95},
	"battery_ah": {20, 60}, "max_speed_kmh": {25, 110}, "deposit_czk": {10000, 60000}, "fees_czk": {1500, 6000},
	"stk_until_year": {2026, 2028},
}

func genAttrs(s *clients.Schema) map[string]any {
	out := map[string]any{}
	refsCache := map[string]refList{}
	for _, a := range s.Attributes {
		if a.Computed || a.Type == "text" || !depMet(a.DependsOn, out) {
			continue
		}
		if !a.Required && rand.Float64() < 0.3 {
			continue
		}
		switch a.Type {
		case "ref":
			path := "/v1/refs/" + *a.Ref
			if a.Parent != nil {
				path += "?parent=" + fmt.Sprint(out[*a.Parent])
			}
			list, ok := refsCache[path]
			if !ok {
				must(call("GET", path, "", nil, &list))
				refsCache[path] = list
			}
			if len(list.Items) > 0 {
				out[a.Key] = list.Items[rand.IntN(len(list.Items))].ID
			}
		case "enum":
			out[a.Key] = a.Options[rand.IntN(len(a.Options))].Value
		case "multi_enum":
			var vals []string
			for _, o := range a.Options {
				if rand.Float64() < 0.4 {
					vals = append(vals, o.Value)
				}
			}
			if len(vals) > 0 {
				out[a.Key] = vals
			}
		case "bool":
			out[a.Key] = rand.Float64() < 0.5
		case "int", "decimal":
			lo, hi := 0.0, 100.0
			if a.Min != nil {
				lo = *a.Min
			}
			if a.Max != nil {
				hi = *a.Max
			}
			if r, ok := ranges[a.Key]; ok {
				lo, hi = math.Max(lo, r[0]), math.Min(hi, r[1])
			}
			if a.Key == "engine_cc" {
				lo, hi = 50, 1300
				if s.Category == "mopeds" {
					hi = 180
				}
			}
			if a.Key == "floor" {
				lo, hi = 1, 20
			}
			v := lo + rand.Float64()*(hi-lo)
			if a.Key == "floors_total" {
				if f, ok := out["floor"].(int64); ok {
					v = float64(f) + rand.Float64()*12
				}
			}
			if a.Type == "int" {
				out[a.Key] = int64(math.Round(v))
			} else {
				out[a.Key] = math.Round(v*10) / 10
			}
		}
	}
	return out
}

func depMet(d *clients.DependsOn, vals map[string]any) bool {
	if d == nil {
		return true
	}
	v, ok := vals[d.Key]
	if !ok {
		return false
	}
	for _, want := range d.Values {
		if fmt.Sprint(v) == want {
			return true
		}
	}
	return false
}

func genPrice(cat string, attrs map[string]any) int64 {
	// CZK
	r := map[string][2]float64{"cars": {60e3, 1.5e6}, "motorcycles": {30e3, 500e3}, "mopeds": {5e3, 80e3}, "apartments": {2.5e6, 15e6}}[cat]
	if attrs["deal_type"] == "rent_long" {
		r = [2]float64{9e3, 45e3}
	}
	p := r[0] + rand.Float64()*(r[1]-r[0])
	return int64(math.Round(p/1000) * 1000)
}

func login(phone, name string) string {
	var otp struct {
		DevCode string `json:"dev_code"`
	}
	must(call("POST", "/v1/auth/otp/request", "", map[string]string{"phone": phone}, &otp))
	if otp.DevCode == "" {
		log.Fatal("no dev_code in response: start the stack with OTP_DEV_MODE=true")
	}
	var auth struct {
		AccessToken string `json:"access_token"`
	}
	must(call("POST", "/v1/auth/otp/verify", "", map[string]string{"phone": phone, "code": otp.DevCode}, &auth))
	must(call("PATCH", "/v1/me", auth.AccessToken, map[string]string{"name": name}, nil))
	return auth.AccessToken
}

// upload sends a generated gradient JPEG as a placeholder photo.
func upload(tok string) string {
	img := image.NewRGBA(image.Rect(0, 0, 960, 640))
	c1 := color.RGBA{uint8(rand.IntN(200)), uint8(rand.IntN(200)), uint8(rand.IntN(200)), 255}
	c2 := color.RGBA{uint8(55 + rand.IntN(200)), uint8(55 + rand.IntN(200)), uint8(55 + rand.IntN(200)), 255}
	for y := 0; y < 640; y++ {
		for x := 0; x < 960; x++ {
			t := float64(x+y) / 1600
			img.Set(x, y, color.RGBA{lerp(c1.R, c2.R, t), lerp(c1.G, c2.G, t), lerp(c1.B, c2.B, t), 255})
		}
	}
	var buf bytes.Buffer
	_ = jpeg.Encode(&buf, img, &jpeg.Options{Quality: 80})

	var body bytes.Buffer
	mw := multipart.NewWriter(&body)
	fw, _ := mw.CreateFormFile("file", "photo.jpg")
	_, _ = fw.Write(buf.Bytes())
	_ = mw.Close()
	var res struct {
		ID string `json:"id"`
	}
	must(do(func() (*http.Request, error) {
		req, err := http.NewRequest("POST", api+"/v1/media/photos", bytes.NewReader(body.Bytes()))
		if err == nil {
			req.Header.Set("Content-Type", mw.FormDataContentType())
			req.Header.Set("Authorization", "Bearer "+tok)
		}
		return req, err
	}, &res))
	return res.ID
}

func lerp(a, b uint8, t float64) uint8 { return uint8(float64(a) + (float64(b)-float64(a))*t) }

func call(method, path, tok string, in, out any) error {
	var payload []byte
	if in != nil {
		payload, _ = json.Marshal(in)
	}
	return do(func() (*http.Request, error) {
		req, err := http.NewRequest(method, api+path, bytes.NewReader(payload))
		if err != nil {
			return nil, err
		}
		if in != nil {
			req.Header.Set("Content-Type", "application/json")
		}
		if tok != "" {
			req.Header.Set("Authorization", "Bearer "+tok)
		}
		return req, nil
	}, out)
}

// do retries on 429 (the gateway rate-limits per IP).
func do(mk func() (*http.Request, error), out any) error {
	for attempt := 0; ; attempt++ {
		req, err := mk()
		if err != nil {
			return err
		}
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			return err
		}
		data, _ := io.ReadAll(res.Body)
		res.Body.Close()
		if res.StatusCode == 429 && attempt < 30 {
			time.Sleep(time.Second)
			continue
		}
		if res.StatusCode >= 300 {
			return fmt.Errorf("%s %s: %d %s", req.Method, req.URL.Path, res.StatusCode, data)
		}
		if out != nil && len(data) > 0 {
			return json.Unmarshal(data, out)
		}
		return nil
	}
}

func must(err error) {
	if err != nil {
		log.Fatal(err)
	}
}
