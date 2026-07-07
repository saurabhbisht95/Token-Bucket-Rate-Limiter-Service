import crypto from 'node:crypto';

export function generateAdminApiKey() {
  const publicId = crypto.randomBytes(6).toString('hex');
  const secret = crypto.randomBytes(32).toString('base64url');

  return `rlk_admin_${publicId}_${secret}`;
}

export function generateRuntimeApiKey() {
  const publicId = crypto.randomBytes(6).toString('hex');
  const secret = crypto.randomBytes(32).toString('base64url');

  return `rlk_rt_${publicId}_${secret}`;
}

export function hashApiKey(apiKey) {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

export function getApiKeyPrefix(apiKey) {
  const parts = apiKey.split('_');

  if (parts.length < 4) {
    return apiKey.slice(0, 16);
  }

  return `${parts[0]}_${parts[1]}_${parts[2]}`;
}