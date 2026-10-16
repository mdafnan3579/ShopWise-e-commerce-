import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { DEFAULT_RATE_LIMITS } from '../../src/middleware/rateLimit.js';
import { Product } from '../../src/models/Product.js';
import { User } from '../../src/models/User.js';

export const DEFAULT_PASSWORD = 'Password123';

/** App with generous rate limits so ordinary tests never trip them. */
export function createTestApp(rateLimits = {}) {
  const generous = Object.fromEntries(Object.keys(DEFAULT_RATE_LIMITS).map((k) => [k, 10_000]));
  return createApp({ rateLimits: { ...generous, ...rateLimits } });
}

const unique = () => randomUUID().slice(0, 8);

export function createUser(overrides = {}) {
  const id = unique();
  return User.create({
    name: `Test User ${id}`,
    email: `user_${id}@example.com`,
    password: DEFAULT_PASSWORD,
    ...overrides,
  });
}

export function createProduct(overrides = {}) {
  const id = unique();
  return Product.create({
    name: `Test Product ${id}`,
    slug: `test-product-${id}`,
    description: 'A dependable test product.',
    priceCents: 1999,
    category: 'electronics',
    brand: 'Acme',
    stock: 10,
    ...overrides,
  });
}

/**
 * Creates a user and returns a Supertest agent that is logged in as them (cookies persisted).
 * @param {import('express').Express} app
 */
export async function loginAs(app, overrides = {}) {
  const user = await createUser(overrides);
  const agent = request.agent(app);
  await agent
    .post('/api/v1/auth/login')
    .send({ email: user.email, password: DEFAULT_PASSWORD })
    .expect(200);
  return { agent, user };
}

/** Reads a cookie value from a response's Set-Cookie headers. */
export function getCookie(res, name) {
  const header = (res.headers['set-cookie'] ?? []).find((c) => c.startsWith(`${name}=`));
  return header ? decodeURIComponent(header.split(';')[0].slice(name.length + 1)) : undefined;
}

export function getCookieHeader(res, name) {
  return (res.headers['set-cookie'] ?? []).find((c) => c.startsWith(`${name}=`));
}
