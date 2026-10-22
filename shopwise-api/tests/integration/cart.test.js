import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { Coupon } from '../../src/models/Coupon.js';
import { computeDiscount } from '../../src/services/coupon.service.js';
import { calculateShipping, calculateTax } from '../../src/services/pricing.service.js';
import { createProduct, createTestApp, loginAs } from '../helpers/index.js';

const app = createTestApp();
const DAY = 24 * 60 * 60 * 1000;

describe('pricing math', () => {
  it('computes percent and fixed discounts, capped to the subtotal and max', () => {
    expect(computeDiscount({ discountType: 'percent', value: 10 }, 12345)).toBe(1235);
    expect(
      computeDiscount({ discountType: 'percent', value: 50, maxDiscountCents: 1000 }, 5000),
    ).toBe(1000);
    expect(computeDiscount({ discountType: 'fixed', value: 2000 }, 1500)).toBe(1500);
  });

  it('charges shipping below the free-shipping threshold and 8% tax', () => {
    expect(calculateShipping(0)).toBe(0);
    expect(calculateShipping(7499)).toBe(599);
    expect(calculateShipping(7500)).toBe(0);
    expect(calculateTax(10000)).toBe(800);
  });
});

describe('POST /api/v1/cart/validate', () => {
  it('prices the cart from the database and ignores client-supplied prices', async () => {
    const product = await createProduct({ priceCents: 2500, stock: 10 });

    const res = await request(app)
      .post('/api/v1/cart/validate')
      .send({ items: [{ productId: String(product._id), quantity: 2, priceCents: 1 }] });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      subtotalCents: 5000,
      discountCents: 0,
      shippingCents: 599,
      taxCents: 400,
      totalCents: 5999,
      issues: [],
    });
    expect(res.body.data.items[0]).toMatchObject({ priceCents: 2500, lineTotalCents: 5000 });
  });

  it('merges duplicate lines and reports stock and availability issues', async () => {
    const lowStock = await createProduct({ stock: 1 });
    const soldOut = await createProduct({ stock: 0 });
    const inactive = await createProduct({ isActive: false });

    const res = await request(app)
      .post('/api/v1/cart/validate')
      .send({
        items: [
          { productId: String(lowStock._id), quantity: 1 },
          { productId: String(lowStock._id), quantity: 2 },
          { productId: String(soldOut._id), quantity: 1 },
          { productId: String(inactive._id), quantity: 1 },
        ],
      });

    const codes = Object.fromEntries(res.body.data.issues.map((i) => [i.productId, i.code]));
    expect(codes).toEqual({
      [String(lowStock._id)]: 'INSUFFICIENT_STOCK',
      [String(soldOut._id)]: 'OUT_OF_STOCK',
      [String(inactive._id)]: 'UNAVAILABLE',
    });
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].quantity).toBe(3);
  });

  it('applies valid coupons and explains invalid ones', async () => {
    const product = await createProduct({ priceCents: 10000 });
    await Coupon.create([
      { code: 'SAVE20', discountType: 'fixed', value: 2000, minSubtotalCents: 5000 },
      { code: 'OLD', discountType: 'percent', value: 10, expiresAt: new Date(Date.now() - DAY) },
      { code: 'USEDUP', discountType: 'percent', value: 10, usageLimit: 1, timesUsed: 1 },
    ]);
    const items = [{ productId: String(product._id), quantity: 1 }];

    const ok = await request(app)
      .post('/api/v1/cart/validate')
      .send({ items, couponCode: 'save20' });
    expect(ok.body.data).toMatchObject({
      coupon: { code: 'SAVE20' },
      discountCents: 2000,
      shippingCents: 0, // $80 after discount is still above the $75 threshold
      taxCents: 640,
      totalCents: 8640,
    });

    for (const [code, expected] of [
      ['OLD', 'COUPON_EXPIRED'],
      ['USEDUP', 'COUPON_USAGE_LIMIT'],
      ['NOPE', 'INVALID_COUPON'],
    ]) {
      const res = await request(app)
        .post('/api/v1/cart/validate')
        .send({ items, couponCode: code });
      expect(res.body.data.couponError.code).toBe(expected);
      expect(res.body.data.discountCents).toBe(0);
    }
  });

  it('validates quantities', async () => {
    const product = await createProduct();
    const res = await request(app)
      .post('/api/v1/cart/validate')
      .send({ items: [{ productId: String(product._id), quantity: 0 }] });
    expect(res.status).toBe(400);
  });
});

