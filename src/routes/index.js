import { Router } from 'express';
import { createAdminRouter } from './admin.routes.js';
import { createAIRouter } from './ai.routes.js';
import { createAuthRouter } from './auth.routes.js';
import {
  createCartRouter,
  createCheckoutRouter,
  createCouponRouter,
  createOrderRouter,
} from './commerce.routes.js';
import { healthRouter } from './health.routes.js';
import { createProductRouter } from './product.routes.js';
import { createReviewRouter } from './review.routes.js';
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
  router.use('/products', createProductRouter(limits));
  router.use('/reviews', createReviewRouter());
  router.use('/cart', createCartRouter());
  router.use('/coupons', createCouponRouter());
  router.use('/checkout', createCheckoutRouter(limits));
  router.use('/orders', createOrderRouter());
  router.use('/ai', createAIRouter(limits));
  router.use('/admin', createAdminRouter());

  return router;
}
