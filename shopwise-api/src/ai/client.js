import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { AppError } from '../utils/AppError.js';

/**
 * The single place the Anthropic SDK is configured. The API key never leaves the server.
 * Main model for quality-sensitive work (chat, copywriting), fast model for cheap, quick tasks.
 */
export const MODELS = Object.freeze({
  main: env.ANTHROPIC_MODEL,
  fast: env.ANTHROPIC_FAST_MODEL,
});

// Server-side refusal fallback ("default" routing), supported on these models only.
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
const FALLBACK_CAPABLE = new Set([
  'claude-sonnet-5-5',
  'claude-opus-5-5',
  'claude-opus-5',
  'claude-fable-5-1',
]);

/** Thrown for every AI failure; each feature catches it and falls back to non-AI behavior. */
export class AIUnavailableError extends AppError {
  constructor(message = 'AI features are temporarily unavailable', reason = 'unavailable') {
    super(message, 503, 'AI_UNAVAILABLE');
    this.reason = reason;
  }
}

let client;

export function isAIAvailable() {
  return env.AI_ENABLED && Boolean(env.ANTHROPIC_API_KEY);
}

function getClient() {
  if (!isAIAvailable()) throw new AIUnavailableError(undefined, 'disabled');
  // One retry: AI calls sit on the request path, so latency matters more than persistence.
  client ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 1, timeout: 30_000 });
  return client;
}

function withRefusalFallback(params) {
  if (!env.AI_REFUSAL_FALLBACK || !FALLBACK_CAPABLE.has(params.model)) return null;
  return { ...params, betas: [FALLBACK_BETA], fallbacks: 'default' };
}

/**
 * Structured token-usage log line for every AI call. Aggregating these gives cost per feature
 * and per user (e.g. a log query grouping by `ai.feature`).
 */
export function logUsage({ feature, model, usage, latencyMs, stopReason, userId, rounds }) {
  logger.info(
    {
      ai: {
        feature,
        model,
        inputTokens: usage?.input_tokens ?? 0,
        outputTokens: usage?.output_tokens ?? 0,
        cacheReadTokens: usage?.cache_read_input_tokens ?? 0,
        cacheWriteTokens: usage?.cache_creation_input_tokens ?? 0,
        latencyMs,
        stopReason,
        rounds,
        userId,
      },
    },
    'AI usage',
  );
}

/** Converts SDK/network/timeout errors into AIUnavailableError (logged once, here). */
export function toAIUnavailable(err, feature) {
  if (err instanceof AIUnavailableError) return err;

  const aborted = err instanceof Anthropic.APIUserAbortError || err?.name === 'AbortError';
  const timedOut =
    err instanceof Anthropic.APIConnectionTimeoutError || err?.name === 'TimeoutError';
  const reason = timedOut ? 'timeout' : aborted ? 'aborted' : 'api_error';

  logger.warn(
    { feature, reason, status: err?.status, error: err?.name, message: err?.message },
    'AI request failed',
  );
  return new AIUnavailableError(undefined, reason);
}

/**
 * Non-streaming request with a hard timeout, usage logging and refusal handling.
 *
 * @param {{ feature: string, userId?: string, timeoutMs?: number, signal?: AbortSignal }} meta
 * @param {object} params Messages API params (model, max_tokens, system, messages, ...)
 */
export async function createMessage({ feature, userId, timeoutMs = 20_000, signal }, params) {
  const anthropic = getClient();
  const options = { timeout: timeoutMs, signal };
  const started = Date.now();

  let response;
  try {
    const fallbackParams = withRefusalFallback(params);
    response = fallbackParams
      ? await anthropic.beta.messages.create(fallbackParams, options)
      : await anthropic.messages.create(params, options);
  } catch (err) {
    throw toAIUnavailable(err, feature);
  }

  logUsage({
    feature,
    model: response.model ?? params.model,
    usage: response.usage,
    latencyMs: Date.now() - started,
    stopReason: response.stop_reason,
    userId,
  });

  if (response.stop_reason === 'refusal') {
    throw new AIUnavailableError('The AI could not help with this request', 'refusal');
  }
  return response;
}

/**
 * Structured output: the response is constrained to `schema`'s JSON Schema, then validated
 * with the same Zod schema before anything uses it.
 *
 * @template T
 * @param {Parameters<typeof createMessage>[0]} meta
 * @param {object} params
 * @param {import('zod').ZodType<T>} schema
 * @returns {Promise<T>}
 */
export async function createStructured(meta, params, schema) {
  const format = zodOutputFormat(schema);
  const response = await createMessage(meta, {
    ...params,
    output_config: {
      ...params.output_config,
      format: { type: format.type, schema: format.schema },
    },
  });

  if (response.stop_reason === 'max_tokens') {
    throw new AIUnavailableError(undefined, 'truncated');
  }

  const text = response.content.find((block) => block.type === 'text')?.text;
  try {
    return format.parse(text ?? '');
  } catch (err) {
    logger.warn(
      { feature: meta.feature, message: err.message },
      'AI returned invalid structured output',
    );
    throw new AIUnavailableError(undefined, 'invalid_output');
  }
}

/**
 * Streaming request for the chat assistant. The caller drives the stream (`on('text')`,
 * `finalMessage()`) and logs usage per round.
 *
 * @param {object} params
 * @param {{ signal?: AbortSignal }} [options]
 */
export function streamMessage(params, { signal } = {}) {
  const anthropic = getClient();
  const fallbackParams = withRefusalFallback(params);
  return fallbackParams
    ? anthropic.beta.messages.stream(fallbackParams, { signal })
    : anthropic.messages.stream(params, { signal });
}
