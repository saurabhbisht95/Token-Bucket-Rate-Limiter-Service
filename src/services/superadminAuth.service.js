import crypto from 'node:crypto';

import {
  findActiveAdminKeyByHash,
  updateAdminKeyLastUsed
} from '../repositories/adminKey.repository.js';
import {
  createOwnerAdminSession,
  revokeOwnerAdminSessionByTokenHash
} from '../repositories/ownerAdminSession.repository.js';
import { hashApiKey } from '../utils/apiKey.js';

const OWNER_SESSION_TTL_MS = 1000 * 60 * 60 * 12;
export const OWNER_SESSION_MAX_AGE_SECONDS = Math.floor(OWNER_SESSION_TTL_MS / 1000);

function generateOwnerSessionToken() {
  return `rls_owner_${crypto.randomBytes(32).toString('base64url')}`;
}

export async function loginSuperadmin({
  adminApiKey,
  ipAddress,
  userAgent
}) {
  const keyHash = hashApiKey(adminApiKey);
  const adminKey = await findActiveAdminKeyByHash(keyHash);

  if (!adminKey) {
    const err = new Error('Invalid owner admin API key');
    err.statusCode = 401;
    err.code = 'OWNER_ADMIN_KEY_INVALID';
    throw err;
  }

  const token = generateOwnerSessionToken();
  const session = await createOwnerAdminSession({
    adminKeyId: adminKey.id,
    tokenHash: hashApiKey(token),
    expiresAt: new Date(Date.now() + OWNER_SESSION_TTL_MS),
    ipAddress,
    userAgent
  });

  await updateAdminKeyLastUsed(adminKey.id);

  return {
    token,
    session,
    adminKey: {
      id: adminKey.id,
      name: adminKey.name,
      keyPrefix: adminKey.keyPrefix,
      lastUsedAt: adminKey.lastUsedAt,
      createdAt: adminKey.createdAt
    }
  };
}

export async function logoutSuperadmin(token) {
  if (!token) return null;

  return revokeOwnerAdminSessionByTokenHash(hashApiKey(token));
}
