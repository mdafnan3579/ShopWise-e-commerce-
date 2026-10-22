import { describe, expect, it } from 'vitest';
import { Order } from '../../src/models/Order.js';
import { User } from '../../src/models/User.js';
import { bucketStart, listBuckets } from '../../src/services/analytics.service.js';
import { createProduct, createTestApp, createUser, loginAs } from '../helpers/index.js';

const app = createTestApp();

const address = { fullName: 'A B', line1: '1 St', city: 'X', postalCode: '123', country: 'US' };

function order(user, product, { quantity = 1, paidAt, createdAt = paidAt, ...overrides }) {
  const lineTotalCents = product.priceCents * quantity;
  return {
    user: user._id,
    items: [
      {
        product: product._id,
        name: product.name,
        priceCents: product.priceCents,
        quantity,
        lineTotalCents,
      },
    ],
    shippingAddress: address,
    subtotalCents: lineTotalCents,
    taxCents: 0,
    shippingCents: 0,
    totalCents: lineTotalCents,
    paymentStatus: 'paid',
    orderStatus: 'paid',
    paidAt,
    createdAt,
    ...overrides,
  };
}

describe('analytics bucketing', () => {
  it('truncates dates to UTC day / Monday week / month', () => {
    const date = new Date('2026-10-15T18:30:00Z'); // a Thursday
    expect(bucketStart(date, 'day').toISOString()).toBe('2026-10-15T00:00:00.000Z');
    expect(bucketStart(date, 'week').toISOString()).toBe('2026-10-12T00:00:00.000Z');
    expect(bucketStart(date, 'month').toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });

  it('lists every bucket in the range', () => {
    const buckets = listBuckets(
      new Date('2026-10-01T10:00Z'),
      new Date('2026-10-03T09:00Z'),
      'day',
    );
    expect(buckets).toEqual([
      '2026-10-01T00:00:00.000Z',
      '2026-10-02T00:00:00.000Z',
      '2026-10-03T00:00:00.000Z',
    ]);
  });
});

describe('GET /api/v1/admin/stats', () => {
  it('is admin-only', async () => {
    const { agent } = await loginAs(app);
    expect((await agent.get('/api/v1/admin/stats')).status).toBe(403);
  });

  it('reports revenue, order counts, top products, low stock and new customers', async () => {
    const { agent } = await loginAs(app, { role: 'admin' });
    const buyer = await createUser({ createdAt: new Date('2026-10-02T12:00Z') });
    await User.collection.updateOne(
      { _id: buyer._id },
      { $set: { createdAt: new Date('2026-10-02T12:00Z') } },
    );

    const headphones = await createProduct({ name: 'Headphones', priceCents: 10000, stock: 2 });
    const cable = await createProduct({ name: 'Cable', priceCents: 1000, stock: 50 });

    await Order.insertMany(
      [
        order(buyer, headphones, { paidAt: new Date('2026-10-01T10:00Z') }),
        order(buyer, cable, { quantity: 3, paidAt: new Date('2026-10-01T15:00Z') }),
        order(buyer, headphones, {
          quantity: 2,
          paidAt: new Date('2026-10-03T09:00Z'),
          orderStatus: 'shipped',
        }),
        // Not revenue: refunded and unpaid orders
        order(buyer, headphones, {
          paidAt: new Date('2026-10-02T09:00Z'),
          paymentStatus: 'refunded',
          orderStatus: 'cancelled',
        }),
        order(buyer, cable, {
          createdAt: new Date('2026-10-02T09:00Z'),
          paymentStatus: 'unpaid',
          orderStatus: 'pending',
        }),
        // Previous period (Sep 28–30)
        order(buyer, cable, { paidAt: new Date('2026-09-29T10:00Z') }),
      ],
      { timestamps: false },
    );

    const res = await agent.get(
      '/api/v1/admin/stats?from=2026-10-01T00:00:00Z&to=2026-10-03T23:59:59Z&granularity=day',
    );

    expect(res.status).toBe(200);
    const stats = res.body.data;
    expect(stats.totals).toEqual({
      revenueCents: 33000,
      orders: 3,
      unitsSold: 6,
      averageOrderValueCents: 11000,
      newCustomers: 1,
    });
    expect(stats.changeVsPreviousPeriod.revenuePercent).toBe(3200); // 33000 vs 1000
    expect(stats.revenueOverTime).toEqual([
      { period: '2026-10-01T00:00:00.000Z', revenueCents: 13000, orders: 2, newCustomers: 0 },
      { period: '2026-10-02T00:00:00.000Z', revenueCents: 0, orders: 0, newCustomers: 1 },
      { period: '2026-10-03T00:00:00.000Z', revenueCents: 20000, orders: 1, newCustomers: 0 },
    ]);
    expect(stats.topProducts[0]).toMatchObject({
      name: 'Headphones',
      unitsSold: 3,
      revenueCents: 30000,
    });
    expect(stats.ordersByStatus).toMatchObject({ paid: 2, shipped: 1, cancelled: 1, pending: 1 });
    expect(stats.lowStock.products.map((p) => p.name)).toEqual(['Headphones']);
  });

  it('defaults to the last 30 days and validates ranges', async () => {
    const { agent } = await loginAs(app, { role: 'admin' });

    const defaults = await agent.get('/api/v1/admin/stats');
    expect(defaults.body.data.revenueOverTime.length).toBeGreaterThanOrEqual(30);
    expect(defaults.body.data.range.granularity).toBe('day');

    const backwards = await agent.get('/api/v1/admin/stats?from=2026-10-05&to=2026-10-01');
    expect(backwards.status).toBe(400);

    const tooLong = await agent.get(
      '/api/v1/admin/stats?from=2020-01-01&to=2026-01-01&granularity=day',
    );
    expect(tooLong.status).toBe(400);

    const monthly = await agent.get(
      '/api/v1/admin/stats?from=2026-01-01&to=2026-06-30&granularity=month',
    );
    expect(monthly.body.data.revenueOverTime).toHaveLength(6);
  });
});
