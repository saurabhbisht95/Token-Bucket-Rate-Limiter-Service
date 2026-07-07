import {
  findActiveRuntimeApiKeyByHash,
  updateRuntimeApiKeyLastUsed
} from '../repositories/runtimeApiKey.repository.js';
import { hashApiKey } from '../utils/apiKey.js';

function getApiKeyFromRequest(req) {
  const directKey = req.header('x-api-key');

  if (directKey) return directKey;

  const authHeader = req.header('authorization');

  if (!authHeader) return null;

  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return null;
  }

  return authHeader.slice('bearer '.length).trim();
}

export async function runtimeAuth(req, res, next) {
  try {
    const apiKey = getApiKeyFromRequest(req);

    if (!apiKey) {
      return res.status(401).json({
        error: {
          code: 'RUNTIME_API_KEY_MISSING',
          message: 'Missing runtime API key'
        }
      });
    }

    const keyHash = hashApiKey(apiKey);
    const runtimeKey = await findActiveRuntimeApiKeyByHash(keyHash);

    if (!runtimeKey) {
      return res.status(401).json({
        error: {
          code: 'RUNTIME_API_KEY_INVALID',
          message: 'Invalid runtime API key'
        }
      });
    }

    req.runtimeKey = {
      id: runtimeKey.id,
      projectId: runtimeKey.projectId,
      name: runtimeKey.name,
      keyPrefix: runtimeKey.keyPrefix
    };

    updateRuntimeApiKeyLastUsed(runtimeKey.id).catch(() => {});

    return next();
  } catch (err) {
    return next(err);
  }
}