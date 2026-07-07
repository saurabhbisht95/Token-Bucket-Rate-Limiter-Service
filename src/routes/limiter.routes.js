import express from 'express';
import { z } from 'zod';
import { validate } from '../middlewares/validate.js';
import { runtimeAuth } from '../middlewares/runtimeAuth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  getClientConfig,
  getClientConfigForProject
} from '../services/clientConfig.service.js';
import { checkLimit } from '../services/limiter.service.js';
import { attachRateLimitHeaders } from '../utils/rateLimitHeaders.js';

export const limiterRouter = express.Router();

const checkSchema = z.object({
  body: z.object({
    clientKey: z.string().min(1).max(200),
    cost: z.number().int().positive().max(100).default(1)
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional()
});

// Legacy dev endpoint.
// Useful for local testing and old load tests.
limiterRouter.post(
  '/check',
  validate(checkSchema),
  asyncHandler(async (req, res) => {
    const { clientKey, cost } = req.validated.body;

    const config = await getClientConfig(clientKey);

    if (!config) {
      return res.status(404).json({
        error: {
          code: 'CLIENT_NOT_FOUND',
          message: 'No rate limit config found for this client key'
        }
      });
    }

    if (!config.isActive) {
      return res.status(403).json({
        error: {
          code: 'CLIENT_DISABLED',
          message: 'This client is disabled'
        }
      });
    }

    const result = await checkLimit(config, cost);

    attachRateLimitHeaders(res, result);

    return res.status(result.allowed ? 200 : 429).json({
      decision: result.allowed ? 'ALLOW' : 'DENY',
      allowed: result.allowed,
      clientKey,
      algorithm: result.algorithm,
      limit: result.limit,
      remaining: result.remaining,
      resetMs: result.resetMs,
      resetAt: new Date(Date.now() + result.resetMs).toISOString()
    });
  })
);

// Production endpoint.
// Requires x-api-key and only checks configs owned by that key's project.
limiterRouter.post(
  '/check-authenticated',
  runtimeAuth,
  validate(checkSchema),
  asyncHandler(async (req, res) => {
    const { clientKey, cost } = req.validated.body;
    const projectId = req.runtimeKey.projectId;

    const config = await getClientConfigForProject(projectId, clientKey);

    if (!config) {
      return res.status(404).json({
        error: {
          code: 'CLIENT_NOT_FOUND_FOR_PROJECT',
          message: 'No rate limit config found for this project and client key'
        }
      });
    }

    if (!config.isActive) {
      return res.status(403).json({
        error: {
          code: 'CLIENT_DISABLED',
          message: 'This client is disabled'
        }
      });
    }

    const result = await checkLimit(config, cost);

    attachRateLimitHeaders(res, result);

    return res.status(result.allowed ? 200 : 429).json({
      decision: result.allowed ? 'ALLOW' : 'DENY',
      allowed: result.allowed,
      projectId,
      clientKey,
      algorithm: result.algorithm,
      limit: result.limit,
      remaining: result.remaining,
      resetMs: result.resetMs,
      resetAt: new Date(Date.now() + result.resetMs).toISOString()
    });
  })
);