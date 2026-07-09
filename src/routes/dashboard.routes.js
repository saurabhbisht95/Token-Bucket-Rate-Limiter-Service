import express from 'express';
import { z } from 'zod';

import { companyAuth } from '../middlewares/companyAuth.js';
import { validate } from '../middlewares/validate.js';
import { createAuditLog, listAuditLogsByCompany } from '../repositories/audit.repository.js';
import {
  createProject,
  findProjectByIdForCompany,
  listProjectsByCompany
} from '../repositories/project.repository.js';
import {
  createRuntimeApiKey,
  listRuntimeApiKeysByProject,
  revokeRuntimeApiKeyForProject
} from '../repositories/runtimeApiKey.repository.js';
import {
  createOrReplaceClientConfig,
  getClientConfigForProject,
  getClientConfigsForProject,
  updateExistingClientConfigForProject
} from '../services/clientConfig.service.js';
import { getClientStatsForProject } from '../services/stats.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  generateRuntimeApiKey,
  getApiKeyPrefix,
  hashApiKey
} from '../utils/apiKey.js';

export const dashboardRouter = express.Router();

dashboardRouter.use(companyAuth);

const algorithmSchema = z.enum(['TOKEN_BUCKET', 'SLIDING_WINDOW']);

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

const projectParamSchema = z.object({
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

const runtimeKeyParamSchema = z.object({
  body: z.object({}).optional(),
  params: z.object({
    projectId: z.string().uuid(),
    id: z.string().uuid()
  }),
  query: z.object({}).optional()
});

const createClientSchema = z.object({
  body: z.object({
    clientKey: z.string().min(1).max(200),
    algorithm: algorithmSchema.default('TOKEN_BUCKET'),
    requestsPerSecond: z.number().positive().max(100000),
    burstSize: z.number().int().positive().max(1000000),
    windowSeconds: z.number().int().positive().max(86400).default(60),
    isActive: z.boolean().default(true)
  }),
  params: z.object({
    projectId: z.string().uuid()
  }),
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
    projectId: z.string().uuid(),
    clientKey: z.string().min(1)
  }),
  query: z.object({}).optional()
});

const clientParamSchema = z.object({
  body: z.object({}).optional(),
  params: z.object({
    projectId: z.string().uuid(),
    clientKey: z.string().min(1)
  }),
  query: z.object({}).optional()
});

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

async function getOwnedProject(req, res, projectId) {
  const project = await findProjectByIdForCompany(projectId, req.company.id);

  if (!project) {
    res.status(404).json({
      error: {
        code: 'PROJECT_NOT_FOUND',
        message: 'Project not found'
      }
    });
    return null;
  }

  return project;
}

async function writeAudit(req, input) {
  await createAuditLog({
    companyId: req.company.id,
    actorAdminId: req.companyAdmin.id,
    ...input,
    ipAddress: req.ip,
    userAgent: req.header('user-agent')
  });
}

dashboardRouter.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const projects = await listProjectsByCompany(req.company.id);
    const projectDetails = await Promise.all(
      projects.map(async (project) => {
        const [clients, runtimeKeys] = await Promise.all([
          getClientConfigsForProject(project.id),
          listRuntimeApiKeysByProject(project.id)
        ]);

        return {
          project,
          clientCount: clients.length,
          activeClientCount: clients.filter((client) => client.isActive).length,
          runtimeKeyCount: runtimeKeys.length,
          activeRuntimeKeyCount: runtimeKeys.filter((key) => key.isActive).length
        };
      })
    );

    return res.json({
      company: req.company,
      admin: req.companyAdmin,
      metrics: {
        projects: projects.length,
        clients: projectDetails.reduce((sum, item) => sum + item.clientCount, 0),
        activeClients: projectDetails.reduce((sum, item) => sum + item.activeClientCount, 0),
        runtimeKeys: projectDetails.reduce((sum, item) => sum + item.runtimeKeyCount, 0),
        activeRuntimeKeys: projectDetails.reduce(
          (sum, item) => sum + item.activeRuntimeKeyCount,
          0
        )
      },
      projects: projectDetails
    });
  })
);

dashboardRouter.post(
  '/projects',
  validate(createProjectSchema),
  asyncHandler(async (req, res) => {
    try {
      const project = await createProject({
        companyId: req.company.id,
        ...req.validated.body
      });

      await writeAudit(req, {
        action: 'PROJECT_CREATED',
        resourceType: 'project',
        resourceId: project.id,
        metadata: {
          name: project.name,
          slug: project.slug
        }
      });

      return res.status(201).json({
        message: 'Project created',
        project
      });
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({
          error: {
            code: 'PROJECT_SLUG_EXISTS',
            message: 'A project with this slug already exists in this company'
          }
        });
      }

      throw err;
    }
  })
);

dashboardRouter.get(
  '/projects',
  asyncHandler(async (req, res) => {
    const projects = await listProjectsByCompany(req.company.id);

    return res.json({
      count: projects.length,
      projects
    });
  })
);

dashboardRouter.get(
  '/projects/:projectId',
  validate(projectParamSchema),
  asyncHandler(async (req, res) => {
    const project = await getOwnedProject(req, res, req.validated.params.projectId);

    if (!project) return;

    const [clients, runtimeKeys] = await Promise.all([
      getClientConfigsForProject(project.id),
      listRuntimeApiKeysByProject(project.id)
    ]);

    return res.json({
      project,
      clients,
      runtimeKeys: runtimeKeys.map(publicRuntimeKey)
    });
  })
);

