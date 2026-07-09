import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import pinoHttp from 'pino-http';

import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { limiterRouter } from './routes/limiter.routes.js';
import { adminRouter } from './routes/admin.routes.js';
import { authRouter } from './routes/auth.routes.js';
import { dashboardRouter } from './routes/dashboard.routes.js';
import { superadminRouter } from './routes/superadmin.routes.js';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js';
import { asyncHandler } from './utils/asyncHandler.js';
import { getReadinessStatus } from './services/health.service.js';

export const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, '../public');

// Important when running behind Nginx, load balancers, or cloud proxies.
app.set('trust proxy', 1);

app.use(
  pinoHttp({
    logger
  })
);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        'upgrade-insecure-requests': env.NODE_ENV === 'production' ? [] : null
      }
    }
  })
);
app.use(cors({
  origin: env.CORS_ORIGINS
    ? env.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean)
    : false,
  credentials: Boolean(env.CORS_ORIGINS)
}));
app.use(compression());
app.use(express.json({ limit: '100kb' }));

app.get('/health', (req, res) => {
  return res.json({
    status: 'ok',
    service: 'token-bucket-rate-limiter-service'
  });
});

app.get('/health/live', (req, res) => {
  return res.json({
    status: 'ok',
    service: 'token-bucket-rate-limiter-service'
  });
});

app.get(
  '/health/ready',
  asyncHandler(async (req, res) => {
    const readiness = await getReadinessStatus();

    return res.status(readiness.ready ? 200 : 503).json({
      service: 'token-bucket-rate-limiter-service',
      ...readiness
    });
  })
);

app.use('/v1/auth', authRouter);
app.use('/v1/dashboard', dashboardRouter);
app.use('/v1/superadmin', superadminRouter);
app.use('/v1/limit', limiterRouter);
app.use('/v1/admin', adminRouter);

app.use(express.static(publicDir, {
  index: false,
  maxAge: env.NODE_ENV === 'production' ? '1h' : 0
}));

app.get('/', (req, res) => {
  return res.sendFile(path.join(publicDir, 'index.html'));
});

app.get('/dashboard', (req, res) => {
  return res.sendFile(path.join(publicDir, 'index.html'));
});

app.get('/superadmin', (req, res) => {
  return res.sendFile(path.join(publicDir, 'index.html'));
});

app.use(notFoundHandler);
app.use(errorHandler);
