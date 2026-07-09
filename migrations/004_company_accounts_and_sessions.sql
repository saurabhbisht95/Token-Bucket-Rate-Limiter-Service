CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_companies_status
ON companies(status);

CREATE TABLE IF NOT EXISTS company_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'admin')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_login_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_company_admins_email_unique
ON company_admins(lower(email));

CREATE INDEX IF NOT EXISTS idx_company_admins_company_id
ON company_admins(company_id);

CREATE INDEX IF NOT EXISTS idx_company_admins_active
ON company_admins(is_active);

CREATE TABLE IF NOT EXISTS admin_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  company_admin_id UUID NOT NULL REFERENCES company_admins(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,

  expires_at TIMESTAMPTZ NOT NULL,
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,

  ip_address TEXT,
  user_agent TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_company_admin_id
ON admin_sessions(company_admin_id);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_token_hash
ON admin_sessions(token_hash);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_active
ON admin_sessions(expires_at)
WHERE revoked_at IS NULL;

ALTER TABLE projects
ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE projects
DROP CONSTRAINT IF EXISTS projects_slug_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_company_slug_unique
ON projects(company_id, slug) NULLS NOT DISTINCT;

CREATE INDEX IF NOT EXISTS idx_projects_company_id
ON projects(company_id);

ALTER TABLE audit_logs
ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE audit_logs
ADD COLUMN IF NOT EXISTS actor_admin_id UUID REFERENCES company_admins(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_audit_logs_company_id_created_at
ON audit_logs(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_admin_id
ON audit_logs(actor_admin_id);