dashboardRouter.post(
  '/projects/:projectId/runtime-keys',
  validate(createRuntimeApiKeySchema),
  asyncHandler(async (req, res) => {
    const project = await getOwnedProject(req, res, req.validated.params.projectId);

    if (!project) return;

    const rawApiKey = generateRuntimeApiKey();
    const runtimeKey = await createRuntimeApiKey({
      projectId: project.id,
      name: req.validated.body.name,
      keyPrefix: getApiKeyPrefix(rawApiKey),
      keyHash: hashApiKey(rawApiKey)
    });

    await writeAudit(req, {
      action: 'RUNTIME_API_KEY_CREATED',
      resourceType: 'runtime_api_key',
      resourceId: runtimeKey.id,
      metadata: {
        projectId: project.id,
        keyPrefix: runtimeKey.keyPrefix,
        name: runtimeKey.name
      }
    });

    return res.status(201).json({
      message: 'Runtime API key created. Save apiKey now; it will not be shown again.',
      runtimeKey: publicRuntimeKey(runtimeKey),
      apiKey: rawApiKey
    });
  })
);

dashboardRouter.get(
  '/projects/:projectId/runtime-keys',
  validate(projectParamSchema),
  asyncHandler(async (req, res) => {
    const project = await getOwnedProject(req, res, req.validated.params.projectId);

    if (!project) return;

    const keys = await listRuntimeApiKeysByProject(project.id);

    return res.json({
      count: keys.length,
      keys: keys.map(publicRuntimeKey)
    });
  })
);

dashboardRouter.post(
  '/projects/:projectId/runtime-keys/:id/revoke',
  validate(runtimeKeyParamSchema),
  asyncHandler(async (req, res) => {
    const project = await getOwnedProject(req, res, req.validated.params.projectId);

    if (!project) return;

    const revoked = await revokeRuntimeApiKeyForProject(req.validated.params.id, project.id);

    if (!revoked) {
      return res.status(404).json({
        error: {
          code: 'RUNTIME_KEY_NOT_FOUND',
          message: 'Runtime API key not found'
        }
      });
    }

    await writeAudit(req, {
      action: 'RUNTIME_API_KEY_REVOKED',
      resourceType: 'runtime_api_key',
      resourceId: revoked.id,
      metadata: {
        projectId: project.id,
        keyPrefix: revoked.keyPrefix
      }
    });

    return res.json({
      message: 'Runtime API key revoked',
      runtimeKey: publicRuntimeKey(revoked)
    });
  })
);

dashboardRouter.post(
  '/projects/:projectId/clients',
  validate(createClientSchema),
  asyncHandler(async (req, res) => {
    const project = await getOwnedProject(req, res, req.validated.params.projectId);

    if (!project) return;

    const client = await createOrReplaceClientConfig({
      projectId: project.id,
      ...req.validated.body
    });

    await writeAudit(req, {
      action: 'CLIENT_CONFIG_SAVED',
      resourceType: 'client',
      resourceId: client.id,
      metadata: {
        projectId: project.id,
        clientKey: client.clientKey,
        algorithm: client.algorithm,
        requestsPerSecond: client.requestsPerSecond,
        burstSize: client.burstSize,
        windowSeconds: client.windowSeconds,
        isActive: client.isActive
      }
    });

    return res.status(201).json({
      message: 'Client config saved',
      client
    });
  })
);

dashboardRouter.get(
  '/projects/:projectId/clients',
  validate(projectParamSchema),
  asyncHandler(async (req, res) => {
    const project = await getOwnedProject(req, res, req.validated.params.projectId);

    if (!project) return;

    const clients = await getClientConfigsForProject(project.id);

    return res.json({
      count: clients.length,
      clients
    });
  })
);

dashboardRouter.get(
  '/projects/:projectId/clients/:clientKey',
  validate(clientParamSchema),
  asyncHandler(async (req, res) => {
    const project = await getOwnedProject(req, res, req.validated.params.projectId);

    if (!project) return;

    const client = await getClientConfigForProject(
      project.id,
      req.validated.params.clientKey
    );

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

dashboardRouter.patch(
  '/projects/:projectId/clients/:clientKey',
  validate(updateClientSchema),
  asyncHandler(async (req, res) => {
    const project = await getOwnedProject(req, res, req.validated.params.projectId);

    if (!project) return;

    const client = await updateExistingClientConfigForProject(
      project.id,
      req.validated.params.clientKey,
      req.validated.body
    );

    if (!client) {
      return res.status(404).json({
        error: {
          code: 'CLIENT_NOT_FOUND',
          message: 'Client not found'
        }
      });
    }

    await writeAudit(req, {
      action: 'CLIENT_CONFIG_UPDATED',
      resourceType: 'client',
      resourceId: client.id,
      metadata: {
        projectId: project.id,
        clientKey: client.clientKey,
        changes: req.validated.body
      }
    });

    return res.json({
      message: 'Client config updated',
      client
    });
  })
);

dashboardRouter.get(
  '/projects/:projectId/clients/:clientKey/stats',
  validate(clientParamSchema),
  asyncHandler(async (req, res) => {
    const project = await getOwnedProject(req, res, req.validated.params.projectId);

    if (!project) return;

    const stats = await getClientStatsForProject(project.id, req.validated.params.clientKey);

    return res.json({ stats });
  })
);

dashboardRouter.get(
  '/audit-logs',
  asyncHandler(async (req, res) => {
    const logs = await listAuditLogsByCompany({
      companyId: req.company.id,
      limit: 100
    });

    return res.json({
      count: logs.length,
      logs
    });
  })
);