describe('saved cart', () => {
  it('replaces, merges (summing quantities) and clears the cart', async () => {
    const { agent } = await loginAs(app);
    const a = await createProduct();
    const b = await createProduct();

    await agent
      .put('/api/v1/cart')
      .send({ items: [{ productId: String(a._id), quantity: 2 }] })
      .expect(200);

    const merged = await agent.post('/api/v1/cart/merge').send({
      items: [
        { productId: String(a._id), quantity: 1 },
        { productId: String(b._id), quantity: 1 },
      ],
    });
    expect(merged.body.data.items.map((i) => i.quantity)).toEqual([3, 1]);

    const fetched = await agent.get('/api/v1/cart');
    expect(fetched.body.data.items).toHaveLength(2);

    await agent.delete('/api/v1/cart').expect(200);
    expect((await agent.get('/api/v1/cart')).body.data.items).toHaveLength(0);
  });

  it('requires login', async () => {
    expect((await request(app).get('/api/v1/cart')).status).toBe(401);
  });
});

describe('coupons', () => {
  it('validates a coupon against a cart', async () => {
    const product = await createProduct({ priceCents: 5000 });
    await Coupon.create({ code: 'WELCOME10', discountType: 'percent', value: 10 });

    const res = await request(app)
      .post('/api/v1/coupons/validate')
      .send({ code: 'welcome10', items: [{ productId: String(product._id), quantity: 1 }] });
    expect(res.status).toBe(200);
    expect(res.body.data.discountCents).toBe(500);

    const bad = await request(app)
      .post('/api/v1/coupons/validate')
      .send({ code: 'NOPE', items: [{ productId: String(product._id), quantity: 1 }] });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('INVALID_COUPON');
  });

  it('rate limits coupon guessing', async () => {
    const limited = createTestApp({ coupon: 2 });
    const product = await createProduct();
    const attempt = (code) =>
      request(limited)
        .post('/api/v1/coupons/validate')
        .send({ code, items: [{ productId: String(product._id), quantity: 1 }] });

    expect((await attempt('GUESS1')).status).toBe(400);
    expect((await attempt('GUESS2')).status).toBe(400);
    expect((await attempt('GUESS3')).status).toBe(429);
  });

  it('lets admins manage coupons', async () => {
    const { agent } = await loginAs(app, { role: 'admin' });

    const created = await agent
      .post('/api/v1/admin/coupons')
      .send({ code: 'spring', discountType: 'percent', value: 15 });
    expect(created.status).toBe(201);
    expect(created.body.data.code).toBe('SPRING');

    const duplicate = await agent
      .post('/api/v1/admin/coupons')
      .send({ code: 'SPRING', discountType: 'fixed', value: 500 });
    expect(duplicate.status).toBe(409);

    const invalid = await agent
      .post('/api/v1/admin/coupons')
      .send({ code: 'HUGE', discountType: 'percent', value: 150 });
    expect(invalid.status).toBe(400);

    const id = created.body.data._id;
    const updated = await agent.patch(`/api/v1/admin/coupons/${id}`).send({ isActive: false });
    expect(updated.body.data.isActive).toBe(false);

    const list = await agent.get('/api/v1/admin/coupons?active=false');
    expect(list.body.meta.total).toBe(1);

    await agent.delete(`/api/v1/admin/coupons/${id}`).expect(200);
  });

  it('forbids customers from managing coupons', async () => {
    const { agent } = await loginAs(app);
    expect((await agent.get('/api/v1/admin/coupons')).status).toBe(403);
  });
});
