import * as authService from '../services/auth.service.js';
import * as tokenService from '../services/token.service.js';
import { getUserById, toPublicUser } from '../services/user.service.js';
import { AppError } from '../utils/AppError.js';
import { sendCreated, sendSuccess } from '../utils/apiResponse.js';
import { REFRESH_COOKIE, clearAuthCookies, setAuthCookies } from '../utils/cookies.js';

function requestMeta(req) {
  return { ip: req.ip, userAgent: req.get('user-agent')?.slice(0, 200) };
}

export async function register(req, res) {
  const user = await authService.register(req.validated.body);
  setAuthCookies(res, await tokenService.createSession(user, requestMeta(req)));
  sendCreated(res, { data: { user: toPublicUser(user) }, message: 'Account created' });
}

export async function login(req, res) {
  const user = await authService.login(req.validated.body);
  setAuthCookies(res, await tokenService.createSession(user, requestMeta(req)));
  sendSuccess(res, { data: { user: toPublicUser(user) }, message: 'Logged in' });
}

export async function refresh(req, res) {
  const rawToken = req.cookies?.[REFRESH_COOKIE];
  if (!rawToken) throw AppError.unauthorized('Refresh token missing', 'REFRESH_TOKEN_MISSING');

  try {
    const { user, session } = await tokenService.rotateRefreshToken(rawToken, requestMeta(req));
    setAuthCookies(res, session);
    sendSuccess(res, { data: { user: toPublicUser(user) } });
  } catch (err) {
    // Any refresh failure ends the session client-side too.
    clearAuthCookies(res);
    throw err;
  }
}

export async function logout(req, res) {
  const rawToken = req.cookies?.[REFRESH_COOKIE];
  if (rawToken) await tokenService.revokeRefreshToken(rawToken);
  clearAuthCookies(res);
  sendSuccess(res, { message: 'Logged out' });
}

export async function me(req, res) {
  const user = await getUserById(req.user.id);
  sendSuccess(res, { data: { user: toPublicUser(user) } });
}
