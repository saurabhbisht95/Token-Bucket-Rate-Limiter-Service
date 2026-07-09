import { query } from '../db/postgres.js';

function mapRuntimeApiKey(row) {
  if (!row) return null;

  return {
    id: row.id,
    projectId: row.project_id,
    companyId: row.company_id,
    companyStatus: row.company_status,
    projectIsActive: row.project_is_active,
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
    SELECT
      runtime_api_keys.*,
      projects.company_id,
      projects.is_active AS project_is_active,
      companies.status AS company_status
    FROM runtime_api_keys
    INNER JOIN projects
      ON projects.id = runtime_api_keys.project_id
    LEFT JOIN companies
      ON companies.id = projects.company_id
    WHERE key_hash = $1
      AND runtime_api_keys.is_active = true
      AND runtime_api_keys.revoked_at IS NULL
      AND projects.is_active = true
      AND (
        projects.company_id IS NULL
        OR companies.status = 'active'
      )
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

export async function findRuntimeApiKeyByIdForProject(id, projectId) {
  const result = await query(
    `
    SELECT *
    FROM runtime_api_keys
    WHERE id = $1
      AND project_id = $2
    LIMIT 1;
    `,
    [id, projectId]
  );

  return mapRuntimeApiKey(result.rows[0]);
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

export async function revokeRuntimeApiKeyForProject(id, projectId) {
  const result = await query(
    `
    UPDATE runtime_api_keys
    SET
      is_active = false,
      revoked_at = now()
    WHERE id = $1
      AND project_id = $2
    RETURNING *;
    `,
    [id, projectId]
  );

  return mapRuntimeApiKey(result.rows[0]);
}
