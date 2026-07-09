import { query } from '../db/postgres.js';
import { mapCompany } from './company.repository.js';
import { mapCompanyAdmin } from './companyAdmin.repository.js';

function mapAdminSession(row) {
  if (!row) return null;

  return {
    id: row.id,
    companyAdminId: row.company_admin_id,
    tokenHash: row.token_hash,
    expiresAt: row.expires_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    createdAt: row.created_at
  };
}

export async function createAdminSession({
  companyAdminId,
  tokenHash,
  expiresAt,
  ipAddress,
  userAgent
}) {
  const result = await query(
    `
    INSERT INTO admin_sessions (
      company_admin_id,
      token_hash,
      expires_at,
      ip_address,
      user_agent
    )
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *;
    `,
    [
      companyAdminId,
      tokenHash,
      expiresAt,
      ipAddress || null,
      userAgent || null
    ]
  );

  return mapAdminSession(result.rows[0]);
}

export async function findActiveAdminSessionByTokenHash(tokenHash) {
  const result = await query(
    `
    SELECT
      admin_sessions.*,
      company_admins.id AS admin_id,
      company_admins.company_id AS admin_company_id,
      company_admins.name AS admin_name,
      company_admins.email AS admin_email,
      company_admins.password_hash AS admin_password_hash,
      company_admins.role AS admin_role,
      company_admins.is_active AS admin_is_active,
      company_admins.last_login_at AS admin_last_login_at,
      company_admins.created_at AS admin_created_at,
      company_admins.updated_at AS admin_updated_at,
      companies.id AS company_id_joined,
      companies.name AS company_name,
      companies.slug AS company_slug,
      companies.status AS company_status,
      companies.created_at AS company_created_at,
      companies.updated_at AS company_updated_at
    FROM admin_sessions
    INNER JOIN company_admins
      ON company_admins.id = admin_sessions.company_admin_id
    INNER JOIN companies
      ON companies.id = company_admins.company_id
    WHERE admin_sessions.token_hash = $1
      AND admin_sessions.revoked_at IS NULL
      AND admin_sessions.expires_at > now()
      AND company_admins.is_active = true
      AND companies.status = 'active'
    LIMIT 1;
    `,
    [tokenHash]
  );

  const row = result.rows[0];

  if (!row) {
    return null;
  }

  return {
    session: mapAdminSession(row),
    admin: mapCompanyAdmin({
      id: row.admin_id,
      company_id: row.admin_company_id,
      name: row.admin_name,
      email: row.admin_email,
      password_hash: row.admin_password_hash,
      role: row.admin_role,
      is_active: row.admin_is_active,
      last_login_at: row.admin_last_login_at,
      created_at: row.admin_created_at,
      updated_at: row.admin_updated_at
    }),
    company: mapCompany({
      id: row.company_id_joined,
      name: row.company_name,
      slug: row.company_slug,
      status: row.company_status,
      created_at: row.company_created_at,
      updated_at: row.company_updated_at
    })
  };
}

export async function updateAdminSessionLastUsed(id) {
  await query(
    `
    UPDATE admin_sessions
    SET last_used_at = now()
    WHERE id = $1;
    `,
    [id]
  );
}

export async function revokeAdminSessionByTokenHash(tokenHash) {
  const result = await query(
    `
    UPDATE admin_sessions
    SET revoked_at = now()
    WHERE token_hash = $1
      AND revoked_at IS NULL
    RETURNING *;
    `,
    [tokenHash]
  );

  return mapAdminSession(result.rows[0]);
}
