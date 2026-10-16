import { Router } from 'express';
import * as commerce from '../controllers/commerce.controller.js';
import * as orders from '../controllers/order.controller.js';
import * as products from '../controllers/product.controller.js';
import * as users from '../controllers/user.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  adminListOrdersSchema,
  couponIdSchema,
  createCouponSchema,
  listCouponsSchema,
  orderIdSchema,
  updateCouponSchema,
  updateOrderStatusSchema,
} from '../validators/commerce.validators.js';
import { adminListProductsSchema } from '../validators/product.validators.js';
import { listUsersSchema, updateRoleSchema } from '../validators/user.validators.js';

/** Every route in this router is admin-only, enforced once at the router level. */
export function createAdminRouter() {
  const router = Router();
  router.use(requireAuth, requireRole('admin'));

  router.get('/users', validate(listUsersSchema), users.listUsers);
  router.patch('/users/:id/role', validate(updateRoleSchema), users.updateUserRole);

  router.get('/products', validate(adminListProductsSchema), products.adminListProducts);

  router.get('/orders', validate(adminListOrdersSchema), orders.listOrders);
  router.get('/orders/:id', validate(orderIdSchema), orders.getOrder);
  router.patch('/orders/:id/status', validate(updateOrderStatusSchema), orders.updateOrderStatus);

  router.get('/coupons', validate(listCouponsSchema), commerce.listCoupons);
  router.post('/coupons', validate(createCouponSchema), commerce.createCoupon);
  router.patch('/coupons/:id', validate(updateCouponSchema), commerce.updateCoupon);
  router.delete('/coupons/:id', validate(couponIdSchema), commerce.deleteCoupon);

  return router;
}
