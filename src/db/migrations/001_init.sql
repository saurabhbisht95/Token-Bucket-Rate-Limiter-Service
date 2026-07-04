CREATE TYPE limiter_algorithm AS ENUM ('TOKEN_BUCKET', 'SLIDING_WINDOW');

CREATE TABLE client_policies ( 
    client_key TEXT PRIMARY KEY,
    algorithm limiter_algorithm NOT NULL,

    requests_per_second DOUBLE PRECISION,
    burst_size INTEGER,

    window_seconds INTEGER,
    max_requests INTEGER,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE token_buckets (
    client_key TEXT PRIMARY KEY REFERENCES client_policies(client_key) ON DELETE CASCADE,
    tokens DOUBLE PRECISION NOT NULL,
    last_refill_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE sliding_window_requests (
    id BIGSERIAL PRIMARY KEY,
    client_key TEXT NOT NULL REFERENCES client_policies(client_key) ON DELETE CASCADE,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sliding_window_client_time ON sliding_window_requests(client_key, requested_at);