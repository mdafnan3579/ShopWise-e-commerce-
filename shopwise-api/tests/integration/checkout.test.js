import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getStripe } from '../../src/config/stripe.js';
import { Cart } from '../../src/models/Cart.js';
import { Coupon } from '../../src/models/Coupon.js';
import { Order } from '../../src/models/Order.js';
import { ProcessedWebhookEvent } from '../../src/models/ProcessedWebhookEvent.js';
import { Product } from '../../src/models/Product.js';
import * as emailService from '../../src/services/email.service.js';
import {
  checkoutEvent,
  createProduct,
  createTestApp,
  loginAs,
  postSignedWebhook,
} from '../helpers/index.js';

const app = createTestApp();
const stripe = getStripe();

const shippingAddress = {
  fullName: 'Ada Lovelace',
  line1: '12 St James Square',
  city: 'London',
  postalCode: 'SW1Y 4JH',
  country: 'GB',
};

let sessionCounter = 0;
beforeEach(() => {
  vi.spyOn(stripe.checkout.sessions, 'create').mockImplementation(async () => {
    sessionCounter += 1;
    const id = `cs_test_session${sessionCounter}`;
    return { id, url: `https://checkout.stripe.com/c/pay/${id}` };
  });
  vi.spyOn(stripe.coupons, 'create').mockResolvedValue({ id: 'stripe_coupon_1' });
  vi.spyOn(emailService, 'sendOrderConfirmation');
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function startCheckout(agent, items, extra = {}) {
  return agent.post('/api/v1/checkout/session').send({ items, shippingAddress, ...extra });
}

describe('POST /api/v1/checkout/session', () => {
  it('creates a pending order with server-side prices and a Stripe session', async () => {
    const { agent, user } = await loginAs(app);
    const product = await createProduct({ priceCents: 4000, stock: 5 });

    const res = await startCheckout(agent, [{ productId: String(product._id), quantity: 2 }]);

    expect(res.status).toBe(201);
    expect(res.body.data.url).toMatch(/^https:\/\/checkout\.stripe\.com/);

    const order = await Order.findById(res.body.data.orderId);
    expect(order).toMatchObject({
      orderStatus: 'pending',
      paymentStatus: 'unpaid',
      subtotalCents: 8000,
      shippingCents: 0,
      taxCents: 640,
      totalCents: 8640,
      stripeSessionId: res.body.data.sessionId,
    });
    expect(String(order.user)).toBe(String(user._id));

    // Stock is NOT touched until the webhook confirms payment.
    expect((await Product.findById(product._id)).stock).toBe(5);

    const params = stripe.checkout.sessions.create.mock.calls[0][0];
    const options = stripe.checkout.sessions.create.mock.calls[0][1];
    expect(params).toMatchObject({ mode: 'payment', client_reference_id: String(order._id) });
    expect(params).not.toHaveProperty('payment_method_types');
    expect(params.line_items[0].price_data.unit_amount).toBe(4000);
    expect(options.idempotencyKey).toBe(`checkout-${order._id}`);
  });

  it('applies coupons through a one-off Stripe coupon', async () => {
    const { agent } = await loginAs(app);
    const product = await createProduct({ priceCents: 10000 });
    await Coupon.create({ code: 'SAVE20', discountType: 'fixed', value: 2000 });

    const res = await startCheckout(agent, [{ productId: String(product._id), quantity: 1 }], {
      couponCode: 'SAVE20',
    });

    expect(res.status).toBe(201);
    expect(stripe.coupons.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount_off: 2000, duration: 'once' }),
      expect.anything(),
    );
    const order = await Order.findById(res.body.data.orderId);
    expect(order.coupon.code).toBe('SAVE20');
    expect(order.discountCents).toBe(2000);
  });

  it('uses a saved address by id', async () => {
    const { agent } = await loginAs(app);
    const product = await createProduct();
    const saved = await agent.post('/api/v1/users/me/addresses').send(shippingAddress);
    const addressId = saved.body.data.addresses[0]._id;

    const res = await agent
      .post('/api/v1/checkout/session')
      .send({ items: [{ productId: String(product._id), quantity: 1 }], addressId });
    expect(res.status).toBe(201);
    expect((await Order.findById(res.body.data.orderId)).shippingAddress.city).toBe('London');
  });

  it('refuses carts with stock issues or invalid coupons', async () => {
    const { agent } = await loginAs(app);
    const product = await createProduct({ stock: 1 });

    const stockIssue = await startCheckout(agent, [
      { productId: String(product._id), quantity: 3 },
    ]);
    expect(stockIssue.status).toBe(409);
    expect(stockIssue.body.error.code).toBe('CART_ISSUES');
    expect(stockIssue.body.error.details[0].code).toBe('INSUFFICIENT_STOCK');

    const badCoupon = await startCheckout(
      agent,
      [{ productId: String(product._id), quantity: 1 }],
      {
        couponCode: 'NOPE',
      },
    );
    expect(badCoupon.status).toBe(400);
    expect(badCoupon.body.error.code).toBe('INVALID_COUPON');
    expect(await Order.countDocuments()).toBe(0);
  });

  it('cancels the order and returns 502 when Stripe fails', async () => {
    stripe.checkout.sessions.create.mockRejectedValueOnce(new Error('Stripe is down'));
    const { agent } = await loginAs(app);
    const product = await createProduct();

    const res = await startCheckout(agent, [{ productId: String(product._id), quantity: 1 }]);

    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('PAYMENT_PROVIDER_ERROR');
    expect((await Order.findOne()).orderStatus).toBe('cancelled');
  });

  it('requires login and an address', async () => {
    const { agent } = await loginAs(app);
    const product = await createProduct();
    const res = await agent
      .post('/api/v1/checkout/session')
      .send({ items: [{ productId: String(product._id), quantity: 1 }] });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/v1/webhooks/stripe', () => {
  async function createPendingOrder({ quantity = 2, stock = 5 } = {}) {
    const { agent, user } = await loginAs(app);
    const product = await createProduct({ priceCents: 3000, stock });
    const res = await startCheckout(agent, [{ productId: String(product._id), quantity }]);
    const order = await Order.findById(res.body.data.orderId);
    await Cart.create({ user: user._id, items: [{ product: product._id, quantity }] });
    return { agent, user, product, order };
  }

  it('rejects requests with a missing or invalid signature', async () => {
    const { order } = await createPendingOrder();
    const event = checkoutEvent('checkout.session.completed', order);

    const forged = await postSignedWebhook(app, event, { secret: 'whsec_attacker' });
    expect(forged.status).toBe(400);
    expect(forged.body.error.code).toBe('INVALID_SIGNATURE');

    expect((await Order.findById(order._id)).paymentStatus).toBe('unpaid');
  });

  it('marks the order paid, decrements stock, clears the cart and emails the customer', async () => {
    const { order, product, user } = await createPendingOrder({ quantity: 2, stock: 5 });

    const res = await postSignedWebhook(app, checkoutEvent('checkout.session.completed', order));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ received: true, fulfilled: true, duplicate: false });

    const paid = await Order.findById(order._id);
    expect(paid).toMatchObject({ paymentStatus: 'paid', orderStatus: 'paid' });
    expect(paid.stripePaymentIntentId).toBe('pi_test_123');
    expect(paid.needsAttention).toBeUndefined();
    expect((await Product.findById(product._id)).stock).toBe(3);
    expect((await Cart.findOne({ user: user._id })).items).toHaveLength(0);
    expect(emailService.sendOrderConfirmation).toHaveBeenCalledTimes(1);
  });

  it('is idempotent: duplicate deliveries do not decrement stock twice', async () => {
    const { order, product } = await createPendingOrder({ quantity: 2, stock: 5 });
    const event = checkoutEvent('checkout.session.completed', order);

    const first = await postSignedWebhook(app, event);
    const second = await postSignedWebhook(app, event);
    // A different event for the same payment (async success after completed).
    const third = await postSignedWebhook(
      app,
      checkoutEvent('checkout.session.async_payment_succeeded', order),
    );

    expect(first.body.duplicate).toBe(false);
    expect(second.body.duplicate).toBe(true);
    expect(third.body.fulfilled).toBe(false);
    expect((await Product.findById(product._id)).stock).toBe(3);
    expect(await ProcessedWebhookEvent.countDocuments()).toBe(2);
    expect(emailService.sendOrderConfirmation).toHaveBeenCalledTimes(1);
  });

  it('handles concurrent duplicate deliveries safely', async () => {
    const { order, product } = await createPendingOrder({ quantity: 1, stock: 5 });
    const event = checkoutEvent('checkout.session.completed', order);

    const results = await Promise.all([1, 2, 3].map(() => postSignedWebhook(app, event)));

    expect(results.every((r) => r.status === 200)).toBe(true);
    expect((await Product.findById(product._id)).stock).toBe(4);
  });

  it('waits for asynchronous payments before fulfilling', async () => {
    const { order, product } = await createPendingOrder();

    const pending = await postSignedWebhook(
      app,
      checkoutEvent('checkout.session.completed', order, { payment_status: 'unpaid' }),
    );
    expect(pending.body.handled).toBe(false);
    expect((await Order.findById(order._id)).paymentStatus).toBe('unpaid');

    await postSignedWebhook(app, checkoutEvent('checkout.session.async_payment_succeeded', order));
    expect((await Order.findById(order._id)).paymentStatus).toBe('paid');
    expect((await Product.findById(product._id)).stock).toBe(3);
  });

  it('never oversells: flags the order when stock ran out before payment', async () => {
    const { order, product } = await createPendingOrder({ quantity: 2, stock: 5 });
    await Product.updateOne({ _id: product._id }, { stock: 1 });

    await postSignedWebhook(app, checkoutEvent('checkout.session.completed', order));

    const paid = await Order.findById(order._id);
    expect(paid.paymentStatus).toBe('paid');
    expect(paid.needsAttention.reason).toContain('INSUFFICIENT_STOCK');
    expect((await Product.findById(product._id)).stock).toBe(1);
  });

  it('increments coupon usage on payment', async () => {
    const { agent } = await loginAs(app);
    const product = await createProduct({ priceCents: 10000 });
    await Coupon.create({ code: 'SAVE20', discountType: 'fixed', value: 2000 });
    const res = await startCheckout(agent, [{ productId: String(product._id), quantity: 1 }], {
      couponCode: 'SAVE20',
    });
    const order = await Order.findById(res.body.data.orderId);

    await postSignedWebhook(app, checkoutEvent('checkout.session.completed', order));
    expect((await Coupon.findOne({ code: 'SAVE20' })).timesUsed).toBe(1);
  });

  it('cancels the order when the session expires or async payment fails', async () => {
    const expired = await createPendingOrder();
    await postSignedWebhook(app, checkoutEvent('checkout.session.expired', expired.order));
    expect((await Order.findById(expired.order._id)).orderStatus).toBe('cancelled');

    const failed = await createPendingOrder();
    await postSignedWebhook(
      app,
      checkoutEvent('checkout.session.async_payment_failed', failed.order),
    );
    expect(await Order.findById(failed.order._id)).toMatchObject({
      orderStatus: 'cancelled',
      paymentStatus: 'failed',
    });
  });

  it('acknowledges unrelated event types', async () => {
    const res = await postSignedWebhook(app, {
      id: 'evt_other',
      type: 'customer.created',
      data: { object: {} },
    });
    expect(res.status).toBe(200);
    expect(res.body.handled).toBe(false);
  });
});
