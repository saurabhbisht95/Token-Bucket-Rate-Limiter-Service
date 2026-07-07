import { query } from '../db/postgres.js';

function mapRuntimeApiKey(row) {
  if (!row) return null;

  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    keyPrefix: row.key_prefix,
    keyHash: row.key_hash,
    isActive: row.is_active,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
    revokedAt: row.revoked_at
  };
}

export async function createRuntimeApiKey({
  projectId,
  name,
  keyPrefix,
  keyHash
}) {
  const result = await query(
    `
    INSERT INTO runtime_api_keys (
      project_id,
      name,
      key_prefix,
      key_hash
    )
    VALUES ($1, $2, $3, $4)
    RETURNING *;
    `,
    [projectId, name, keyPrefix, keyHash]
  );

  return mapRuntimeApiKey(result.rows[0]);
}

export async function findActiveRuntimeApiKeyByHash(keyHash) {
  const result = await query(
    `
    SELECT *
    FROM runtime_api_keys
    WHERE key_hash = $1
      AND is_active = true
      AND revoked_at IS NULL
    LIMIT 1;
    `,
    [keyHash]
  );

  return mapRuntimeApiKey(result.rows[0]);
}

export async function updateRuntimeApiKeyLastUsed(id) {
  await query(
    `
    UPDATE runtime_api_keys
    SET last_used_at = now()
    WHERE id = $1;
    `,
    [id]
  );
}

export async function listRuntimeApiKeysByProject(projectId) {
  const result = await query(
    `
    SELECT *
    FROM runtime_api_keys
    WHERE project_id = $1
    ORDER BY created_at DESC;
    `,
    [projectId]
  );

  return result.rows.map(mapRuntimeApiKey);
}

export async function revokeRuntimeApiKey(id) {
  const result = await query(
    `
    UPDATE runtime_api_keys
    SET
      is_active = false,
      revoked_at = now()
    WHERE id = $1
    RETURNING *;
    `,
    [id]
  );

  return mapRuntimeApiKey(result.rows[0]);
}