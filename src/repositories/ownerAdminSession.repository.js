import { query } from '../db/postgres.js';

function mapOwnerAdminSession(row) {
  if (!row) return null;

  return {
    id: row.id,
    adminKeyId: row.admin_key_id,
    tokenHash: row.token_hash,
    expiresAt: row.expires_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    createdAt: row.created_at
  };
}

function mapOwnerAdminKey(row) {
  if (!row) return null;

  return {
    id: row.admin_key_id_joined,
    name: row.admin_key_name,
    keyPrefix: row.admin_key_prefix,
    isActive: row.admin_key_is_active,
    lastUsedAt: row.admin_key_last_used_at,
    createdAt: row.admin_key_created_at,
    revokedAt: row.admin_key_revoked_at
  };
}

export async function createOwnerAdminSession({
  adminKeyId,
  tokenHash,
  expiresAt,
  ipAddress,
  userAgent
}) {
  const result = await query(
    `
    INSERT INTO owner_admin_sessions (
      admin_key_id,
      token_hash,
      expires_at,
      ip_address,
      user_agent
    )
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *;
    `,
    [
      adminKeyId,
      tokenHash,
      expiresAt,
      ipAddress || null,
      userAgent || null
    ]
  );

  return mapOwnerAdminSession(result.rows[0]);
}

export async function findActiveOwnerAdminSessionByTokenHash(tokenHash) {
  const result = await query(
    `
    SELECT
      owner_admin_sessions.*,
      admin_api_keys.id AS admin_key_id_joined,
      admin_api_keys.name AS admin_key_name,
      admin_api_keys.key_prefix AS admin_key_prefix,
      admin_api_keys.is_active AS admin_key_is_active,
      admin_api_keys.last_used_at AS admin_key_last_used_at,
      admin_api_keys.created_at AS admin_key_created_at,
      admin_api_keys.revoked_at AS admin_key_revoked_at
    FROM owner_admin_sessions
    INNER JOIN admin_api_keys
      ON admin_api_keys.id = owner_admin_sessions.admin_key_id
    WHERE owner_admin_sessions.token_hash = $1
      AND owner_admin_sessions.revoked_at IS NULL
      AND owner_admin_sessions.expires_at > now()
      AND admin_api_keys.is_active = true
      AND admin_api_keys.revoked_at IS NULL
    LIMIT 1;
    `,
    [tokenHash]
  );

  const row = result.rows[0];

  if (!row) {
    return null;
  }

  return {
    session: mapOwnerAdminSession(row),
    adminKey: mapOwnerAdminKey(row)
  };
}

export async function updateOwnerAdminSessionLastUsed(id) {
  await query(
    `
    UPDATE owner_admin_sessions
    SET last_used_at = now()
    WHERE id = $1;
    `,
    [id]
  );
}

export async function revokeOwnerAdminSessionByTokenHash(tokenHash) {
  const result = await query(
    `
    UPDATE owner_admin_sessions
    SET revoked_at = now()
    WHERE token_hash = $1
      AND revoked_at IS NULL
    RETURNING *;
    `,
    [tokenHash]
  );

  return mapOwnerAdminSession(result.rows[0]);
}
