import { Router } from 'express';
import * as products from '../controllers/product.controller.js';
import * as users from '../controllers/user.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { adminListProductsSchema } from '../validators/product.validators.js';
import { listUsersSchema, updateRoleSchema } from '../validators/user.validators.js';

/** Every route in this router is admin-only, enforced once at the router level. */
export function createAdminRouter() {
  const router = Router();
  router.use(requireAuth, requireRole('admin'));

  router.get('/users', validate(listUsersSchema), users.listUsers);
  router.patch('/users/:id/role', validate(updateRoleSchema), users.updateUserRole);

  router.get('/products', validate(adminListProductsSchema), products.adminListProducts);

  return router;
}
