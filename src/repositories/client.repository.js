import { query } from '../db/postgres.js';

function mapClient(row) {
  if (!row) return null;

  return {
    id: row.id,
    projectId: row.project_id,
    clientKey: row.client_key,
    algorithm: row.algorithm,
    requestsPerSecond: Number(row.requests_per_second),
    burstSize: Number(row.burst_size),
    windowSeconds: Number(row.window_seconds),
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function upsertClient(input) {
  const result = await query(
    `
    INSERT INTO clients (
      project_id,
      client_key,
      algorithm,
      requests_per_second,
      burst_size,
      window_seconds,
      is_active
    )
    VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, true))
    ON CONFLICT (project_id, client_key)
    DO UPDATE SET
      algorithm = EXCLUDED.algorithm,
      requests_per_second = EXCLUDED.requests_per_second,
      burst_size = EXCLUDED.burst_size,
      window_seconds = EXCLUDED.window_seconds,
      is_active = EXCLUDED.is_active,
      updated_at = now()
    RETURNING *;
    `,
    [
      input.projectId || null,
      input.clientKey,
      input.algorithm,
      input.requestsPerSecond,
      input.burstSize,
      input.windowSeconds,
      input.isActive ?? true
    ]
  );

  return mapClient(result.rows[0]);
}

export async function findClientByKey(clientKey) {
  const result = await query(
    `
    SELECT *
    FROM clients
    WHERE client_key = $1
      AND project_id IS NULL
    LIMIT 1;
    `,
    [clientKey]
  );

  return mapClient(result.rows[0]);
}

export async function findClientByProjectAndKey(projectId, clientKey) {
  const result = await query(
    `
    SELECT *
    FROM clients
    WHERE project_id = $1
      AND client_key = $2
    LIMIT 1;
    `,
    [projectId, clientKey]
  );

  return mapClient(result.rows[0]);
}

export async function listClients() {
  const result = await query(
    `
    SELECT *
    FROM clients
    ORDER BY created_at DESC;
    `
  );

  return result.rows.map(mapClient);
}

export async function listClientsByProject(projectId) {
  const result = await query(
    `
    SELECT *
    FROM clients
    WHERE project_id = $1
    ORDER BY created_at DESC;
    `,
    [projectId]
  );

  return result.rows.map(mapClient);
}

export async function updateClient(clientKey, input) {
  const existing = await findClientByKey(clientKey);

  if (!existing) return null;

  const merged = {
    projectId: existing.projectId,
    clientKey,
    algorithm: input.algorithm ?? existing.algorithm,
    requestsPerSecond: input.requestsPerSecond ?? existing.requestsPerSecond,
    burstSize: input.burstSize ?? existing.burstSize,
    windowSeconds: input.windowSeconds ?? existing.windowSeconds,
    isActive: input.isActive ?? existing.isActive
  };

  return upsertClient(merged);
}

export async function updateClientForProject(projectId, clientKey, input) {
  const existing = await findClientByProjectAndKey(projectId, clientKey);

  if (!existing) return null;

  const merged = {
    projectId,
    clientKey,
    algorithm: input.algorithm ?? existing.algorithm,
    requestsPerSecond: input.requestsPerSecond ?? existing.requestsPerSecond,
    burstSize: input.burstSize ?? existing.burstSize,
    windowSeconds: input.windowSeconds ?? existing.windowSeconds,
    isActive: input.isActive ?? existing.isActive
  };

  return upsertClient(merged);
}
