import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { RefreshToken } from '../../src/models/RefreshToken.js';
import {
  DEFAULT_PASSWORD,
  createProduct,
  createTestApp,
  createUser,
  loginAs,
} from '../helpers/index.js';

const app = createTestApp();

const address = {
  fullName: 'Ada Lovelace',
  line1: '12 St James Square',
  city: 'London',
  postalCode: 'SW1Y 4JH',
  country: 'gb',
};

describe('profile', () => {
  it('updates the name', async () => {
    const { agent } = await loginAs(app);
    const res = await agent.patch('/api/v1/users/me').send({ name: 'New Name' });
    expect(res.status).toBe(200);
    expect(res.body.data.user.name).toBe('New Name');
  });

  it('requires the current password to change email', async () => {
    const { agent } = await loginAs(app);

    const missing = await agent.patch('/api/v1/users/me').send({ email: 'new@example.com' });
    expect(missing.status).toBe(400);

    const wrong = await agent
      .patch('/api/v1/users/me')
      .send({ email: 'new@example.com', currentPassword: 'WrongPass1' });
    expect(wrong.status).toBe(401);

    const ok = await agent
      .patch('/api/v1/users/me')
      .send({ email: 'new@example.com', currentPassword: DEFAULT_PASSWORD });
    expect(ok.status).toBe(200);
    expect(ok.body.data.user.email).toBe('new@example.com');
  });

  it('rejects an email that belongs to another account', async () => {
    await createUser({ email: 'taken@example.com' });
    const { agent } = await loginAs(app);
    const res = await agent
      .patch('/api/v1/users/me')
      .send({ email: 'taken@example.com', currentPassword: DEFAULT_PASSWORD });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('requires authentication', async () => {
    expect((await request(app).patch('/api/v1/users/me').send({ name: 'X Y' })).status).toBe(401);
  });
});

describe('change password', () => {
  it('changes the password, signs out other sessions, and keeps this one', async () => {
    const { agent, user } = await loginAs(app);
    const otherDevice = request.agent(app);
    await otherDevice
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: DEFAULT_PASSWORD });

    const res = await agent
      .patch('/api/v1/users/me/password')
      .send({ currentPassword: DEFAULT_PASSWORD, newPassword: 'BrandNew123' });
    expect(res.status).toBe(200);

    expect((await otherDevice.post('/api/v1/auth/refresh')).status).toBe(401);
    expect((await agent.post('/api/v1/auth/refresh')).status).toBe(200);
    expect(await RefreshToken.countDocuments({ user: user._id, revokedAt: null })).toBe(1);

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'BrandNew123' });
    expect(login.status).toBe(200);
  });

  it('rejects a wrong current password', async () => {
    const { agent } = await loginAs(app);
    const res = await agent
      .patch('/api/v1/users/me/password')
      .send({ currentPassword: 'WrongPass1', newPassword: 'BrandNew123' });
    expect(res.status).toBe(401);
  });
});

describe('addresses', () => {
  it('makes the first address the default and normalizes the country', async () => {
    const { agent } = await loginAs(app);
    const res = await agent.post('/api/v1/users/me/addresses').send(address);

    expect(res.status).toBe(201);
    expect(res.body.data.addresses).toHaveLength(1);
    expect(res.body.data.addresses[0]).toMatchObject({ isDefault: true, country: 'GB' });
  });

  it('keeps exactly one default when a new default is added, updated, or deleted', async () => {
    const { agent } = await loginAs(app);
    await agent.post('/api/v1/users/me/addresses').send(address);
    const second = await agent
      .post('/api/v1/users/me/addresses')
      .send({ ...address, line1: '1 Other St', isDefault: true });

    let list = second.body.data.addresses;
    expect(list.filter((a) => a.isDefault)).toHaveLength(1);
    expect(list[1].isDefault).toBe(true);

    const firstId = list[0]._id;
    const updated = await agent
      .patch(`/api/v1/users/me/addresses/${firstId}`)
      .send({ isDefault: true, city: 'Bath' });
    list = updated.body.data.addresses;
    expect(list.find((a) => a._id === firstId)).toMatchObject({ isDefault: true, city: 'Bath' });
    expect(list.filter((a) => a.isDefault)).toHaveLength(1);

    const deleted = await agent.delete(`/api/v1/users/me/addresses/${firstId}`);
    list = deleted.body.data.addresses;
    expect(list).toHaveLength(1);
    expect(list[0].isDefault).toBe(true);
  });

  it('returns 404 for an unknown address and 400 for an invalid id', async () => {
    const { agent } = await loginAs(app);
    expect((await agent.delete(`/api/v1/users/me/addresses/${'a'.repeat(24)}`)).status).toBe(404);
    expect((await agent.delete('/api/v1/users/me/addresses/nope')).status).toBe(400);
  });

  it('validates the country code', async () => {
    const { agent } = await loginAs(app);
    const res = await agent
      .post('/api/v1/users/me/addresses')
      .send({ ...address, country: 'Britain' });
    expect(res.status).toBe(400);
  });
});

