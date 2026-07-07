import { findActiveAdminKeyByHash, updateAdminKeyLastUsed } from '../repositories/adminKey.repository.js';
import { hashApiKey } from '../utils/apiKey.js';

export async function adminAuth(req, res, next) {
  try {
    const apiKey = req.header('x-admin-api-key');

    if (!apiKey) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Missing admin API key'
        }
      });
    }

    const keyHash = hashApiKey(apiKey);
    const adminKey = await findActiveAdminKeyByHash(keyHash);

    if (!adminKey) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid admin API key'
        }
      });
    }

    req.adminKey = {
      id: adminKey.id,
      name: adminKey.name,
      keyPrefix: adminKey.keyPrefix
    };

    updateAdminKeyLastUsed(adminKey.id).catch(() => {});

    return next();
  } catch (err) {
    return next(err);
  }
}