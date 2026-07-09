import {
  findActiveOwnerAdminSessionByTokenHash,
  updateOwnerAdminSessionLastUsed
} from '../repositories/ownerAdminSession.repository.js';
import { hashApiKey } from '../utils/apiKey.js';
import { OWNER_SESSION_COOKIE_NAME, parseCookies } from '../utils/cookies.js';

function getBearerToken(req) {
  const authHeader = req.header('authorization');

  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    return null;
  }

  return authHeader.slice('bearer '.length).trim();
}

export function getOwnerSessionToken(req) {
  const bearerToken = getBearerToken(req);

  if (bearerToken) {
    return bearerToken;
  }

  const cookies = parseCookies(req.header('cookie'));

  return cookies[OWNER_SESSION_COOKIE_NAME] || null;
}

export async function superadminAuth(req, res, next) {
  try {
    const token = getOwnerSessionToken(req);

    if (!token) {
      return res.status(401).json({
        error: {
          code: 'OWNER_SESSION_REQUIRED',
          message: 'Please sign in to the superadmin console'
        }
      });
    }

    const record = await findActiveOwnerAdminSessionByTokenHash(hashApiKey(token));

    if (!record) {
      return res.status(401).json({
        error: {
          code: 'OWNER_SESSION_INVALID',
          message: 'Your superadmin session is invalid or expired'
        }
      });
    }

    req.ownerSession = record.session;
    req.ownerAdminKey = record.adminKey;

    updateOwnerAdminSessionLastUsed(record.session.id).catch(() => {});

    return next();
  } catch (err) {
    return next(err);
  }
}
