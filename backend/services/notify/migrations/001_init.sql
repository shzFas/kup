CREATE TABLE saved_searches (
    id          uuid PRIMARY KEY,
    user_id     uuid NOT NULL,
    name        text NOT NULL,
    category    text NOT NULL,
    request     jsonb NOT NULL,
    notify      boolean NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX saved_searches_user ON saved_searches(user_id, created_at DESC);
CREATE INDEX saved_searches_match ON saved_searches(category) WHERE notify;

CREATE TABLE notifications (
    id              uuid PRIMARY KEY,
    user_id         uuid NOT NULL,
    type            text NOT NULL CHECK (type IN ('saved_search','price_drop')),
    title           text NOT NULL,
    body            text NOT NULL,
    image           text,
    listing_id      uuid NOT NULL,
    saved_search_id uuid REFERENCES saved_searches(id) ON DELETE CASCADE,
    dedupe_key      text NOT NULL UNIQUE,
    created_at      timestamptz NOT NULL DEFAULT now(),
    read_at         timestamptz
);
CREATE INDEX notifications_user ON notifications(user_id, created_at DESC);
CREATE INDEX notifications_unread ON notifications(user_id) WHERE read_at IS NULL;
CREATE INDEX notifications_search_unread ON notifications(saved_search_id) WHERE read_at IS NULL;
