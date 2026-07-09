CREATE TABLE IF NOT EXISTS owner_admin_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  admin_key_id UUID NOT NULL REFERENCES admin_api_keys(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,

  expires_at TIMESTAMPTZ NOT NULL,
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,

  ip_address TEXT,
  user_agent TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_owner_admin_sessions_admin_key_id
ON owner_admin_sessions(admin_key_id);

CREATE INDEX IF NOT EXISTS idx_owner_admin_sessions_token_hash
ON owner_admin_sessions(token_hash);

CREATE INDEX IF NOT EXISTS idx_owner_admin_sessions_active
ON owner_admin_sessions(expires_at)
WHERE revoked_at IS NULL;
