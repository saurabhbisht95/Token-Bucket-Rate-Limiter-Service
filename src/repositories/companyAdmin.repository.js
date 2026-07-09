import { query } from '../db/postgres.js';
import { mapCompany } from './company.repository.js';

export function mapCompanyAdmin(row) {
  if (!row) return null;

  return {
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role,
    isActive: row.is_active,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function toSafeCompanyAdmin(admin) {
  if (!admin) return null;

  return {
    id: admin.id,
    companyId: admin.companyId,
    name: admin.name,
    email: admin.email,
    role: admin.role,
    isActive: admin.isActive,
    lastLoginAt: admin.lastLoginAt,
    createdAt: admin.createdAt,
    updatedAt: admin.updatedAt
  };
}

export async function createCompanyAdminWithClient(
  client,
  { companyId, name, email, passwordHash, role = 'owner' }
) {
  const result = await client.query(
    `
    INSERT INTO company_admins (
      company_id,
      name,
      email,
      password_hash,
      role
    )
    VALUES ($1, $2, lower($3), $4, $5)
    RETURNING *;
    `,
    [companyId, name, email, passwordHash, role]
  );

  return mapCompanyAdmin(result.rows[0]);
}

export async function findCompanyAdminByEmailWithCompany(email) {
  const result = await query(
    `
    SELECT
      company_admins.*,
      companies.id AS company_id_joined,
      companies.name AS company_name,
      companies.slug AS company_slug,
      companies.status AS company_status,
      companies.created_at AS company_created_at,
      companies.updated_at AS company_updated_at
    FROM company_admins
    INNER JOIN companies
      ON companies.id = company_admins.company_id
    WHERE lower(company_admins.email) = lower($1)
    LIMIT 1;
    `,
    [email]
  );

  const row = result.rows[0];

  if (!row) {
    return null;
  }

  return {
    admin: mapCompanyAdmin(row),
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

export async function updateCompanyAdminLastLogin(id) {
  await query(
    `
    UPDATE company_admins
    SET last_login_at = now()
    WHERE id = $1;
    `,
    [id]
  );
}

export async function listCompanyAdminsByCompany(companyId) {
  const result = await query(
    `
    SELECT *
    FROM company_admins
    WHERE company_id = $1
    ORDER BY created_at ASC;
    `,
    [companyId]
  );

  return result.rows.map((row) => toSafeCompanyAdmin(mapCompanyAdmin(row)));
}
