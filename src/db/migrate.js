import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './postgres.js';
import { logger } from '../lib/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const migrationsDir = path.resolve(__dirname, '../../migrations');

async function ensureMigrationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      executed_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

async function hasMigrationRun(filename) {
  const result = await pool.query(
    'SELECT 1 FROM schema_migrations WHERE filename = $1',
    [filename]
  );

  return result.rowCount > 0;
}

async function runMigration(filename) {
  const filePath = path.join(migrationsDir, filename);
  const sql = await fs.readFile(filePath, 'utf8');

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('INSERT INTO schema_migrations(filename) VALUES($1)', [filename]);
    await client.query('COMMIT');

    logger.info({ filename }, 'Migration executed');
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error({ err, filename }, 'Migration failed');
    throw err;
  } finally {
    client.release();
  }
}

async function main() {
  await ensureMigrationsTable();

  const files = await fs.readdir(migrationsDir);
  const sqlFiles = files.filter((file) => file.endsWith('.sql')).sort();

  for (const file of sqlFiles) {
    const alreadyRun = await hasMigrationRun(file);

    if (alreadyRun) {
      logger.info({ file }, 'Migration already applied');
      continue;
    }

    await runMigration(file);
  }

  await pool.end();
}

main().catch((err) => {
  logger.error({ err }, 'Migration process failed');
  process.exit(1);
});