import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import pinoHttp from 'pino-http';

import { logger } from './lib/logger.js';
import { limiterRouter } from './routes/limiter.routes.js';
import { adminRouter } from './routes/admin.routes.js';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js';
import { asyncHandler } from './utils/asyncHandler.js';
import { getReadinessStatus } from './services/health.service.js';

export const app = express();

// Important when running behind Nginx, load balancers, or cloud proxies.
app.set('trust proxy', 1);

app.use(
  pinoHttp({
    logger
  })
);

app.use(helmet());
app.use(cors());
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

app.use('/v1/limit', limiterRouter);
app.use('/v1/admin', adminRouter);

app.use(notFoundHandler);
app.use(errorHandler);