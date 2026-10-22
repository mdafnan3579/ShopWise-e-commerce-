import { AppError } from '../utils/AppError.js';

const MAX_DEPTH = 10;

/** Returns the first key that looks like a MongoDB operator or dotted path, or null. */
function findUnsafeKey(value, depth = 0) {
  if (value === null || typeof value !== 'object' || depth > MAX_DEPTH) return null;

  for (const [key, child] of Object.entries(value)) {
    if (key.startsWith('$') || key.includes('.')) return key;
    const nested = findUnsafeKey(child, depth + 1);
    if (nested) return nested;
  }
  return null;
}

/**
 * Defense in depth against NoSQL operator injection (e.g. `{ "email": { "$ne": null } }`).
 * Zod validation is the primary defense; this rejects operator-shaped keys anywhere in the
 * request before any handler runs. Rejecting (rather than silently stripping) keeps behavior
 * predictable and surfaces probing attempts in the logs.
 */
export function rejectMongoOperators(req, _res, next) {
  for (const part of ['body', 'query', 'params']) {
    const key = findUnsafeKey(req[part]);
    if (key) {
      req.log?.warn({ part, key }, 'Rejected request containing Mongo operator key');
      return next(new AppError(`Invalid key "${key}" in request ${part}`, 400, 'INVALID_INPUT'));
    }
  }
  next();
}
