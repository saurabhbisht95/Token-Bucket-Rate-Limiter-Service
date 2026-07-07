import { query } from '../db/postgres.js';

export async function createAuditLog({
  actorKeyId,
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
      actor_key_id,
      action,
      resource_type,
      resource_id,
      metadata,
      ip_address,
      user_agent
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *;
    `,
    [
      actorKeyId || null,
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
      admin_api_keys.key_prefix AS actor_key_prefix
    FROM audit_logs
    LEFT JOIN admin_api_keys
      ON audit_logs.actor_key_id = admin_api_keys.id
    ORDER BY audit_logs.created_at DESC
    LIMIT $1;
    `,
    [limit]
  );

  return result.rows;
}