import pg from 'pg';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 3000
});

pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected Postgres pool error');
});

export async function query(text, params = []) {
  const start = Date.now();

  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;

    logger.debug(
      {
        duration,
        rows: result.rowCount
      },
      'Postgres query executed'
    );

    return result;
  } catch (err) {
    logger.error({ err, text }, 'Postgres query failed');
    throw err;
  }
}