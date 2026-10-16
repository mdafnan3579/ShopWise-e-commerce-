import dotenv from 'dotenv';
import { z } from 'zod';

// Tests configure their environment explicitly (vitest.config.js) and must not pick up a local .env.
if (process.env.NODE_ENV !== 'test') {
  dotenv.config({ quiet: true });
}

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'];

const DEFAULT_LOG_LEVEL = { development: 'debug', test: 'silent', production: 'info' };

/** Comma-separated origins → array of normalized origins (no trailing slash/path). */
const originList = z
  .string()
  .transform((value) =>
    value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  )
  .pipe(z.array(z.url().transform((url) => new URL(url).origin)).min(1));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  CLIENT_URL: originList,
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  LOG_LEVEL: z.enum(LOG_LEVELS).optional(),

  MONGODB_URI: z
    .string()
    .regex(/^mongodb(\+srv)?:\/\//, 'must be a mongodb:// or mongodb+srv:// connection string'),

  // --- Auth ---
  JWT_ACCESS_SECRET: z.string().min(32, 'must be at least 32 characters'),
  JWT_ACCESS_TTL_MINUTES: z.coerce.number().int().min(1).max(60).default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(7),
  // `none` is required when the frontend and API are on different sites (e.g. vercel.app + onrender.com)
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
});

/**
 * Validates environment variables and returns a frozen, typed config object.
 * Throws a readable error listing every problem at once (fail fast on boot).
 *
 * @param {Record<string, string | undefined>} source
 */
export function loadEnv(source) {
  // Treat `KEY=` (empty) in .env as "not set" so defaults apply.
  const cleaned = Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined && value !== ''),
  );

  const result = envSchema.safeParse(cleaned);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}\nSee .env.example.`);
  }

  const data = result.data;
  return Object.freeze({
    ...data,
    LOG_LEVEL: data.LOG_LEVEL ?? DEFAULT_LOG_LEVEL[data.NODE_ENV],
    // Browsers reject SameSite=None cookies that are not Secure.
    COOKIE_SECURE: data.NODE_ENV === 'production' || data.COOKIE_SAMESITE === 'none',
    isProduction: data.NODE_ENV === 'production',
    isDevelopment: data.NODE_ENV === 'development',
    isTest: data.NODE_ENV === 'test',
  });
}

export const env = loadEnv(process.env);
