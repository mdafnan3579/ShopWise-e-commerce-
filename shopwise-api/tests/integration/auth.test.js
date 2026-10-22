import jwt from 'jsonwebtoken';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { RefreshToken } from '../../src/models/RefreshToken.js';
import { User } from '../../src/models/User.js';
import {
  DEFAULT_PASSWORD,
  createTestApp,
  createUser,
  getCookie,
  getCookieHeader,
  loginAs,
} from '../helpers/index.js';

const app = createTestApp();
const newUser = { name: 'Ada Lovelace', email: 'Ada@Example.com', password: 'Analytical1' };

describe('POST /api/v1/auth/register', () => {
  it('creates a customer, sets httpOnly auth cookies, and never returns the password', async () => {
    const res = await request(app).post('/api/v1/auth/register').send(newUser);

    expect(res.status).toBe(201);
    expect(res.body.data.user).toMatchObject({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      role: 'customer',
    });
    expect(res.body.data.user).not.toHaveProperty('password');

    const access = getCookieHeader(res, 'sw_access');
    const refresh = getCookieHeader(res, 'sw_refresh');
    expect(access).toMatch(/HttpOnly/);
    expect(access).toMatch(/SameSite=Lax/);
    expect(refresh).toMatch(/Path=\/api\/v1\/auth/);

    const stored = await User.findOne({ email: 'ada@example.com' }).select('+password');
    expect(stored.password).toMatch(/^\$2[aby]\$/); // bcrypt hash, not plaintext
  });

  it('ignores attempts to self-assign the admin role', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ ...newUser, role: 'admin' });
    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe('customer');
  });

  it('rejects duplicate emails with 409 EMAIL_TAKEN', async () => {
    await createUser({ email: 'ada@example.com' });
    const res = await request(app).post('/api/v1/auth/register').send(newUser);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('validates input', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'A', email: 'nope', password: 'short' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.map((d) => d.path)).toEqual(
      expect.arrayContaining(['body.name', 'body.email', 'body.password']),
    );
  });

  it('rejects passwords longer than bcrypt can hash (72 bytes)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ ...newUser, password: `a1${'x'.repeat(80)}` });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/v1/auth/login', () => {
  it('logs in with valid credentials (email is case-insensitive)', async () => {
    const user = await createUser({ email: 'grace@example.com' });
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'GRACE@example.com', password: DEFAULT_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.data.user._id).toBe(String(user._id));
    expect(getCookie(res, 'sw_access')).toBeTruthy();
    expect(getCookie(res, 'sw_refresh')).toBeTruthy();
  });

  it('returns the same error for wrong password and unknown email', async () => {
    await createUser({ email: 'grace@example.com' });
    const wrongPassword = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'grace@example.com', password: 'WrongPass1' });
    const unknownEmail = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@example.com', password: 'WrongPass1' });

    for (const res of [wrongPassword, unknownEmail]) {
      expect(res.status).toBe(401);
      expect(res.body.error).toEqual({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      });
    }
  });

  it('rate limits repeated attempts', async () => {
    const limitedApp = createTestApp({ auth: 3 });
    const attempt = () =>
      request(limitedApp)
        .post('/api/v1/auth/login')
        .send({ email: 'x@example.com', password: 'WrongPass1' });

    for (let i = 0; i < 3; i += 1) expect((await attempt()).status).toBe(401);
    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
  });
});

