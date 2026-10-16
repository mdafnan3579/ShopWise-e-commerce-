import { env } from '../config/env.js';

export const ACCESS_COOKIE = 'sw_access';
export const REFRESH_COOKIE = 'sw_refresh';

// The refresh cookie is only sent to auth endpoints, which shrinks its exposure.
const REFRESH_COOKIE_PATH = '/api/v1/auth';

function baseOptions() {
  return {
    httpOnly: true, // not readable from JavaScript, so XSS cannot steal it
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAMESITE,
  };
}

/**
 * @param {import('express').Response} res
 * @param {{ accessToken: string, refreshToken: string, refreshExpiresAt: Date }} session
 */
export function setAuthCookies(res, { accessToken, refreshToken, refreshExpiresAt }) {
  res.cookie(ACCESS_COOKIE, accessToken, {
    ...baseOptions(),
    path: '/',
    maxAge: env.JWT_ACCESS_TTL_MINUTES * 60 * 1000,
  });
  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...baseOptions(),
    path: REFRESH_COOKIE_PATH,
    expires: refreshExpiresAt,
  });
}

/** @param {import('express').Response} res */
export function clearAuthCookies(res) {
  res.clearCookie(ACCESS_COOKIE, { ...baseOptions(), path: '/' });
  res.clearCookie(REFRESH_COOKIE, { ...baseOptions(), path: REFRESH_COOKIE_PATH });
}
