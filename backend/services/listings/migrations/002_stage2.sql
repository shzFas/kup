ALTER TABLE listings DROP CONSTRAINT listings_status_check;
ALTER TABLE listings ADD CONSTRAINT listings_status_check
    CHECK (status IN ('active','archived','sold','expired','blocked','deleted'));

ALTER TABLE listings ADD COLUMN expires_at timestamptz;
UPDATE listings SET expires_at = published_at + interval '30 days';
ALTER TABLE listings ALTER COLUMN expires_at SET NOT NULL;
ALTER TABLE listings ADD COLUMN moderation_reason text;
CREATE INDEX listings_expiring ON listings(expires_at) WHERE status = 'active';

CREATE TABLE listing_prices (
    listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    price      bigint NOT NULL,
    at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX listing_prices_listing ON listing_prices(listing_id, at);
INSERT INTO listing_prices(listing_id, price, at) SELECT id, price, created_at FROM listings;

CREATE TABLE reports (
    id          uuid PRIMARY KEY,
    listing_id  uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    reporter_id uuid NOT NULL,
    reason      text NOT NULL,
    comment     text NOT NULL DEFAULT '',
    status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
    resolution  text,
    resolved_by uuid,
    resolved_at timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (listing_id, reporter_id)
);
CREATE INDEX reports_open ON reports(status, created_at DESC);
