import { Router } from 'express';
import * as auth from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { loginSchema, registerSchema } from '../validators/auth.validators.js';

/** @param {ReturnType<typeof import('../middleware/rateLimit.js').resolveRateLimits>} limits */
export function createAuthRouter(limits) {
  const router = Router();

  // Brute-force protection: credential endpoints share a strict per-IP budget.
  const credentialLimiter = createRateLimiter({
    ...limits.auth,
    message: 'Too many attempts, please try again in a few minutes.',
  });
  const refreshLimiter = createRateLimiter(limits.refresh);

  router.post('/register', credentialLimiter, validate(registerSchema), auth.register);
  router.post('/login', credentialLimiter, validate(loginSchema), auth.login);
  router.post('/refresh', refreshLimiter, auth.refresh);
  router.post('/logout', auth.logout);
  router.get('/me', requireAuth, auth.me);

  return router;
}
