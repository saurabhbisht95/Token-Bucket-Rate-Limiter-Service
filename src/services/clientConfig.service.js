import { redis } from '../db/redis.js';
import { env } from '../config/env.js';
import {
  findClientByKey,
  findClientByProjectAndKey,
  listClients,
  updateClient,
  updateClientForProject,
  upsertClient
} from '../repositories/client.repository.js';

function globalCacheKey(clientKey) {
  return `config:global:${clientKey}`;
}

function projectCacheKey(projectId, clientKey) {
  return `config:project:${projectId}:${clientKey}`;
}

export async function getClientConfig(clientKey) {
  const key = globalCacheKey(clientKey);
  const cached = await redis.get(key);

  if (cached) {
    return JSON.parse(cached);
  }

  const client = await findClientByKey(clientKey);

  if (!client) return null;

  await redis.set(key, JSON.stringify(client), 'EX', env.CONFIG_CACHE_TTL_SECONDS);

  return client;
}

export async function getClientConfigForProject(projectId, clientKey) {
  const key = projectCacheKey(projectId, clientKey);
  const cached = await redis.get(key);

  if (cached) {
    return JSON.parse(cached);
  }

  const client = await findClientByProjectAndKey(projectId, clientKey);

  if (!client) return null;

  await redis.set(key, JSON.stringify(client), 'EX', env.CONFIG_CACHE_TTL_SECONDS);

  return client;
}

export async function createOrReplaceClientConfig(input) {
  const client = await upsertClient(input);

  const key = client.projectId
    ? projectCacheKey(client.projectId, client.clientKey)
    : globalCacheKey(client.clientKey);

  await redis.set(key, JSON.stringify(client), 'EX', env.CONFIG_CACHE_TTL_SECONDS);

  return client;
}

export async function updateExistingClientConfig(clientKey, input) {
  const client = await updateClient(clientKey, input);

  if (!client) return null;

  await redis.set(
    globalCacheKey(client.clientKey),
    JSON.stringify(client),
    'EX',
    env.CONFIG_CACHE_TTL_SECONDS
  );

  return client;
}

export async function updateExistingClientConfigForProject(projectId, clientKey, input) {
  const client = await updateClientForProject(projectId, clientKey, input);

  if (!client) return null;

  await redis.set(
    projectCacheKey(projectId, client.clientKey),
    JSON.stringify(client),
    'EX',
    env.CONFIG_CACHE_TTL_SECONDS
  );

  return client;
}

export async function getAllClientConfigs() {
  return listClients();
}