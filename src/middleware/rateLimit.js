import { rateLimit } from 'express-rate-limit';

/**
 * Factory for rate limiters that respond with the standard error envelope.
 * Limiters are created per app instance (inside `createApp` or router factories), so each test
 * gets a fresh in-memory store.
 *
 * Note: the default memory store is per process. Running several instances would need a shared
 * store (e.g. `rate-limit-redis`).
 *
 * @param {{ windowMs: number, limit: number, message?: string, keyGenerator?: Function }} options
 */
export function createRateLimiter({
  windowMs,
  limit,
  message = 'Too many requests, please try again later.',
  keyGenerator,
}) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    ...(keyGenerator && { keyGenerator }),
    handler: (_req, res, _next, options) =>
      res.status(options.statusCode).json({
        success: false,
        error: { code: 'RATE_LIMITED', message },
      }),
  });
}

/** Broad limiter for the whole /api/v1 surface. Stricter ones are added per route. */
export function createApiLimiter() {
  return createRateLimiter({ windowMs: 15 * 60 * 1000, limit: 300 });
}
