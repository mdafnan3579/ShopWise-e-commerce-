/**
 * An expected, client-facing error. Services throw these; the central error handler turns them
 * into `{ success: false, error: { code, message, details } }` responses.
 */
export class AppError extends Error {
  /**
   * @param {string} message   Human-readable message, safe to show to API clients.
   * @param {number} [statusCode=500]
   * @param {string} [code='INTERNAL_ERROR'] Stable machine-readable code (SCREAMING_SNAKE_CASE).
   * @param {unknown} [details] Optional structured details (e.g. field errors).
   */
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = undefined) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace?.(this, AppError);
  }

  static badRequest(message, details) {
    return new AppError(message, 400, 'BAD_REQUEST', details);
  }

  static validation(details, message = 'Validation failed') {
    return new AppError(message, 400, 'VALIDATION_ERROR', details);
  }

  static unauthorized(message = 'Authentication required', code = 'UNAUTHORIZED') {
    return new AppError(message, 401, code);
  }

  static forbidden(message = 'You do not have permission to perform this action') {
    return new AppError(message, 403, 'FORBIDDEN');
  }

  static notFound(resource = 'Resource') {
    return new AppError(`${resource} not found`, 404, 'NOT_FOUND');
  }

  static conflict(message, details) {
    return new AppError(message, 409, 'CONFLICT', details);
  }
}
