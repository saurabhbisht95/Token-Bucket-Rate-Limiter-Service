CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  CREATE TYPE limiter_algorithm AS ENUM ('TOKEN_BUCKET', 'SLIDING_WINDOW');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_key TEXT NOT NULL UNIQUE,

  algorithm limiter_algorithm NOT NULL DEFAULT 'TOKEN_BUCKET',

  requests_per_second NUMERIC(12, 4) NOT NULL CHECK (requests_per_second > 0),
  burst_size INTEGER NOT NULL CHECK (burst_size > 0),
  window_seconds INTEGER NOT NULL DEFAULT 60 CHECK (window_seconds > 0),

  is_active BOOLEAN NOT NULL DEFAULT true,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clients_client_key ON clients(client_key);
CREATE INDEX IF NOT EXISTS idx_clients_active ON clients(is_active);