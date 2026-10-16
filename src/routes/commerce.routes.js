import { Router } from 'express';
import * as commerce from '../controllers/commerce.controller.js';
import * as orders from '../controllers/order.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { createRateLimiter, userOrIpKey } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import {
  checkoutSchema,
  listMyOrdersSchema,
  mergeCartSchema,
  orderBySessionSchema,
  orderIdSchema,
  replaceCartSchema,
  validateCartSchema,
  validateCouponSchema,
} from '../validators/commerce.validators.js';

export function createCartRouter() {
  const router = Router();

  // Public: guests price their localStorage cart here.
  router.post('/validate', validate(validateCartSchema), commerce.validateCart);

  // Saved cart for logged-in users (syncs across devices).
  router.get('/', requireAuth, commerce.getCart);
  router.put('/', requireAuth, validate(replaceCartSchema), commerce.replaceCart);
  router.post('/merge', requireAuth, validate(mergeCartSchema), commerce.mergeCart);
  router.delete('/', requireAuth, commerce.clearCart);

  return router;
}

export function createCouponRouter() {
  const router = Router();
  router.post('/validate', validate(validateCouponSchema), commerce.validateCoupon);
  return router;
}

export function createCheckoutRouter(limits) {
  const router = Router();
  const checkoutLimiter = createRateLimiter({ ...limits.checkout, keyGenerator: userOrIpKey });

  router.post(
    '/session',
    requireAuth,
    checkoutLimiter,
    validate(checkoutSchema),
    commerce.createCheckoutSession,
  );
  return router;
}

export function createOrderRouter() {
  const router = Router();
  router.use(requireAuth);

  router.get('/me', validate(listMyOrdersSchema), orders.listMyOrders);
  router.get(
    '/me/by-session/:sessionId',
    validate(orderBySessionSchema),
    orders.getMyOrderBySession,
  );
  router.get('/me/:id', validate(orderIdSchema), orders.getMyOrder);
  router.post('/:id/cancel', validate(orderIdSchema), orders.cancelMyOrder);

  return router;
}
