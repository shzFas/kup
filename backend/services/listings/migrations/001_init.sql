CREATE TABLE listings (
    id               uuid PRIMARY KEY,
    user_id          uuid NOT NULL,
    category         text NOT NULL,
    status           text NOT NULL CHECK (status IN ('active','archived','sold','deleted')),
    title            text NOT NULL,
    description      text NOT NULL DEFAULT '',
    price            bigint NOT NULL CHECK (price >= 0),
    currency         char(3) NOT NULL,
    price_suffix     text NOT NULL DEFAULT '',
    city             text NOT NULL,
    lat              double precision,
    lng              double precision,
    attributes       jsonb NOT NULL,
    attribute_labels jsonb NOT NULL,
    highlights       jsonb NOT NULL,
    search_text      text NOT NULL DEFAULT '',
    photos           uuid[] NOT NULL DEFAULT '{}',
    views            bigint NOT NULL DEFAULT 0,
    published_at     timestamptz NOT NULL DEFAULT now(),
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX listings_user ON listings(user_id, status, created_at DESC);
CREATE INDEX listings_active ON listings(status, id);

CREATE TABLE photos (
    id          uuid PRIMARY KEY,
    user_id     uuid NOT NULL,
    width       int NOT NULL,
    height      int NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE favorites (
    user_id     uuid NOT NULL,
    listing_id  uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    created_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, listing_id)
);
CREATE INDEX favorites_listing ON favorites(listing_id);

-- Transactional outbox: rows are written in the same transaction as the listing
-- change and published to NATS by a background relay.
CREATE TABLE outbox (
    id           bigserial PRIMARY KEY,
    subject      text NOT NULL,
    payload      jsonb NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    published_at timestamptz
);
CREATE INDEX outbox_pending ON outbox(id) WHERE published_at IS NULL;
