import {
  findActiveAdminSessionByTokenHash,
  updateAdminSessionLastUsed
} from '../repositories/adminSession.repository.js';
import { toSafeCompanyAdmin } from '../repositories/companyAdmin.repository.js';
import { hashApiKey } from '../utils/apiKey.js';
import { parseCookies, SESSION_COOKIE_NAME } from '../utils/cookies.js';

function getBearerToken(req) {
  const authHeader = req.header('authorization');

  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    return null;
  }

  return authHeader.slice('bearer '.length).trim();
}

export function getCompanySessionToken(req) {
  const bearerToken = getBearerToken(req);

  if (bearerToken) {
    return bearerToken;
  }

  const cookies = parseCookies(req.header('cookie'));

  return cookies[SESSION_COOKIE_NAME] || null;
}

export async function companyAuth(req, res, next) {
  try {
    const token = getCompanySessionToken(req);

    if (!token) {
      return res.status(401).json({
        error: {
          code: 'SESSION_REQUIRED',
          message: 'Please sign in to continue'
        }
      });
    }

    const sessionRecord = await findActiveAdminSessionByTokenHash(hashApiKey(token));

    if (!sessionRecord) {
      return res.status(401).json({
        error: {
          code: 'SESSION_INVALID',
          message: 'Your session is invalid or expired'
        }
      });
    }

    req.companySession = sessionRecord.session;
    req.companyAdmin = toSafeCompanyAdmin(sessionRecord.admin);
    req.company = sessionRecord.company;

    updateAdminSessionLastUsed(sessionRecord.session.id).catch(() => {});

    return next();
  } catch (err) {
    return next(err);
  }
}
