import { createHash, randomBytes, randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { RefreshToken } from '../models/RefreshToken.js';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';

const JWT_OPTIONS = { issuer: 'shopwise-api', audience: 'shopwise-web' };
const DAY_MS = 24 * 60 * 60 * 1000;

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

/** @param {{ _id: unknown, role: string }} user */
export function signAccessToken(user) {
  return jwt.sign({ sub: String(user._id), role: user.role }, env.JWT_ACCESS_SECRET, {
    ...JWT_OPTIONS,
    algorithm: 'HS256',
    expiresIn: `${env.JWT_ACCESS_TTL_MINUTES}m`,
  });
}

/**
 * Verifies signature, expiry, issuer and audience. Pinning the algorithm blocks
 * algorithm-confusion attacks (e.g. `alg: none`).
 * @returns {{ id: string, role: string }}
 */
export function verifyAccessToken(token) {
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, {
    ...JWT_OPTIONS,
    algorithms: ['HS256'],
  });
  return { id: payload.sub, role: payload.role };
}

/**
 * Issues an opaque random refresh token and stores only its hash.
 * @param {unknown} userId
 * @param {{ family?: string, ip?: string, userAgent?: string }} [meta]
 */
async function issueRefreshToken(userId, { family = randomUUID(), ip, userAgent } = {}) {
  const token = randomBytes(48).toString('base64url');
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * DAY_MS);

  await RefreshToken.create({
    user: userId,
    tokenHash: hashToken(token),
    family,
    expiresAt,
    createdByIp: ip,
    userAgent,
  });

  return { token, expiresAt, tokenHash: hashToken(token) };
}

/**
 * Starts a new session (login/register): a new access token and a refresh token in a new family.
 * @param {{ _id: unknown, role: string }} user
 */
export async function createSession(user, meta = {}) {
  const refresh = await issueRefreshToken(user._id, meta);
  return {
    accessToken: signAccessToken(user),
    refreshToken: refresh.token,
    refreshExpiresAt: refresh.expiresAt,
  };
}

async function revokeFamily(family) {
  await RefreshToken.updateMany({ family, revokedAt: null }, { revokedAt: new Date() });
}

/**
 * Refresh token rotation with reuse detection.
 *
 * - Valid token → revoke it, issue a new one in the same family, return a new session.
 * - Already-revoked token → someone is replaying an old token (likely stolen): revoke the whole
 *   family so both the attacker and the victim must log in again.
 *
 * @param {string} rawToken
 * @param {{ ip?: string, userAgent?: string }} [meta]
 */
export async function rotateRefreshToken(rawToken, meta = {}) {
  const tokenHash = hashToken(rawToken);
  const stored = await RefreshToken.findOne({ tokenHash });

  if (!stored) throw AppError.unauthorized('Invalid refresh token', 'INVALID_REFRESH_TOKEN');

  if (stored.revokedAt) {
    await revokeFamily(stored.family);
    logger.warn({ userId: stored.user, family: stored.family }, 'Refresh token reuse detected');
    throw AppError.unauthorized(
      'Session is no longer valid, please log in again',
      'REFRESH_TOKEN_REUSED',
    );
  }

  if (stored.expiresAt <= new Date()) {
    throw AppError.unauthorized('Session expired, please log in again', 'REFRESH_TOKEN_EXPIRED');
  }

  // Atomic claim: if two requests race with the same token, only one wins.
  const claimed = await RefreshToken.findOneAndUpdate(
    { _id: stored._id, revokedAt: null },
    { revokedAt: new Date() },
  );
  if (!claimed) {
    await revokeFamily(stored.family);
    throw AppError.unauthorized(
      'Session is no longer valid, please log in again',
      'REFRESH_TOKEN_REUSED',
    );
  }

  const user = await User.findById(stored.user).lean();
  if (!user) {
    await revokeFamily(stored.family);
    throw AppError.unauthorized('Account no longer exists', 'INVALID_REFRESH_TOKEN');
  }

  const next = await issueRefreshToken(user._id, { ...meta, family: stored.family });
  await RefreshToken.updateOne({ _id: stored._id }, { replacedByHash: next.tokenHash });

  return {
    user,
    session: {
      accessToken: signAccessToken(user),
      refreshToken: next.token,
      refreshExpiresAt: next.expiresAt,
    },
  };
}

/** Logout: revoke the presented refresh token (idempotent, never throws for unknown tokens). */
export async function revokeRefreshToken(rawToken) {
  await RefreshToken.updateOne(
    { tokenHash: hashToken(rawToken), revokedAt: null },
    { revokedAt: new Date() },
  );
}

/** Logs a user out everywhere (e.g. after a password change). */
export async function revokeAllUserTokens(userId) {
  await RefreshToken.updateMany({ user: userId, revokedAt: null }, { revokedAt: new Date() });
}
