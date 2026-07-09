import express from 'express';
import { z } from 'zod';

import { env } from '../config/env.js';
import { companyAuth, getCompanySessionToken } from '../middlewares/companyAuth.js';
import { validate } from '../middlewares/validate.js';
import {
  loginCompanyAdmin,
  logoutCompanyAdmin,
  SESSION_MAX_AGE_SECONDS,
  signupCompanyAdmin
} from '../services/auth.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  buildExpiredCookie,
  buildSessionCookie,
  SESSION_COOKIE_NAME
} from '../utils/cookies.js';

export const authRouter = express.Router();

const passwordSchema = z
  .string()
  .min(12)
  .max(200)
  .regex(/[a-z]/, 'Password must include a lowercase letter')
  .regex(/[A-Z]/, 'Password must include an uppercase letter')
  .regex(/[0-9]/, 'Password must include a number')
  .regex(/[^a-zA-Z0-9]/, 'Password must include a symbol');

const signupSchema = z.object({
  body: z.object({
    companyName: z.string().min(2).max(120),
    adminName: z.string().min(2).max(120),
    email: z.string().email().max(200),
    password: passwordSchema
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional()
});

const loginSchema = z.object({
  body: z.object({
    email: z.string().email().max(200),
    password: z.string().min(1).max(200)
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional()
});

function isSecureCookie() {
  return env.NODE_ENV === 'production';
}

function attachSessionCookie(res, token) {
  res.setHeader(
    'Set-Cookie',
    buildSessionCookie(SESSION_COOKIE_NAME, token, {
      maxAgeSeconds: SESSION_MAX_AGE_SECONDS,
      secure: isSecureCookie()
    })
  );
}

function clearSessionCookie(res) {
  res.setHeader(
    'Set-Cookie',
    buildExpiredCookie(SESSION_COOKIE_NAME, {
      secure: isSecureCookie()
    })
  );
}

authRouter.post(
  '/signup',
  validate(signupSchema),
  asyncHandler(async (req, res) => {
    const result = await signupCompanyAdmin({
      ...req.validated.body,
      ipAddress: req.ip,
      userAgent: req.header('user-agent')
    });

    attachSessionCookie(res, result.token);

    return res.status(201).json({
      message: 'Account created',
      company: result.company,
      admin: result.admin,
      session: {
        expiresAt: result.session.expiresAt
      }
    });
  })
);

authRouter.post(
  '/login',
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const result = await loginCompanyAdmin({
      ...req.validated.body,
      ipAddress: req.ip,
      userAgent: req.header('user-agent')
    });

    attachSessionCookie(res, result.token);

    return res.json({
      message: 'Signed in',
      company: result.company,
      admin: result.admin,
      session: {
        expiresAt: result.session.expiresAt
      }
    });
  })
);

authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    await logoutCompanyAdmin(getCompanySessionToken(req));
    clearSessionCookie(res);

    return res.json({
      message: 'Signed out'
    });
  })
);

authRouter.get(
  '/me',
  companyAuth,
  asyncHandler(async (req, res) => {
    return res.json({
      company: req.company,
      admin: req.companyAdmin,
      session: {
        expiresAt: req.companySession.expiresAt
      }
    });
  })
);
