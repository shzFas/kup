CREATE TABLE chats (
    id              uuid PRIMARY KEY,
    listing_id      uuid NOT NULL,
    buyer_id        uuid NOT NULL,
    seller_id       uuid NOT NULL,
    -- listing snapshot, refreshed whenever the buyer writes through POST /v1/chats
    titles          jsonb NOT NULL DEFAULT '{}',
    photo           text,
    price           bigint NOT NULL,
    currency        text NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    last_message_at timestamptz NOT NULL DEFAULT now(),
    last_text       text NOT NULL DEFAULT '',
    last_sender_id  uuid,
    buyer_read_at   timestamptz,
    seller_read_at  timestamptz,
    UNIQUE (listing_id, buyer_id)
);
CREATE INDEX chats_buyer ON chats(buyer_id, last_message_at DESC);
CREATE INDEX chats_seller ON chats(seller_id, last_message_at DESC);

CREATE TABLE messages (
    id         uuid PRIMARY KEY,
    chat_id    uuid NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    sender_id  uuid NOT NULL,
    text       text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX messages_chat ON messages(chat_id, created_at DESC, id DESC);
CREATE INDEX messages_sender ON messages(sender_id, created_at DESC);
