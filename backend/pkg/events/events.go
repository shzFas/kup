// Package events defines the NATS JetStream contract between services.
package events

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
)

const (
	StreamListings  = "LISTINGS"
	SubjectUpserted = "listings.upserted" // payload: ListingDoc
	SubjectRemoved  = "listings.removed"  // payload: ListingRemoved
	// Published fires on first publication and on re-activation (new for subscribers).
	SubjectPublished = "listings.published" // payload: ListingDoc
	// PriceDropped fires when an active listing gets cheaper.
	SubjectPriceDropped = "listings.price_dropped" // payload: PriceDropped
	ConsumerIndexer     = "search-indexer"
	ConsumerNotify      = "notify"
)

// ListingDoc is the denormalized listing published on every change.
// The search service indexes it as is; it is also what search returns as a card.
type ListingDoc struct {
	ID              string            `json:"id"`
	Category        string            `json:"category"`
	Title           string            `json:"title"`
	Description     string            `json:"description"`
	Price           int64             `json:"price"`
	Currency        string            `json:"currency"`
	PriceSuffix     string            `json:"price_suffix"`
	City            City              `json:"city"`
	Photos          []string          `json:"photos"` // thumbnails
	Attributes      map[string]any    `json:"attributes"`
	AttributeLabels map[string]string `json:"attribute_labels"`
	Highlights      []string          `json:"highlights"`
	Status          string            `json:"status"`
	PublishedAt     time.Time         `json:"published_at"`
	UserID          string            `json:"user_id"`
	Location        *Point            `json:"location"`
	SearchText      string            `json:"search_text"` // labels + synonyms for full-text search
}

type City struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type Point struct {
	Lat float64 `json:"lat"`
	Lng float64 `json:"lng"`
}

type PriceDropped struct {
	Listing  ListingDoc `json:"listing"`
	OldPrice int64      `json:"old_price"`
}

type ListingRemoved struct {
	ID string `json:"id"`
}

// Connect opens a JetStream connection and makes sure the listings stream exists.
func Connect(ctx context.Context, url string) (*nats.Conn, jetstream.JetStream, error) {
	var nc *nats.Conn
	var err error
	for i := 0; i < 30; i++ {
		nc, err = nats.Connect(url, nats.MaxReconnects(-1), nats.Name("kup"))
		if err == nil {
			break
		}
		slog.Warn("waiting for nats", "err", err)
		time.Sleep(time.Second)
	}
	if err != nil {
		return nil, nil, fmt.Errorf("connect nats: %w", err)
	}
	js, err := jetstream.New(nc)
	if err != nil {
		return nil, nil, err
	}
	_, err = js.CreateOrUpdateStream(ctx, jetstream.StreamConfig{
		Name:       StreamListings,
		Subjects:   []string{"listings.>"},
		Storage:    jetstream.FileStorage,
		MaxAge:     7 * 24 * time.Hour,
		Duplicates: 10 * time.Minute, // dedupe by Nats-Msg-Id (outbox id)
	})
	if err != nil {
		return nil, nil, fmt.Errorf("create stream: %w", err)
	}
	return nc, js, nil
}
