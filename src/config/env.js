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
    isProduction: data.NODE_ENV === 'production',
    isDevelopment: data.NODE_ENV === 'development',
    isTest: data.NODE_ENV === 'test',
  });
}

export const env = loadEnv(process.env);
