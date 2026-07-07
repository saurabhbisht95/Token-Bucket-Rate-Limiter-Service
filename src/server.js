import { app } from './app.js';
import { env } from './config/env.js';
import { pool } from './db/postgres.js';
import { redis } from './db/redis.js';
import { logger } from './lib/logger.js';

async function startServer() {
  await pool.query('SELECT 1');
  logger.info('Postgres connected');

  await redis.ping();
  logger.info('Redis ping successful');

  const server = app.listen(env.PORT, () => {
    logger.info(
      {
        port: env.PORT,
        env: env.NODE_ENV
      },
      'Rate limiter service started'
    );
  });

  async function shutdown(signal) {
    logger.info({ signal }, 'Shutting down server');

    server.close(async () => {
      await pool.end();
      await redis.quit();

      logger.info('Shutdown complete');
      process.exit(0);
    });
  }

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

startServer().catch((err) => {
  logger.error({ err }, 'Failed to start server');
  process.exit(1);
});