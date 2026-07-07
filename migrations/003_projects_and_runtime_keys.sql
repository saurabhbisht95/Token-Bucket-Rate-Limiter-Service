CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,

  is_active BOOLEAN NOT NULL DEFAULT true,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE clients
ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE CASCADE;

ALTER TABLE clients
DROP CONSTRAINT IF EXISTS clients_client_key_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_project_client_key_unique
ON clients(project_id, client_key) NULLS NOT DISTINCT;

CREATE INDEX IF NOT EXISTS idx_clients_project_id
ON clients(project_id);

CREATE TABLE IF NOT EXISTS runtime_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL UNIQUE,
  key_hash TEXT NOT NULL UNIQUE,

  is_active BOOLEAN NOT NULL DEFAULT true,
  last_used_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_runtime_api_keys_project_id
ON runtime_api_keys(project_id);

CREATE INDEX IF NOT EXISTS idx_runtime_api_keys_key_hash
ON runtime_api_keys(key_hash);

CREATE INDEX IF NOT EXISTS idx_runtime_api_keys_active
ON runtime_api_keys(is_active);