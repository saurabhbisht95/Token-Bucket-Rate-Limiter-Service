import { query } from '../db/postgres.js';

function mapProject(row) {
  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function createProject({ name, slug }) {
  const result = await query(
    `
    INSERT INTO projects (
      name,
      slug
    )
    VALUES ($1, $2)
    RETURNING *;
    `,
    [name, slug]
  );

  return mapProject(result.rows[0]);
}

export async function listProjects() {
  const result = await query(
    `
    SELECT *
    FROM projects
    ORDER BY created_at DESC;
    `
  );

  return result.rows.map(mapProject);
}

export async function findProjectById(id) {
  const result = await query(
    `
    SELECT *
    FROM projects
    WHERE id = $1
    LIMIT 1;
    `,
    [id]
  );

  return mapProject(result.rows[0]);
}