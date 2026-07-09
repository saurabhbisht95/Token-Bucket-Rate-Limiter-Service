import { redis } from '../db/redis.js';
import { logger } from '../lib/logger.js';

function getDayKey() {
  return new Date().toISOString().slice(0, 10);
}

function scopedClientStatsKey(projectId, clientKey, day) {
  if (!projectId) {
    return `stats:${clientKey}:${day}`;
  }

  return `stats:project:${projectId}:${clientKey}:${day}`;
}

function scopedProjectStatsKey(projectId, day) {
  if (!projectId) {
    return `stats:global:${day}`;
  }

  return `stats:project:${projectId}:global:${day}`;
}

function mapStats({ projectId, clientKey, day, stats }) {
  return {
    projectId: projectId || null,
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

export async function recordDecision({ projectId, clientKey, allowed, algorithm }) {
  const day = getDayKey();

  const clientStatsKey = scopedClientStatsKey(projectId, clientKey, day);
  const projectStatsKey = scopedProjectStatsKey(projectId, day);
  const globalStatsKey = `stats:global:${day}`;

  const field = allowed ? 'allowed' : 'denied';

  try {
    const pipeline = redis.pipeline();

    pipeline.hincrby(clientStatsKey, field, 1);
    pipeline.hincrby(clientStatsKey, `${algorithm.toLowerCase()}_${field}`, 1);
    pipeline.expire(clientStatsKey, 60 * 60 * 24 * 14);

    if (projectId) {
      pipeline.hincrby(projectStatsKey, field, 1);
      pipeline.expire(projectStatsKey, 60 * 60 * 24 * 14);
    }

    pipeline.hincrby(globalStatsKey, field, 1);
    pipeline.expire(globalStatsKey, 60 * 60 * 24 * 14);

    await pipeline.exec();
  } catch (err) {
    logger.warn({ err, clientKey }, 'Failed to record limiter stats');
  }
}

export async function getClientStats(clientKey) {
  const day = getDayKey();
  const stats = await redis.hgetall(scopedClientStatsKey(null, clientKey, day));

  return mapStats({
    projectId: null,
    clientKey,
    day,
    stats
  });
}

export async function getClientStatsForProject(projectId, clientKey) {
  const day = getDayKey();
  const stats = await redis.hgetall(scopedClientStatsKey(projectId, clientKey, day));

  return mapStats({
    projectId,
    clientKey,
    day,
    stats
  });
}
