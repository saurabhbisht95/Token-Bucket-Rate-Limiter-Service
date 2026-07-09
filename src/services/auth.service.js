import crypto from 'node:crypto';

import { pool } from '../db/postgres.js';
import {
  createAdminSession,
  revokeAdminSessionByTokenHash
} from '../repositories/adminSession.repository.js';
import { createCompanyWithClient, findCompanyBySlug } from '../repositories/company.repository.js';
import {
  createCompanyAdminWithClient,
  findCompanyAdminByEmailWithCompany,
  toSafeCompanyAdmin,
  updateCompanyAdminLastLogin
} from '../repositories/companyAdmin.repository.js';
import { hashApiKey } from '../utils/apiKey.js';
import { hashPassword, verifyPassword } from '../utils/password.js';

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
export const SESSION_MAX_AGE_SECONDS = Math.floor(SESSION_TTL_MS / 1000);

function slugifyCompanyName(name) {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70);

  return slug || `company-${crypto.randomBytes(3).toString('hex')}`;
}

async function generateUniqueCompanySlug(name) {
  const base = slugifyCompanyName(name);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const slug = attempt === 0
      ? base
      : `${base}-${crypto.randomBytes(3).toString('hex')}`;

    const existing = await findCompanyBySlug(slug);

    if (!existing) {
      return slug;
    }
  }

  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

function generateSessionToken() {
  return `rls_${crypto.randomBytes(32).toString('base64url')}`;
}

async function createSession({ adminId, ipAddress, userAgent }) {
  const token = generateSessionToken();
  const session = await createAdminSession({
    companyAdminId: adminId,
    tokenHash: hashApiKey(token),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    ipAddress,
    userAgent
  });

  return {
    token,
    session
  };
}

export async function signupCompanyAdmin({
  companyName,
  adminName,
  email,
  password,
  ipAddress,
  userAgent
}) {
  const existing = await findCompanyAdminByEmailWithCompany(email);

  if (existing) {
    const err = new Error('An account with this email already exists');
    err.statusCode = 409;
    err.code = 'EMAIL_ALREADY_REGISTERED';
    throw err;
  }

  const slug = await generateUniqueCompanySlug(companyName);
  const passwordHash = await hashPassword(password);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const company = await createCompanyWithClient(client, {
      name: companyName,
      slug
    });

    const admin = await createCompanyAdminWithClient(client, {
      companyId: company.id,
      name: adminName,
      email,
      passwordHash,
      role: 'owner'
    });

    await client.query('COMMIT');

    const { token, session } = await createSession({
      adminId: admin.id,
      ipAddress,
      userAgent
    });

    return {
      company,
      admin: toSafeCompanyAdmin(admin),
      session,
      token
    };
  } catch (err) {
    await client.query('ROLLBACK');

    if (err.code === '23505') {
      err.statusCode = 409;
      err.code = 'ACCOUNT_CONFLICT';
    }

    throw err;
  } finally {
    client.release();
  }
}

export async function loginCompanyAdmin({
  email,
  password,
  ipAddress,
  userAgent
}) {
  const record = await findCompanyAdminByEmailWithCompany(email);
  const unauthorized = () => {
    const err = new Error('Invalid email or password');
    err.statusCode = 401;
    err.code = 'INVALID_CREDENTIALS';
    return err;
  };

  if (!record) {
    throw unauthorized();
  }

  const { admin, company } = record;

  if (!admin.isActive || company.status !== 'active') {
    const err = new Error('This account is not active');
    err.statusCode = 403;
    err.code = 'ACCOUNT_DISABLED';
    throw err;
  }

  const passwordMatches = await verifyPassword(password, admin.passwordHash);

  if (!passwordMatches) {
    throw unauthorized();
  }

  const { token, session } = await createSession({
    adminId: admin.id,
    ipAddress,
    userAgent
  });

  await updateCompanyAdminLastLogin(admin.id);

  return {
    company,
    admin: toSafeCompanyAdmin({
      ...admin,
      lastLoginAt: new Date()
    }),
    session,
    token
  };
}

export async function logoutCompanyAdmin(token) {
  if (!token) return null;

  return revokeAdminSessionByTokenHash(hashApiKey(token));
}
