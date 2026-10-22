import { z } from 'zod';

export const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid id');

/** `{ [name]: objectId }` params schema, e.g. `idParams('productId')`. */
export const idParams = (...names) =>
  z.object(Object.fromEntries((names.length ? names : ['id']).map((n) => [n, objectId])));

export const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email({ error: 'Must be a valid email address' }));

/**
 * bcrypt only uses the first 72 bytes of input, so longer passwords are rejected rather than
 * silently truncated.
 */
export const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/\d/, 'Password must contain a number')
  .refine((value) => Buffer.byteLength(value, 'utf8') <= 72, 'Password must be at most 72 bytes');

export const personName = z.string().trim().min(2).max(80);

/** Query-string boolean: accepts `true`/`false`/`1`/`0`. */
export const queryBoolean = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1');

/** Trimmed free-text search term. */
export const searchTerm = z.string().trim().min(1).max(100);
