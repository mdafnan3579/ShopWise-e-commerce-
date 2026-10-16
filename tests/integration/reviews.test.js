import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { Product } from '../../src/models/Product.js';
import { createProduct, createTestApp, loginAs } from '../helpers/index.js';

const app = createTestApp();
const review = (rating, comment = 'Solid product, would buy again.') => ({ rating, comment });

describe('product reviews', () => {
  it('creates a review and recalculates the product rating', async () => {
    const product = await createProduct();
    const alice = await loginAs(app);
    const bob = await loginAs(app);

    const created = await alice.agent
      .post(`/api/v1/products/${product._id}/reviews`)
      .send(review(5));
    expect(created.status).toBe(201);
    expect(created.body.data.user).toMatchObject({ name: alice.user.name });

    await bob.agent.post(`/api/v1/products/${product._id}/reviews`).send(review(2));

    const updated = await Product.findById(product._id);
    expect(updated.averageRating).toBe(3.5);
    expect(updated.reviewCount).toBe(2);
    expect(updated.reviewsUpdatedAt).toBeInstanceOf(Date);
  });

  it('allows only one review per user per product', async () => {
    const product = await createProduct();
    const { agent } = await loginAs(app);

    await agent.post(`/api/v1/products/${product._id}/reviews`).send(review(4)).expect(201);
    const duplicate = await agent.post(`/api/v1/products/${product._id}/reviews`).send(review(1));

    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('ALREADY_REVIEWED');
  });

  it('requires login and validates rating and comment', async () => {
    const product = await createProduct();
    expect(
      (await request(app).post(`/api/v1/products/${product._id}/reviews`).send(review(5))).status,
    ).toBe(401);

    const { agent } = await loginAs(app);
    const res = await agent
      .post(`/api/v1/products/${product._id}/reviews`)
      .send({ rating: 6, comment: 'meh' });
    expect(res.status).toBe(400);
  });

  it('lists reviews with pagination, rating filter, and reviewer names only', async () => {
    const product = await createProduct();
    for (const rating of [5, 4, 5]) {
      const { agent } = await loginAs(app);
      await agent.post(`/api/v1/products/${product._id}/reviews`).send(review(rating));
    }

    const page = await request(app).get(`/api/v1/products/${product._id}/reviews?limit=2`);
    expect(page.body.data).toHaveLength(2);
    expect(page.body.meta.total).toBe(3);
    expect(Object.keys(page.body.data[0].user)).toEqual(['_id', 'name']);

    const fives = await request(app).get(`/api/v1/products/${product._id}/reviews?rating=5`);
    expect(fives.body.meta.total).toBe(2);

    const detail = await request(app).get(`/api/v1/products/${product._id}`);
    expect(detail.body.data.ratingBreakdown).toEqual({ 1: 0, 2: 0, 3: 0, 4: 1, 5: 2 });
  });

  it('lets authors edit their review and recalculates', async () => {
    const product = await createProduct();
    const { agent } = await loginAs(app);
    const created = await agent.post(`/api/v1/products/${product._id}/reviews`).send(review(5));

    const res = await agent.patch(`/api/v1/reviews/${created.body.data._id}`).send({ rating: 3 });
    expect(res.status).toBe(200);
    expect((await Product.findById(product._id)).averageRating).toBe(3);
  });

  it('forbids editing or deleting other users reviews, but admins can moderate', async () => {
    const product = await createProduct();
    const author = await loginAs(app);
    const stranger = await loginAs(app);
    const admin = await loginAs(app, { role: 'admin' });
    const created = await author.agent
      .post(`/api/v1/products/${product._id}/reviews`)
      .send(review(4));
    const reviewId = created.body.data._id;

    expect(
      (await stranger.agent.patch(`/api/v1/reviews/${reviewId}`).send({ rating: 1 })).status,
    ).toBe(403);
    expect((await stranger.agent.delete(`/api/v1/reviews/${reviewId}`)).status).toBe(403);
    expect((await admin.agent.delete(`/api/v1/reviews/${reviewId}`)).status).toBe(200);

    const after = await Product.findById(product._id);
    expect(after).toMatchObject({ averageRating: 0, reviewCount: 0 });
  });

  it('returns 404 for reviews on unknown or inactive products', async () => {
    const inactive = await createProduct({ isActive: false });
    const { agent } = await loginAs(app);
    expect(
      (await agent.post(`/api/v1/products/${inactive._id}/reviews`).send(review(5))).status,
    ).toBe(404);
    expect((await request(app).get(`/api/v1/products/${'c'.repeat(24)}/reviews`)).status).toBe(404);
  });
});
