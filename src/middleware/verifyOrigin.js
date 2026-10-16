import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF protection for cookie-based auth.
 *
 * Auth cookies are sent automatically by the browser, so a malicious site could try to submit a
 * state-changing request on a logged-in user's behalf. Browsers always attach an `Origin` header
 * to cross-origin POST/PUT/PATCH/DELETE requests, so rejecting unknown origins blocks that
 * attack. This matters most when COOKIE_SAMESITE=none (frontend and API on different sites).
 * Requests without an Origin (curl, server-to-server, Stripe webhooks) carry no ambient browser
 * cookies and are allowed.
 */
export function verifyOrigin(req, _res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  const origin = req.get('origin');
  if (origin && !env.CLIENT_URL.includes(origin)) {
    req.log?.warn({ origin }, 'Rejected cross-origin state-changing request');
    return next(new AppError('Request origin not allowed', 403, 'CSRF_REJECTED'));
  }
  next();
}
