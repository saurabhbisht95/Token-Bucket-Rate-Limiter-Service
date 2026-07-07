import { pool } from '../db/postgres.js';
import { redis } from '../db/redis.js';

async function checkPostgres() {
  const start = Date.now();

  await pool.query('SELECT 1');

  return {
    status: 'ok',
    latencyMs: Date.now() - start
  };
}

async function checkRedis() {
  const start = Date.now();

  const response = await redis.ping();

  return {
    status: response === 'PONG' ? 'ok' : 'error',
    latencyMs: Date.now() - start
  };
}

export async function getReadinessStatus() {
  const [postgresResult, redisResult] = await Promise.allSettled([
    checkPostgres(),
    checkRedis()
  ]);

  const checks = {
    postgres:
      postgresResult.status === 'fulfilled'
        ? postgresResult.value
        : {
            status: 'error',
            message: postgresResult.reason?.message || 'Postgres check failed'
          },

    redis:
      redisResult.status === 'fulfilled'
        ? redisResult.value
        : {
            status: 'error',
            message: redisResult.reason?.message || 'Redis check failed'
          }
  };

  const ready =
    checks.postgres.status === 'ok' &&
    checks.redis.status === 'ok';

  return {
    ready,
    status: ready ? 'ok' : 'degraded',
    checks
  };
}