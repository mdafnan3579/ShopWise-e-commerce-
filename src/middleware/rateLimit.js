import { ipKeyGenerator, rateLimit } from 'express-rate-limit';

const MINUTE = 60 * 1000;

/**
 * Default limits per limiter name. `createApp({ rateLimits })` can override `limit` per name
 * (tests use generous limits, except the tests that verify limiting itself).
 */
export const DEFAULT_RATE_LIMITS = Object.freeze({
  api: { windowMs: 15 * MINUTE, limit: 300 },
  auth: { windowMs: 15 * MINUTE, limit: 10 },
  refresh: { windowMs: 15 * MINUTE, limit: 60 },
  review: { windowMs: 60 * MINUTE, limit: 20 },
  checkout: { windowMs: 15 * MINUTE, limit: 20 },
  aiChat: { windowMs: MINUTE, limit: 10 },
  aiSearch: { windowMs: MINUTE, limit: 20 },
  aiSummary: { windowMs: MINUTE, limit: 30 },
  aiRecommendations: { windowMs: MINUTE, limit: 20 },
  aiAdmin: { windowMs: MINUTE, limit: 10 },
});

/**
 * Merges `{ name: number }` overrides into the defaults.
 * @param {Record<string, number>} [overrides]
 */
export function resolveRateLimits(overrides = {}) {
  return Object.fromEntries(
    Object.entries(DEFAULT_RATE_LIMITS).map(([name, config]) => [
      name,
      { ...config, limit: overrides[name] ?? config.limit },
    ]),
  );
}

/** Rate-limit logged-in users per account (fair across shared IPs), guests per IP. */
export function userOrIpKey(req) {
  return req.user ? `user:${req.user.id}` : `ip:${ipKeyGenerator(req.ip)}`;
}

/**
 * Factory for rate limiters that respond with the standard error envelope.
 * Limiters are created per app instance so each test gets a fresh in-memory store.
 *
 * Note: the default memory store is per process. Running several instances would need a
 * shared store (e.g. `rate-limit-redis`).
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
