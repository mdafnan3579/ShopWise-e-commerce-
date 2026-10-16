import { Router } from 'express';
import { createAdminRouter } from './admin.routes.js';
import { createAuthRouter } from './auth.routes.js';
import { healthRouter } from './health.routes.js';
import { createUserRouter } from './user.routes.js';

/**
 * Builds the `/api/v1` router.
 * @param {ReturnType<typeof import('../middleware/rateLimit.js').resolveRateLimits>} limits
 */
export function createApiRouter(limits) {
  const router = Router();

  router.use('/health', healthRouter);
  router.use('/auth', createAuthRouter(limits));
  router.use('/users', createUserRouter());
  router.use('/admin', createAdminRouter());

  return router;
}
