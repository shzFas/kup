CREATE TABLE users (
    id          uuid PRIMARY KEY,
    phone       text NOT NULL UNIQUE,
    name        text NOT NULL DEFAULT '',
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE otp_codes (
    phone        text PRIMARY KEY,
    code_hash    bytea NOT NULL,
    expires_at   timestamptz NOT NULL,
    attempts     int NOT NULL DEFAULT 0,
    last_sent_at timestamptz NOT NULL
);

CREATE TABLE refresh_tokens (
    id          uuid PRIMARY KEY,
    user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  bytea NOT NULL UNIQUE,
    expires_at  timestamptz NOT NULL,
    revoked_at  timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refresh_tokens_user ON refresh_tokens(user_id);
