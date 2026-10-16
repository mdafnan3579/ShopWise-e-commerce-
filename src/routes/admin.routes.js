import { Router } from 'express';
import * as users from '../controllers/user.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { listUsersSchema, updateRoleSchema } from '../validators/user.validators.js';

/** Every route in this router is admin-only, enforced once at the router level. */
export function createAdminRouter() {
  const router = Router();
  router.use(requireAuth, requireRole('admin'));

  router.get('/users', validate(listUsersSchema), users.listUsers);
  router.patch('/users/:id/role', validate(updateRoleSchema), users.updateUserRole);

  return router;
}
