import express from 'express';
import { z } from 'zod';

import { adminAuth } from '../middlewares/adminAuth.js';
import { validate } from '../middlewares/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';

import { createAuditLog, listAuditLogs } from '../repositories/audit.repository.js';

import {
  createProject,
  findProjectById,
  listProjects
} from '../repositories/project.repository.js';

import {
  createRuntimeApiKey,
  listRuntimeApiKeysByProject,
  revokeRuntimeApiKey
} from '../repositories/runtimeApiKey.repository.js';

import {
  generateRuntimeApiKey,
  getApiKeyPrefix,
  hashApiKey
} from '../utils/apiKey.js';

import {
  createOrReplaceClientConfig,
  getAllClientConfigs,
  getClientConfig,
  updateExistingClientConfig
} from '../services/clientConfig.service.js';

import { getClientStats } from '../services/stats.service.js';

export const adminRouter = express.Router();

adminRouter.use(adminAuth);

const algorithmSchema = z.enum(['TOKEN_BUCKET', 'SLIDING_WINDOW']);

const createClientSchema = z.object({
  body: z.object({
    projectId: z.string().uuid().optional(),
    clientKey: z.string().min(1).max(200),
    algorithm: algorithmSchema.default('TOKEN_BUCKET'),
    requestsPerSecond: z.number().positive().max(100000),
    burstSize: z.number().int().positive().max(1000000),
    windowSeconds: z.number().int().positive().max(86400).default(60),
    isActive: z.boolean().default(true)
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional()
});

const updateClientSchema = z.object({
  body: z.object({
    algorithm: algorithmSchema.optional(),
    requestsPerSecond: z.number().positive().max(100000).optional(),
    burstSize: z.number().int().positive().max(1000000).optional(),
    windowSeconds: z.number().int().positive().max(86400).optional(),
    isActive: z.boolean().optional()
  }),
  params: z.object({
    clientKey: z.string().min(1)
  }),
  query: z.object({}).optional()
});

const clientParamSchema = z.object({
  body: z.object({}).optional(),
  params: z.object({
    clientKey: z.string().min(1)
  }),
  query: z.object({}).optional()
});

const createProjectSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(100),
    slug: z
      .string()
      .min(2)
      .max(80)
      .regex(/^[a-z0-9-]+$/, 'Slug can contain only lowercase letters, numbers, and hyphens')
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional()
});

const projectIdParamSchema = z.object({
  body: z.object({}).optional(),
  params: z.object({
    projectId: z.string().uuid()
  }),
  query: z.object({}).optional()
});

const createRuntimeApiKeySchema = z.object({
  body: z.object({
    name: z.string().min(2).max(100)
  }),
  params: z.object({
    projectId: z.string().uuid()
  }),
  query: z.object({}).optional()
});

adminRouter.post(
  '/projects',
  validate(createProjectSchema),
  asyncHandler(async (req, res) => {
    const project = await createProject(req.validated.body);

    await createAuditLog({
      actorKeyId: req.adminKey?.id,
      action: 'PROJECT_CREATED',
      resourceType: 'project',
      resourceId: project.id,
      metadata: {
        name: project.name,
        slug: project.slug
      },
      ipAddress: req.ip,
      userAgent: req.header('user-agent')
    });

    return res.status(201).json({
      message: 'Project created',
      project
    });
  })
);

adminRouter.get(
  '/projects',
  asyncHandler(async (req, res) => {
    const projects = await listProjects();

    return res.json({
      count: projects.length,
      projects
    });
  })
);

adminRouter.post(
  '/projects/:projectId/runtime-keys',
  validate(createRuntimeApiKeySchema),
  asyncHandler(async (req, res) => {
    const { projectId } = req.validated.params;
    const { name } = req.validated.body;

    const project = await findProjectById(projectId);

    if (!project) {
      return res.status(404).json({
        error: {
          code: 'PROJECT_NOT_FOUND',
          message: 'Project not found'
        }
      });
    }

    const rawApiKey = generateRuntimeApiKey();

    const runtimeKey = await createRuntimeApiKey({
      projectId,
      name,
      keyPrefix: getApiKeyPrefix(rawApiKey),
      keyHash: hashApiKey(rawApiKey)
    });

    await createAuditLog({
      actorKeyId: req.adminKey?.id,
      action: 'RUNTIME_API_KEY_CREATED',
      resourceType: 'runtime_api_key',
      resourceId: runtimeKey.id,
      metadata: {
        projectId,
        keyPrefix: runtimeKey.keyPrefix,
        name: runtimeKey.name
      },
      ipAddress: req.ip,
      userAgent: req.header('user-agent')
    });

    return res.status(201).json({
      message: 'Runtime API key created. Save apiKey now; it will not be shown again.',
      runtimeKey: {
        id: runtimeKey.id,
        projectId: runtimeKey.projectId,
        name: runtimeKey.name,
        keyPrefix: runtimeKey.keyPrefix,
        isActive: runtimeKey.isActive,
        createdAt: runtimeKey.createdAt
      },
      apiKey: rawApiKey
    });
  })
);

