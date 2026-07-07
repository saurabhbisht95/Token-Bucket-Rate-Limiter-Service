import { query } from '../db/postgres.js';

function mapAdminKey(row) {
  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    keyPrefix: row.key_prefix,
    keyHash: row.key_hash,
    isActive: row.is_active,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
    revokedAt: row.revoked_at
  };
}

export async function createAdminKey({ name, keyPrefix, keyHash }) {
  const result = await query(
    `
    INSERT INTO admin_api_keys (
      name,
      key_prefix,
      key_hash
    )
    VALUES ($1, $2, $3)
    RETURNING *;
    `,
    [name, keyPrefix, keyHash]
  );

  return mapAdminKey(result.rows[0]);
}

export async function findActiveAdminKeyByHash(keyHash) {
  const result = await query(
    `
    SELECT *
    FROM admin_api_keys
    WHERE key_hash = $1
      AND is_active = true
      AND revoked_at IS NULL
    LIMIT 1;
    `,
    [keyHash]
  );

  return mapAdminKey(result.rows[0]);
}

export async function updateAdminKeyLastUsed(id) {
  await query(
    `
    UPDATE admin_api_keys
    SET last_used_at = now()
    WHERE id = $1;
    `,
    [id]
  );
}

export async function listAdminKeys() {
  const result = await query(
    `
    SELECT *
    FROM admin_api_keys
    ORDER BY created_at DESC;
    `
  );

  return result.rows.map(mapAdminKey);
}

export async function revokeAdminKey(id) {
  const result = await query(
    `
    UPDATE admin_api_keys
    SET
      is_active = false,
      revoked_at = now()
    WHERE id = $1
    RETURNING *;
    `,
    [id]
  );

  return mapAdminKey(result.rows[0]);
}