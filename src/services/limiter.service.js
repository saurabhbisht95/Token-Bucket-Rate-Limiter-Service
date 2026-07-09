import crypto from 'node:crypto';
import { redis } from '../db/redis.js';
import { recordDecision } from './stats.service.js';

const TOKEN_BUCKET_LUA = `
local key = KEYS[1]

local now_ms = tonumber(ARGV[1])
local refill_rate_per_ms = tonumber(ARGV[2])
local capacity = tonumber(ARGV[3])
local cost = tonumber(ARGV[4])
local ttl_ms = tonumber(ARGV[5])

local bucket = redis.call('HMGET', key, 'tokens', 'updated_at')

local tokens = tonumber(bucket[1])
local updated_at = tonumber(bucket[2])

if tokens == nil then
  tokens = capacity
  updated_at = now_ms
end

local delta = math.max(0, now_ms - updated_at)
tokens = math.min(capacity, tokens + (delta * refill_rate_per_ms))

local allowed = 0

if tokens >= cost then
  allowed = 1
  tokens = tokens - cost
end

redis.call('HMSET', key, 'tokens', tokens, 'updated_at', now_ms)
redis.call('PEXPIRE', key, ttl_ms)

local remaining = math.floor(tokens)
local reset_ms = 0

if tokens < cost then
  reset_ms = math.ceil((cost - tokens) / refill_rate_per_ms)
end

return { allowed, remaining, reset_ms, capacity }
`;

const SLIDING_WINDOW_LUA = `
local key = KEYS[1]

local now_ms = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local window_ms = tonumber(ARGV[3])
local request_id = ARGV[4]
local cost = tonumber(ARGV[5])
local ttl_ms = tonumber(ARGV[6])

redis.call('ZREMRANGEBYSCORE', key, 0, now_ms - window_ms)

local current_count = redis.call('ZCARD', key)
local allowed = 0

if (current_count + cost) <= limit then
  allowed = 1

  for i = 1, cost do
    redis.call('ZADD', key, now_ms, request_id .. ':' .. i)
  end

  current_count = current_count + cost
end

redis.call('PEXPIRE', key, ttl_ms)

local remaining = limit - current_count

if remaining < 0 then
  remaining = 0
end

local reset_ms = 0
local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')

if oldest[2] ~= nil and current_count >= limit then
  local oldest_score = tonumber(oldest[2])
  reset_ms = math.max(0, (oldest_score + window_ms) - now_ms)
end

return { allowed, remaining, reset_ms, limit }
`;

redis.defineCommand('tokenBucketCheck', {
  numberOfKeys: 1,
  lua: TOKEN_BUCKET_LUA
});

redis.defineCommand('slidingWindowCheck', {
  numberOfKeys: 1,
  lua: SLIDING_WINDOW_LUA
});

function normalizeLuaResult(result, algorithm) {
  return {
    allowed: Number(result[0]) === 1,
    remaining: Number(result[1]),
    resetMs: Number(result[2]),
    limit: Number(result[3]),
    algorithm
  };
}

function limiterScope(config) {
  if (!config.projectId) {
    return `global:${config.clientKey}`;
  }

  return `project:${config.projectId}:${config.clientKey}`;
}

async function checkTokenBucket(config, cost) {
  const nowMs = Date.now();
  const refillRatePerMs = config.requestsPerSecond / 1000;
  const key = `rl:tb:${limiterScope(config)}`;

  const timeToFullyRefillMs = Math.ceil(
    (config.burstSize / config.requestsPerSecond) * 1000
  );

  const ttlMs = timeToFullyRefillMs + 60_000;

  const result = await redis.tokenBucketCheck(
    key,
    nowMs,
    refillRatePerMs,
    config.burstSize,
    cost,
    ttlMs
  );

  return normalizeLuaResult(result, 'TOKEN_BUCKET');
}

async function checkSlidingWindow(config, cost) {
  const nowMs = Date.now();
  const windowMs = config.windowSeconds * 1000;
  const key = `rl:sw:${limiterScope(config)}`;

  const limit = Math.max(1, Math.floor(config.requestsPerSecond * config.windowSeconds));
  const requestId = `${nowMs}:${crypto.randomUUID()}`;
  const ttlMs = windowMs + 60_000;

  const result = await redis.slidingWindowCheck(
    key,
    nowMs,
    limit,
    windowMs,
    requestId,
    cost,
    ttlMs
  );

  return normalizeLuaResult(result, 'SLIDING_WINDOW');
}

export async function checkLimit(config, cost = 1) {
  let result;

  if (config.algorithm === 'TOKEN_BUCKET') {
    result = await checkTokenBucket(config, cost);
  } else if (config.algorithm === 'SLIDING_WINDOW') {
    result = await checkSlidingWindow(config, cost);
  } else {
    throw new Error(`Unsupported algorithm: ${config.algorithm}`);
  }

  await recordDecision({
    projectId: config.projectId,
    clientKey: config.clientKey,
    allowed: result.allowed,
    algorithm: config.algorithm
  });

  return result;
}