adminRouter.get(
  '/projects/:projectId/runtime-keys',
  validate(projectIdParamSchema),
  asyncHandler(async (req, res) => {
    const { projectId } = req.validated.params;

    const keys = await listRuntimeApiKeysByProject(projectId);

    return res.json({
      count: keys.length,
      keys: keys.map((key) => ({
        id: key.id,
        projectId: key.projectId,
        name: key.name,
        keyPrefix: key.keyPrefix,
        isActive: key.isActive,
        lastUsedAt: key.lastUsedAt,
        createdAt: key.createdAt,
        revokedAt: key.revokedAt
      }))
    });
  })
);

adminRouter.post(
  '/runtime-keys/:id/revoke',
  asyncHandler(async (req, res) => {
    const revoked = await revokeRuntimeApiKey(req.params.id);

    if (!revoked) {
      return res.status(404).json({
        error: {
          code: 'RUNTIME_KEY_NOT_FOUND',
          message: 'Runtime API key not found'
        }
      });
    }

    await createAuditLog({
      actorKeyId: req.adminKey?.id,
      action: 'RUNTIME_API_KEY_REVOKED',
      resourceType: 'runtime_api_key',
      resourceId: revoked.id,
      metadata: {
        projectId: revoked.projectId,
        keyPrefix: revoked.keyPrefix
      },
      ipAddress: req.ip,
      userAgent: req.header('user-agent')
    });

    return res.json({
      message: 'Runtime API key revoked',
      runtimeKey: {
        id: revoked.id,
        projectId: revoked.projectId,
        name: revoked.name,
        keyPrefix: revoked.keyPrefix,
        isActive: revoked.isActive,
        revokedAt: revoked.revokedAt
      }
    });
  })
);

adminRouter.post(
  '/clients',
  validate(createClientSchema),
  asyncHandler(async (req, res) => {
    const client = await createOrReplaceClientConfig(req.validated.body);

    return res.status(201).json({
      message: 'Client config saved',
      client
    });
  })
);

adminRouter.get(
  '/clients',
  asyncHandler(async (req, res) => {
    const clients = await getAllClientConfigs();

    return res.json({
      count: clients.length,
      clients
    });
  })
);

adminRouter.get(
  '/clients/:clientKey',
  validate(clientParamSchema),
  asyncHandler(async (req, res) => {
    const { clientKey } = req.validated.params;
    const client = await getClientConfig(clientKey);

    if (!client) {
      return res.status(404).json({
        error: {
          code: 'CLIENT_NOT_FOUND',
          message: 'Client not found'
        }
      });
    }

    return res.json({ client });
  })
);

adminRouter.patch(
  '/clients/:clientKey',
  validate(updateClientSchema),
  asyncHandler(async (req, res) => {
    const { clientKey } = req.validated.params;

    const client = await updateExistingClientConfig(clientKey, req.validated.body);

    if (!client) {
      return res.status(404).json({
        error: {
          code: 'CLIENT_NOT_FOUND',
          message: 'Client not found'
        }
      });
    }

    return res.json({
      message: 'Client config updated',
      client
    });
  })
);

adminRouter.get(
  '/stats/:clientKey',
  validate(clientParamSchema),
  asyncHandler(async (req, res) => {
    const { clientKey } = req.validated.params;
    const stats = await getClientStats(clientKey);

    return res.json({ stats });
  })
);

adminRouter.get(
  '/audit-logs',
  asyncHandler(async (req, res) => {
    const logs = await listAuditLogs({ limit: 100 });

    return res.json({
      count: logs.length,
      logs
    });
  })
);