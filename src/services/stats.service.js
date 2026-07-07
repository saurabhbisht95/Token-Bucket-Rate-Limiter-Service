import { redis } from '../db/redis.js';
import { logger } from '../lib/logger.js';

function getDayKey() {
  return new Date().toISOString().slice(0, 10);
}

export async function recordDecision({ clientKey, allowed, algorithm }) {
  const day = getDayKey();

  const clientStatsKey = `stats:${clientKey}:${day}`;
  const globalStatsKey = `stats:global:${day}`;

  const field = allowed ? 'allowed' : 'denied';

  try {
    const pipeline = redis.pipeline();

    pipeline.hincrby(clientStatsKey, field, 1);
    pipeline.hincrby(clientStatsKey, `${algorithm.toLowerCase()}_${field}`, 1);
    pipeline.expire(clientStatsKey, 60 * 60 * 24 * 14);

    pipeline.hincrby(globalStatsKey, field, 1);
    pipeline.expire(globalStatsKey, 60 * 60 * 24 * 14);

    await pipeline.exec();
  } catch (err) {
    logger.warn({ err, clientKey }, 'Failed to record limiter stats');
  }
}

export async function getClientStats(clientKey) {
  const day = getDayKey();
  const stats = await redis.hgetall(`stats:${clientKey}:${day}`);

  return {
    clientKey,
    day,
    allowed: Number(stats.allowed || 0),
    denied: Number(stats.denied || 0),
    tokenBucketAllowed: Number(stats.token_bucket_allowed || 0),
    tokenBucketDenied: Number(stats.token_bucket_denied || 0),
    slidingWindowAllowed: Number(stats.sliding_window_allowed || 0),
    slidingWindowDenied: Number(stats.sliding_window_denied || 0)
  };
}