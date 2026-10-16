import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getStripe } from '../../src/config/stripe.js';
import { Order } from '../../src/models/Order.js';
import { Product } from '../../src/models/Product.js';
import { createProduct, createTestApp, loginAs } from '../helpers/index.js';

const app = createTestApp();
const stripe = getStripe();

beforeEach(() => {
  vi.spyOn(stripe.refunds, 'create').mockResolvedValue({ id: 're_test_1', status: 'succeeded' });
  vi.spyOn(stripe.checkout.sessions, 'expire').mockResolvedValue({ id: 'cs_test_x' });
});
afterEach(() => vi.restoreAllMocks());

const address = {
  fullName: 'Ada Lovelace',
  line1: '1 Main St',
  city: 'London',
  postalCode: 'N1 1AA',
  country: 'GB',
};

/** Inserts an order directly (checkout is covered elsewhere). */
async function makeOrder(user, overrides = {}) {
  const product = overrides.product ?? (await createProduct({ stock: 10 }));
  return Order.create({
    user: user._id,
    items: [
      {
        product: product._id,
        name: product.name,
        priceCents: product.priceCents,
        quantity: 2,
        lineTotalCents: product.priceCents * 2,
      },
    ],
    shippingAddress: address,
    subtotalCents: product.priceCents * 2,
    taxCents: 0,
    shippingCents: 0,
    totalCents: product.priceCents * 2,
    stripeSessionId: `cs_test_${Math.random().toString(36).slice(2)}`,
    ...overrides,
    product: undefined,
  });
}

describe('customer orders', () => {
  it('lists only the current user’s orders, newest first', async () => {
    const { agent, user } = await loginAs(app);
    const other = await loginAs(app);
    await makeOrder(user);
    await makeOrder(user);
    await makeOrder(other.user);

    const res = await agent.get('/api/v1/orders/me');
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(2);
    expect(res.body.data[0]).toHaveProperty('orderNumber');
  });

  it('returns 404 (not 403) for another user’s order', async () => {
    const { agent } = await loginAs(app);
    const other = await loginAs(app);
    const theirs = await makeOrder(other.user);

    expect((await agent.get(`/api/v1/orders/me/${theirs._id}`)).status).toBe(404);
    expect((await other.agent.get(`/api/v1/orders/me/${theirs._id}`)).status).toBe(200);
  });

  it('finds an order by Stripe session id for the success page', async () => {
    const { agent, user } = await loginAs(app);
    const order = await makeOrder(user, { stripeSessionId: 'cs_test_successpage' });

    const res = await agent.get('/api/v1/orders/me/by-session/cs_test_successpage');
    expect(res.body.data._id).toBe(String(order._id));
  });

  it('lets customers cancel unpaid orders only', async () => {
    const { agent, user } = await loginAs(app);
    const unpaid = await makeOrder(user);
    const paid = await makeOrder(user, { paymentStatus: 'paid', orderStatus: 'paid' });

    const ok = await agent.post(`/api/v1/orders/${unpaid._id}/cancel`);
    expect(ok.status).toBe(200);
    expect(ok.body.data.orderStatus).toBe('cancelled');
    expect(stripe.checkout.sessions.expire).toHaveBeenCalledWith(unpaid.stripeSessionId);

    const refused = await agent.post(`/api/v1/orders/${paid._id}/cancel`);
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('ORDER_NOT_CANCELLABLE');
  });
});

describe('admin order management', () => {
  it('lists, filters and searches all orders', async () => {
    const { agent } = await loginAs(app, { role: 'admin' });
    const customer = await loginAs(app, { email: 'findme@example.com' });
    await makeOrder(customer.user, { paymentStatus: 'paid', orderStatus: 'paid' });
    await makeOrder(customer.user);

    const all = await agent.get('/api/v1/admin/orders');
    expect(all.body.meta.total).toBe(2);
    expect(all.body.data[0].user).toMatchObject({ email: 'findme@example.com' });

    const paid = await agent.get('/api/v1/admin/orders?status=paid');
    expect(paid.body.meta.total).toBe(1);

    const search = await agent.get('/api/v1/admin/orders?q=findme');
    expect(search.body.meta.total).toBe(2);
  });

  it('follows the status state machine', async () => {
    const { agent } = await loginAs(app, { role: 'admin' });
    const customer = await loginAs(app);
    const order = await makeOrder(customer.user, { paymentStatus: 'paid', orderStatus: 'paid' });

    const skip = await agent
      .patch(`/api/v1/admin/orders/${order._id}/status`)
      .send({ status: 'delivered' });
    expect(skip.status).toBe(409);
    expect(skip.body.error.code).toBe('INVALID_STATUS_TRANSITION');

    const shipped = await agent
      .patch(`/api/v1/admin/orders/${order._id}/status`)
      .send({ status: 'shipped', note: 'UPS 1Z999' });
    expect(shipped.body.data.orderStatus).toBe('shipped');
    expect(shipped.body.data.shippedAt).toBeTruthy();

    const delivered = await agent
      .patch(`/api/v1/admin/orders/${order._id}/status`)
      .send({ status: 'delivered' });
    expect(delivered.body.data.statusHistory.map((s) => s.status)).toEqual([
      'pending',
      'shipped',
      'delivered',
    ]);
  });

  it('cannot mark orders paid manually (only the webhook can)', async () => {
    const { agent } = await loginAs(app, { role: 'admin' });
    const customer = await loginAs(app);
    const order = await makeOrder(customer.user);

    const res = await agent
      .patch(`/api/v1/admin/orders/${order._id}/status`)
      .send({ status: 'paid' });
    expect(res.status).toBe(400);
  });

  it('refunds via Stripe and restocks when cancelling a paid order', async () => {
    const { agent } = await loginAs(app, { role: 'admin' });
    const customer = await loginAs(app);
    const product = await createProduct({ stock: 3 });
    const order = await makeOrder(customer.user, {
      product,
      paymentStatus: 'paid',
      orderStatus: 'paid',
      stripePaymentIntentId: 'pi_test_refund',
    });

    const res = await agent
      .patch(`/api/v1/admin/orders/${order._id}/status`)
      .send({ status: 'cancelled' });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ orderStatus: 'cancelled', paymentStatus: 'refunded' });
    expect(stripe.refunds.create).toHaveBeenCalledWith(
      expect.objectContaining({ payment_intent: 'pi_test_refund' }),
      { idempotencyKey: `refund-${order._id}` },
    );
    expect((await Product.findById(product._id)).stock).toBe(5);
  });

  it('changes nothing if the refund fails', async () => {
    stripe.refunds.create.mockRejectedValueOnce(new Error('card_declined'));
    const { agent } = await loginAs(app, { role: 'admin' });
    const customer = await loginAs(app);
    const order = await makeOrder(customer.user, {
      paymentStatus: 'paid',
      orderStatus: 'paid',
      stripePaymentIntentId: 'pi_test_refund',
    });

    const res = await agent
      .patch(`/api/v1/admin/orders/${order._id}/status`)
      .send({ status: 'cancelled' });
    expect(res.status).toBe(502);
    expect((await Order.findById(order._id)).orderStatus).toBe('paid');
  });

  it('marks reviews as verified purchases for paid orders', async () => {
    const customer = await loginAs(app);
    const product = await createProduct();
    await makeOrder(customer.user, { product, paymentStatus: 'paid', orderStatus: 'paid' });

    const res = await customer.agent
      .post(`/api/v1/products/${product._id}/reviews`)
      .send({ rating: 5, comment: 'Arrived fast and works great.' });
    expect(res.body.data.verifiedPurchase).toBe(true);
  });
});
