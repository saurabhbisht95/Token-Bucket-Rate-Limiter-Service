import { query } from '../db/postgres.js';

export async function createAuditLog({
  companyId,
  actorKeyId,
  actorAdminId,
  action,
  resourceType,
  resourceId,
  metadata = {},
  ipAddress,
  userAgent
}) {
  const result = await query(
    `
    INSERT INTO audit_logs (
      company_id,
      actor_key_id,
      actor_admin_id,
      action,
      resource_type,
      resource_id,
      metadata,
      ip_address,
      user_agent
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *;
    `,
    [
      companyId || null,
      actorKeyId || null,
      actorAdminId || null,
      action,
      resourceType,
      resourceId || null,
      JSON.stringify(metadata),
      ipAddress || null,
      userAgent || null
    ]
  );

  return result.rows[0];
}

export async function listAuditLogs({ limit = 50 } = {}) {
  const result = await query(
    `
    SELECT
      audit_logs.*,
      admin_api_keys.name AS actor_key_name,
      admin_api_keys.key_prefix AS actor_key_prefix,
      company_admins.name AS actor_admin_name,
      company_admins.email AS actor_admin_email,
      companies.name AS company_name,
      companies.slug AS company_slug
    FROM audit_logs
    LEFT JOIN admin_api_keys
      ON audit_logs.actor_key_id = admin_api_keys.id
    LEFT JOIN company_admins
      ON audit_logs.actor_admin_id = company_admins.id
    LEFT JOIN companies
      ON audit_logs.company_id = companies.id
    ORDER BY audit_logs.created_at DESC
    LIMIT $1;
    `,
    [limit]
  );

  return result.rows;
}

export async function listAuditLogsByCompany({ companyId, limit = 50 } = {}) {
  const result = await query(
    `
    SELECT
      audit_logs.*,
      company_admins.name AS actor_admin_name,
      company_admins.email AS actor_admin_email
    FROM audit_logs
    LEFT JOIN company_admins
      ON audit_logs.actor_admin_id = company_admins.id
    WHERE audit_logs.company_id = $1
    ORDER BY audit_logs.created_at DESC
    LIMIT $2;
    `,
    [companyId, limit]
  );

  return result.rows;
}
