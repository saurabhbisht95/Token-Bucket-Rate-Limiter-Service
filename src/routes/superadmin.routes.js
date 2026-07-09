import express from 'express';
import { z } from 'zod';

import { env } from '../config/env.js';
import { superadminAuth, getOwnerSessionToken } from '../middlewares/superadminAuth.js';
import { validate } from '../middlewares/validate.js';
import { listAdminKeys } from '../repositories/adminKey.repository.js';
import { createAuditLog, listAuditLogs } from '../repositories/audit.repository.js';
import {
  findCompanyById,
  listCompaniesWithStats,
  updateCompanyStatus
} from '../repositories/company.repository.js';
import { listCompanyAdminsByCompany } from '../repositories/companyAdmin.repository.js';
import { listProjectsByCompany } from '../repositories/project.repository.js';
import { listRuntimeApiKeysByProject } from '../repositories/runtimeApiKey.repository.js';
import { getClientConfigsForProject } from '../services/clientConfig.service.js';
import {
  loginSuperadmin,
  logoutSuperadmin,
  OWNER_SESSION_MAX_AGE_SECONDS
} from '../services/superadminAuth.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  buildExpiredCookie,
  buildSessionCookie,
  OWNER_SESSION_COOKIE_NAME
} from '../utils/cookies.js';

export const superadminRouter = express.Router();

const loginSchema = z.object({
  body: z.object({
    adminApiKey: z.string().min(32).max(300)
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional()
});

const companyParamSchema = z.object({
  body: z.object({}).optional(),
  params: z.object({
    companyId: z.string().uuid()
  }),
  query: z.object({}).optional()
});

const companyStatusSchema = z.object({
  body: z.object({
    status: z.enum(['active', 'suspended'])
  }),
  params: z.object({
    companyId: z.string().uuid()
  }),
  query: z.object({}).optional()
});

function isSecureCookie() {
  return env.NODE_ENV === 'production';
}

function attachOwnerSessionCookie(res, token) {
  res.setHeader(
    'Set-Cookie',
    buildSessionCookie(OWNER_SESSION_COOKIE_NAME, token, {
      maxAgeSeconds: OWNER_SESSION_MAX_AGE_SECONDS,
      secure: isSecureCookie()
    })
  );
}

function clearOwnerSessionCookie(res) {
  res.setHeader(
    'Set-Cookie',
    buildExpiredCookie(OWNER_SESSION_COOKIE_NAME, {
      secure: isSecureCookie()
    })
  );
}

function publicOwnerKey(key) {
  return {
    id: key.id,
    name: key.name,
    keyPrefix: key.keyPrefix,
    isActive: key.isActive,
    lastUsedAt: key.lastUsedAt,
    createdAt: key.createdAt,
    revokedAt: key.revokedAt
  };
}

function publicRuntimeKey(key) {
  return {
    id: key.id,
    projectId: key.projectId,
    name: key.name,
    keyPrefix: key.keyPrefix,
    isActive: key.isActive,
    lastUsedAt: key.lastUsedAt,
    createdAt: key.createdAt,
    revokedAt: key.revokedAt
  };
}

superadminRouter.post(
  '/auth/login',
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const result = await loginSuperadmin({
      adminApiKey: req.validated.body.adminApiKey,
      ipAddress: req.ip,
      userAgent: req.header('user-agent')
    });

    attachOwnerSessionCookie(res, result.token);

    return res.json({
      message: 'Superadmin signed in',
      owner: result.adminKey,
      session: {
        expiresAt: result.session.expiresAt
      }
    });
  })
);

superadminRouter.post(
  '/auth/logout',
  asyncHandler(async (req, res) => {
    await logoutSuperadmin(getOwnerSessionToken(req));
    clearOwnerSessionCookie(res);

    return res.json({
      message: 'Superadmin signed out'
    });
  })
);

superadminRouter.get(
  '/auth/me',
  superadminAuth,
  asyncHandler(async (req, res) => {
    return res.json({
      owner: req.ownerAdminKey,
      session: {
        expiresAt: req.ownerSession.expiresAt
      }
    });
  })
);

superadminRouter.use(superadminAuth);

superadminRouter.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const [companies, ownerKeys, auditLogs] = await Promise.all([
      listCompaniesWithStats(),
      listAdminKeys(),
      listAuditLogs({ limit: 20 })
    ]);

    return res.json({
      owner: req.ownerAdminKey,
      metrics: {
        companies: companies.length,
        activeCompanies: companies.filter((company) => company.status === 'active').length,
        suspendedCompanies: companies.filter((company) => company.status === 'suspended').length,
        projects: companies.reduce((sum, company) => sum + company.projectCount, 0),
        clients: companies.reduce((sum, company) => sum + company.clientCount, 0),
        runtimeKeys: companies.reduce((sum, company) => sum + company.runtimeKeyCount, 0),
        activeRuntimeKeys: companies.reduce(
          (sum, company) => sum + company.activeRuntimeKeyCount,
          0
        ),
        ownerKeys: ownerKeys.length
      },
      companies,
      ownerKeys: ownerKeys.map(publicOwnerKey),
      auditLogs
    });
  })
);

superadminRouter.get(
  '/companies',
  asyncHandler(async (req, res) => {
    const companies = await listCompaniesWithStats();

    return res.json({
      count: companies.length,
      companies
    });
  })
);

superadminRouter.get(
  '/companies/:companyId',
  validate(companyParamSchema),
  asyncHandler(async (req, res) => {
    const company = await findCompanyById(req.validated.params.companyId);

    if (!company) {
      return res.status(404).json({
        error: {
          code: 'COMPANY_NOT_FOUND',
          message: 'Company not found'
        }
      });
    }

    const [admins, projects] = await Promise.all([
      listCompanyAdminsByCompany(company.id),
      listProjectsByCompany(company.id)
    ]);

    const projectDetails = await Promise.all(
      projects.map(async (project) => {
        const [clients, runtimeKeys] = await Promise.all([
          getClientConfigsForProject(project.id),
          listRuntimeApiKeysByProject(project.id)
        ]);

        return {
          project,
          clients,
          runtimeKeys: runtimeKeys.map(publicRuntimeKey)
        };
      })
    );

    return res.json({
      company,
      admins,
      projects: projectDetails
    });
  })
);

superadminRouter.patch(
  '/companies/:companyId/status',
  validate(companyStatusSchema),
  asyncHandler(async (req, res) => {
    const company = await updateCompanyStatus(
      req.validated.params.companyId,
      req.validated.body.status
    );

    if (!company) {
      return res.status(404).json({
        error: {
          code: 'COMPANY_NOT_FOUND',
          message: 'Company not found'
        }
      });
    }

    await createAuditLog({
      companyId: company.id,
      actorKeyId: req.ownerAdminKey.id,
      action: 'COMPANY_STATUS_UPDATED',
      resourceType: 'company',
      resourceId: company.id,
      metadata: {
        status: company.status
      },
      ipAddress: req.ip,
      userAgent: req.header('user-agent')
    });

    return res.json({
      message: 'Company status updated',
      company
    });
  })
);

superadminRouter.get(
  '/owner-keys',
  asyncHandler(async (req, res) => {
    const keys = await listAdminKeys();

    return res.json({
      count: keys.length,
      keys: keys.map(publicOwnerKey)
    });
  })
);

superadminRouter.get(
  '/audit-logs',
  asyncHandler(async (req, res) => {
    const logs = await listAuditLogs({ limit: 100 });

    return res.json({
      count: logs.length,
      logs
    });
  })
);
