import mongoose from 'mongoose';
import { ZodError } from 'zod';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { AppError } from '../utils/AppError.js';
import { formatZodIssues } from '../utils/validation.js';

/**
 * Maps any thrown value to an AppError so every error response has the same shape.
 * Unknown errors become a generic 500 — internal messages are only exposed in development.
 */
export function normalizeError(err) {
  if (err instanceof AppError) return err;

  if (err instanceof ZodError) return AppError.validation(formatZodIssues(err.issues));

  if (err instanceof mongoose.Error.CastError) {
    return new AppError(`Invalid value for "${err.path}"`, 400, 'INVALID_ID');
  }

  if (err instanceof mongoose.Error.ValidationError) {
    const details = Object.values(err.errors).map((e) => ({ path: e.path, message: e.message }));
    return AppError.validation(details);
  }

  // MongoDB duplicate key (unique index violation)
  if (err?.code === 11000) {
    const fields = Object.keys(err.keyValue ?? err.keyPattern ?? {});
    const label = fields.length ? fields.join(', ') : 'value';
    return AppError.conflict(`A record with this ${label} already exists`, { fields });
  }

  if (err?.name === 'TokenExpiredError') {
    return AppError.unauthorized('Access token expired', 'TOKEN_EXPIRED');
  }
  if (err?.name === 'JsonWebTokenError' || err?.name === 'NotBeforeError') {
    return AppError.unauthorized('Invalid access token', 'INVALID_TOKEN');
  }

  // Errors raised by Express's body parsers
  if (err?.type === 'entity.parse.failed') {
    return new AppError('Malformed JSON in request body', 400, 'INVALID_JSON');
  }
  if (err?.type === 'entity.too.large') {
    return new AppError('Request body is too large', 413, 'PAYLOAD_TOO_LARGE');
  }

  // Other http-errors style client errors (e.g. from third-party middleware)
  if (err?.expose && err.status >= 400 && err.status < 500) {
    return new AppError(err.message, err.status, 'BAD_REQUEST');
  }

  const message = env.isDevelopment && err?.message ? err.message : 'Something went wrong';
  return new AppError(message, 500, 'INTERNAL_ERROR');
}

// Express identifies error middleware by its 4-argument signature.
export function errorHandler(err, req, res, next) {
  const log = req.log ?? logger;

  // Headers already sent (e.g. part-way through an SSE stream): let Express close the connection.
  if (res.headersSent) {
    log.error({ err }, 'Error after response headers were sent');
    return next(err);
  }

  const appError = normalizeError(err);

  if (appError.statusCode >= 500) {
    log.error({ err }, 'Unhandled error');
  } else {
    log.debug({ code: appError.code, message: appError.message }, 'Client error');
  }

  const error = { code: appError.code, message: appError.message };
  if (appError.details !== undefined) error.details = appError.details;

  return res.status(appError.statusCode).json({ success: false, error });
}
