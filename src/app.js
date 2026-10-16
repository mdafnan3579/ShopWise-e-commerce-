import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { stripeWebhook } from './controllers/webhook.controller.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFound } from './middleware/notFound.js';
import { createRateLimiter, resolveRateLimits } from './middleware/rateLimit.js';
import { requestLogger } from './middleware/requestLogger.js';
import { rejectMongoOperators } from './middleware/sanitize.js';
import { verifyOrigin } from './middleware/verifyOrigin.js';
import { healthRouter } from './routes/health.routes.js';
import { createApiRouter } from './routes/index.js';

const BODY_LIMIT = '100kb';

/**
 * Exact-match origin allow-list. Requests without an Origin header (curl, server-to-server,
 * Stripe webhooks) are allowed: CORS is a browser protection, not authentication.
 */
function corsOrigin(origin, callback) {
  callback(null, !origin || env.CLIENT_URL.includes(origin));
}

/**
 * Builds the Express app without binding a port, so tests can drive it with Supertest.
 *
 * @param {{ rateLimits?: Record<string, number> }} [options] per-limiter `limit` overrides
 */
export function createApp({ rateLimits } = {}) {
  const app = express();
  const limits = resolveRateLimits(rateLimits);

  // Behind Render/Heroku-style proxies this makes req.ip (rate limiting) and req.secure correct.
  app.set('trust proxy', env.TRUST_PROXY);
  // Express 5 default, set explicitly: `?a[b]=c` stays a flat string and never becomes an
  // object, which blocks query-string operator injection like `?email[$ne]=x`.
  app.set('query parser', 'simple');

  app.use(requestLogger);
  app.use(helmet());
  app.use(cors({ origin: corsOrigin, credentials: true }));

  // Stripe signs the exact raw bytes, so the webhook gets a raw body and is mounted before the
  // JSON parser. It also sits outside the API rate limiter (Stripe retries are legitimate).
  app.post(
    '/api/v1/webhooks/stripe',
    express.raw({ type: 'application/json', limit: '1mb' }),
    stripeWebhook,
  );

  app.use(express.json({ limit: BODY_LIMIT }));
  app.use(express.urlencoded({ extended: false, limit: BODY_LIMIT }));
  app.use(cookieParser());
  app.use(rejectMongoOperators);

  app.use('/health', healthRouter);
  app.use('/api/v1', createRateLimiter(limits.api), verifyOrigin, createApiRouter(limits));

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