describe('GET /api/v1/auth/me', () => {
  it('returns the current user from the access cookie', async () => {
    const { agent, user } = await loginAs(app);
    const res = await agent.get('/api/v1/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(user.email);
  });

  it('accepts a Bearer token', async () => {
    const user = await createUser();
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: DEFAULT_PASSWORD });
    const token = getCookie(login, 'sw_access');

    const res = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 TOKEN_EXPIRED for an expired token', async () => {
    const expired = jwt.sign(
      { sub: '0'.repeat(24), role: 'customer' },
      process.env.JWT_ACCESS_SECRET,
      {
        expiresIn: -10,
        issuer: 'shopwise-api',
        audience: 'shopwise-web',
      },
    );
    const res = await request(app).get('/api/v1/auth/me').set('Cookie', `sw_access=${expired}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_EXPIRED');
  });

  it('rejects tokens signed with a different secret or the none algorithm', async () => {
    const forged = jwt.sign({ sub: '0'.repeat(24), role: 'admin' }, 'x'.repeat(40), {
      issuer: 'shopwise-api',
      audience: 'shopwise-web',
    });
    const unsigned = jwt.sign({ sub: '0'.repeat(24), role: 'admin' }, null, { algorithm: 'none' });

    for (const token of [forged, unsigned]) {
      const res = await request(app).get('/api/v1/auth/me').set('Cookie', `sw_access=${token}`);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_TOKEN');
    }
  });
});

describe('POST /api/v1/auth/refresh', () => {
  async function loginAndGetRefresh() {
    const user = await createUser();
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: DEFAULT_PASSWORD });
    return { user, refreshToken: getCookie(res, 'sw_refresh') };
  }

  const refreshWith = (token) =>
    request(app).post('/api/v1/auth/refresh').set('Cookie', `sw_refresh=${token}`);

  it('rotates the refresh token and issues a new access token', async () => {
    const { refreshToken } = await loginAndGetRefresh();

    const res = await refreshWith(refreshToken);

    expect(res.status).toBe(200);
    const rotated = getCookie(res, 'sw_refresh');
    expect(rotated).toBeTruthy();
    expect(rotated).not.toBe(refreshToken);
    expect(getCookie(res, 'sw_access')).toBeTruthy();
  });

  it('detects reuse of a rotated token and revokes the whole session family', async () => {
    const { user, refreshToken: first } = await loginAndGetRefresh();
    const second = getCookie(await refreshWith(first), 'sw_refresh');

    // An attacker replays the old token...
    const replay = await refreshWith(first);
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe('REFRESH_TOKEN_REUSED');

    // ...which also kills the legitimate user's newer token.
    const legit = await refreshWith(second);
    expect(legit.status).toBe(401);

    const active = await RefreshToken.countDocuments({ user: user._id, revokedAt: null });
    expect(active).toBe(0);
  });

  it('returns 401 when the cookie is missing or unknown, and clears cookies', async () => {
    const missing = await request(app).post('/api/v1/auth/refresh');
    expect(missing.status).toBe(401);
    expect(missing.body.error.code).toBe('REFRESH_TOKEN_MISSING');

    const unknown = await refreshWith('not-a-real-token');
    expect(unknown.status).toBe(401);
    expect(unknown.body.error.code).toBe('INVALID_REFRESH_TOKEN');
    expect(getCookieHeader(unknown, 'sw_refresh')).toMatch(/Expires=Thu, 01 Jan 1970/);
  });

  it('only stores a hash of the refresh token', async () => {
    const { refreshToken } = await loginAndGetRefresh();
    expect(await RefreshToken.exists({ tokenHash: refreshToken })).toBeNull();
  });
});

describe('POST /api/v1/auth/logout', () => {
  it('revokes the refresh token and clears cookies', async () => {
    const { agent } = await loginAs(app);

    const res = await agent.post('/api/v1/auth/logout');
    expect(res.status).toBe(200);
    expect(getCookieHeader(res, 'sw_access')).toMatch(/Expires=Thu, 01 Jan 1970/);

    expect((await agent.post('/api/v1/auth/refresh')).status).toBe(401);
    expect((await agent.get('/api/v1/auth/me')).status).toBe(401);
  });

  it('succeeds even without a session', async () => {
    expect((await request(app).post('/api/v1/auth/logout')).status).toBe(200);
  });
});

describe('CSRF origin check', () => {
  it('rejects state-changing requests from unknown origins', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', 'https://evil.example.com')
      .send({ email: 'a@example.com', password: 'whatever1' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_REJECTED');
  });

  it('allows the configured client origin', async () => {
    const user = await createUser();
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', 'http://localhost:5173')
      .send({ email: user.email, password: DEFAULT_PASSWORD });
    expect(res.status).toBe(200);
  });
});
