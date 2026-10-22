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

  // --- Cloudinary (product images) ---
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),

  // --- Stripe (test mode) ---
  STRIPE_SECRET_KEY: z
    .string()
    .regex(/^(sk|rk)_(test|live)_/, 'must be a Stripe secret (sk_) or restricted (rk_) key')
    .optional(),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith('whsec_').optional(),

  // --- Email (SMTP). Without SMTP_HOST, emails are logged instead of sent. ---
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().default('ShopWise <no-reply@shopwise.dev>'),

  // --- AI (Anthropic). Server-side only; without a key every AI feature uses its fallback. ---
  ANTHROPIC_API_KEY: z.string().startsWith('sk-ant-').optional(),
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-5-5'),
  ANTHROPIC_FAST_MODEL: z.string().default('claude-haiku-5-5'),
  AI_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  // Server-side refusal fallback (Anthropic beta) for main-model requests.
  AI_REFUSAL_FALLBACK: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
});

/**
 * Integrations that may be left unset in development/test (the feature returns a clear
 * "not configured" error instead), but must be configured in production.
 * The Anthropic key is deliberately NOT here: AI features degrade gracefully without it.
 */
const REQUIRED_IN_PRODUCTION = [
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
];

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

  const result = envSchema
    .superRefine((value, ctx) => {
      if (value.NODE_ENV !== 'production') return;
      for (const key of REQUIRED_IN_PRODUCTION) {
        if (!value[key])
          ctx.addIssue({ code: 'custom', path: [key], message: 'required in production' });
      }
    })
    .safeParse(cleaned);

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