describe('wishlist', () => {
  it('adds idempotently, lists product cards, and removes', async () => {
    const { agent } = await loginAs(app);
    const product = await createProduct({ name: 'Trail Runner' });

    await agent.post(`/api/v1/users/me/wishlist/${product._id}`).expect(200);
    const again = await agent.post(`/api/v1/users/me/wishlist/${product._id}`);
    expect(again.body.data.items).toHaveLength(1);
    expect(again.body.data.items[0]).toMatchObject({ name: 'Trail Runner', priceCents: 1999 });

    const list = await agent.get('/api/v1/users/me/wishlist');
    expect(list.body.data.items).toHaveLength(1);

    const removed = await agent.delete(`/api/v1/users/me/wishlist/${product._id}`);
    expect(removed.body.data.items).toHaveLength(0);
  });

  it('rejects unknown or inactive products and hides products deactivated later', async () => {
    const { agent } = await loginAs(app);
    const inactive = await createProduct({ isActive: false });
    expect((await agent.post(`/api/v1/users/me/wishlist/${inactive._id}`)).status).toBe(404);
    expect((await agent.post(`/api/v1/users/me/wishlist/${'b'.repeat(24)}`)).status).toBe(404);

    const product = await createProduct();
    await agent.post(`/api/v1/users/me/wishlist/${product._id}`).expect(200);
    product.isActive = false;
    await product.save();
    expect((await agent.get('/api/v1/users/me/wishlist')).body.data.items).toHaveLength(0);
  });
});

describe('admin users', () => {
  it('forbids customers', async () => {
    const { agent } = await loginAs(app);
    const res = await agent.get('/api/v1/admin/users');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('lists users with search, filtering and pagination', async () => {
    const { agent } = await loginAs(app, { role: 'admin' });
    await createUser({ name: 'Alan Turing', email: 'alan@example.com' });
    await createUser({ name: 'Grace Hopper', email: 'grace@example.com' });

    const res = await agent.get('/api/v1/admin/users?q=alan&limit=5');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).not.toHaveProperty('password');
    expect(res.body.meta).toMatchObject({ page: 1, limit: 5, total: 1 });

    const customers = await agent.get('/api/v1/admin/users?role=customer');
    expect(customers.body.meta.total).toBe(2);
  });

  it('treats search input as literal text, not a regex', async () => {
    const { agent } = await loginAs(app, { role: 'admin' });
    await createUser({ name: 'Alan Turing' });
    const res = await agent.get('/api/v1/admin/users?q=.*');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });

  it('changes roles but not your own', async () => {
    const { agent, user: admin } = await loginAs(app, { role: 'admin' });
    const target = await createUser();

    const res = await agent.patch(`/api/v1/admin/users/${target._id}/role`).send({ role: 'admin' });
    expect(res.status).toBe(200);
    expect(res.body.data.user.role).toBe('admin');

    const self = await agent
      .patch(`/api/v1/admin/users/${admin._id}/role`)
      .send({ role: 'customer' });
    expect(self.status).toBe(400);
    expect(self.body.error.code).toBe('CANNOT_CHANGE_OWN_ROLE');
  });
});
