import { verifyAccessToken } from '../services/token.service.js';
import { AppError } from '../utils/AppError.js';
import { ACCESS_COOKIE } from '../utils/cookies.js';

/**
 * Reads the access token from the httpOnly cookie (browser clients) or an
 * `Authorization: Bearer` header (Swagger UI, scripts, mobile clients).
 */
function extractToken(req) {
  const fromCookie = req.cookies?.[ACCESS_COOKIE];
  if (fromCookie) return fromCookie;

  const header = req.get('authorization');
  if (header?.startsWith('Bearer ')) return header.slice(7).trim();
  return null;
}

/**
 * Requires a valid access token and sets `req.user = { id, role }`.
 *
 * Stateless by design: the JWT is trusted for its short lifetime (15 min) without a DB lookup.
 * Role changes and password resets revoke refresh tokens, so they take effect at the next refresh.
 */
export function requireAuth(req, _res, next) {
  const token = extractToken(req);
  if (!token) return next(AppError.unauthorized());

  // jsonwebtoken errors are mapped to TOKEN_EXPIRED / INVALID_TOKEN by the error handler.
  req.user = verifyAccessToken(token);
  next();
}

/** Sets `req.user` when a valid token is present; otherwise continues as a guest. */
export function optionalAuth(req, _res, next) {
  const token = extractToken(req);
  if (token) {
    try {
      req.user = verifyAccessToken(token);
    } catch {
      // Expired or invalid token on a public route: treat the request as a guest.
    }
  }
  next();
}

/**
 * Must run after `requireAuth`.
 * @param {...string} roles
 */
export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(AppError.unauthorized());
    if (!roles.includes(req.user.role)) return next(AppError.forbidden());
    next();
  };
}
