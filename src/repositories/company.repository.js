import { query } from '../db/postgres.js';

export function mapCompany(row) {
  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function createCompanyWithClient(client, { name, slug }) {
  const result = await client.query(
    `
    INSERT INTO companies (
      name,
      slug
    )
    VALUES ($1, $2)
    RETURNING *;
    `,
    [name, slug]
  );

  return mapCompany(result.rows[0]);
}

export async function findCompanyBySlug(slug) {
  const result = await query(
    `
    SELECT *
    FROM companies
    WHERE slug = $1
    LIMIT 1;
    `,
    [slug]
  );

  return mapCompany(result.rows[0]);
}

export async function findCompanyById(id) {
  const result = await query(
    `
    SELECT *
    FROM companies
    WHERE id = $1
    LIMIT 1;
    `,
    [id]
  );

  return mapCompany(result.rows[0]);
}

export async function listCompaniesWithStats() {
  const result = await query(
    `
    SELECT
      companies.*,
      COUNT(DISTINCT company_admins.id) AS admin_count,
      COUNT(DISTINCT projects.id) AS project_count,
      COUNT(DISTINCT clients.id) AS client_count,
      COUNT(DISTINCT runtime_api_keys.id) AS runtime_key_count,
      COUNT(DISTINCT clients.id) FILTER (WHERE clients.is_active = true) AS active_client_count,
      COUNT(DISTINCT runtime_api_keys.id) FILTER (
        WHERE runtime_api_keys.is_active = true
          AND runtime_api_keys.revoked_at IS NULL
      ) AS active_runtime_key_count
    FROM companies
    LEFT JOIN company_admins
      ON company_admins.company_id = companies.id
    LEFT JOIN projects
      ON projects.company_id = companies.id
    LEFT JOIN clients
      ON clients.project_id = projects.id
    LEFT JOIN runtime_api_keys
      ON runtime_api_keys.project_id = projects.id
    GROUP BY companies.id
    ORDER BY companies.created_at DESC;
    `
  );

  return result.rows.map((row) => ({
    ...mapCompany(row),
    adminCount: Number(row.admin_count || 0),
    projectCount: Number(row.project_count || 0),
    clientCount: Number(row.client_count || 0),
    runtimeKeyCount: Number(row.runtime_key_count || 0),
    activeClientCount: Number(row.active_client_count || 0),
    activeRuntimeKeyCount: Number(row.active_runtime_key_count || 0)
  }));
}

export async function updateCompanyStatus(id, status) {
  const result = await query(
    `
    UPDATE companies
    SET
      status = $2,
      updated_at = now()
    WHERE id = $1
    RETURNING *;
    `,
    [id, status]
  );

  return mapCompany(result.rows[0]);
}
