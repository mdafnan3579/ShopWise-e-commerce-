import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { Order } from '../../src/models/Order.js';
import { SupportTicket } from '../../src/models/SupportTicket.js';
import { fakeAnthropic, textResponse, toolUseResponse } from '../helpers/fakeAnthropic.js';
import { createProduct, createTestApp, createUser, loginAs } from '../helpers/index.js';
import { sse, textOf } from '../helpers/sse.js';

const app = createTestApp();

afterEach(() => {
  expect(fakeAnthropic.pending()).toBe(0); // every scripted response was consumed
});

/** The JSON of the last tool_result the assistant loop sent back to the model. */
const lastToolResult = (params) => JSON.parse(params.messages.at(-1).content[0].content);

async function makeOrder(user, overrides = {}) {
  const product = await createProduct({ name: 'Velocity Jump Rope' });
  return Order.create({
    user: user._id,
    items: [
      {
        product: product._id,
        name: product.name,
        priceCents: 2599,
        quantity: 1,
        lineTotalCents: 2599,
      },
    ],
    shippingAddress: {
      fullName: 'Ada Lovelace',
      line1: '1 Main St',
      city: 'Leeds',
      postalCode: 'LS1 1AA',
      country: 'GB',
    },
    subtotalCents: 2599,
    taxCents: 0,
    shippingCents: 0,
    totalCents: 2599,
    ...overrides,
  });
}

describe('POST /api/v1/ai/chat (customer support tools)', () => {
  it('answers policy questions from the store config', async () => {
    fakeAnthropic.enqueue(
      toolUseResponse([{ name: 'get_store_policy', input: { topic: 'shipping' } }]),
      (params) => {
        expect(lastToolResult(params).policy).toMatch(/\$75\.00 or more.*\$5\.99/);
        return textResponse('Shipping is free over $75.');
      },
    );
    const res = await sse(request(app).post('/api/v1/ai/chat').send({ message: 'Shipping?' }));
    expect(textOf(res.body)).toBe('Shipping is free over $75.');
  });

  it("only shows the signed-in customer's own orders", async () => {
    const { agent, user } = await loginAs(app);
    const mine = await makeOrder(user, {
      orderStatus: 'shipped',
      paymentStatus: 'paid',
      statusHistory: [{ status: 'shipped', note: 'UPS 1Z999' }],
    });
    const theirs = await makeOrder(await createUser());

    fakeAnthropic.enqueue(
      toolUseResponse([{ name: 'list_my_orders', input: {} }]),
      (params) => {
        const { orders } = lastToolResult(params);
        expect(orders.map((o) => o.orderNumber)).toEqual([mine.orderNumber]);
        expect(orders[0]).toMatchObject({ status: 'shipped', total: '$25.99' });
        expect(orders[0].items).toEqual(['1 × Velocity Jump Rope']);
        return toolUseResponse([
          { name: 'get_order_details', input: { orderNumber: theirs.orderNumber } },
        ]);
      },
      (params) => {
        expect(lastToolResult(params).error).toMatch(/No order/);
        return toolUseResponse([
          { name: 'get_order_details', input: { orderNumber: mine.orderNumber.toLowerCase() } },
        ]);
      },
      (params) => {
        const details = lastToolResult(params);
        expect(details.updates[0]).toMatch(/shipped: UPS 1Z999$/);
        expect(details).not.toHaveProperty('shippingAddress');
        return textResponse('Your order shipped with UPS.');
      },
    );

    const res = await sse(agent.post('/api/v1/ai/chat').send({ message: 'Where is my order?' }));
    expect(textOf(res.body)).toBe('Your order shipped with UPS.');
  });

  it('asks guests to sign in instead of reading orders', async () => {
    fakeAnthropic.enqueue(toolUseResponse([{ name: 'list_my_orders', input: {} }]), (params) => {
      expect(lastToolResult(params).error).toMatch(/not signed in/);
      return textResponse('Please sign in first.');
    });
    const res = await sse(request(app).post('/api/v1/ai/chat').send({ message: 'My orders?' }));
    expect(textOf(res.body)).toBe('Please sign in first.');
  });

  it('offers a confirm button for a pending order but never cancels it itself', async () => {
    const { agent, user } = await loginAs(app);
    const order = await makeOrder(user);
    fakeAnthropic.enqueue(
      toolUseResponse([
        { name: 'request_order_cancellation', input: { orderNumber: order.orderNumber } },
      ]),
      (params) => {
        expect(lastToolResult(params)).toMatchObject({ cancellable: true, buttonShown: true });
        return textResponse('Click the button below to confirm.');
      },
    );

    const res = await sse(agent.post('/api/v1/ai/chat').send({ message: 'Cancel my order' }));
    const action = res.body.find((e) => e.event === 'action');
    expect(action.data).toEqual({
      type: 'cancel_order',
      orderId: String(order._id),
      orderNumber: order.orderNumber,
      totalCents: 2599,
    });
    expect(res.body.at(-1).event).toBe('done');
    expect((await Order.findById(order._id)).orderStatus).toBe('pending');

    // The customer's click goes through the normal, authenticated cancel endpoint.
    await agent.post(`/api/v1/orders/${order._id}/cancel`).expect(200);
    expect((await Order.findById(order._id)).orderStatus).toBe('cancelled');
  });

  it('does not offer cancellation for paid orders', async () => {
    const { agent, user } = await loginAs(app);
    const order = await makeOrder(user, { orderStatus: 'paid', paymentStatus: 'paid' });
    fakeAnthropic.enqueue(
      toolUseResponse([
        { name: 'request_order_cancellation', input: { orderNumber: order.orderNumber } },
      ]),
      (params) => {
        expect(lastToolResult(params)).toMatchObject({ cancellable: false });
        return textResponse('That order is already paid, so I will hand it to the team.');
      },
    );
    const res = await sse(agent.post('/api/v1/ai/chat').send({ message: 'Cancel it' }));
    expect(res.body.some((e) => e.event === 'action')).toBe(false);
  });

  it('creates support tickets for the human team, with a daily limit', async () => {
    const { agent, user } = await loginAs(app);
    const order = await makeOrder(user, { orderStatus: 'delivered', paymentStatus: 'paid' });
    const input = {
      category: 'damaged_or_wrong_item',
      priority: 'high',
      orderNumber: order.orderNumber,
      summary: 'Jump rope arrived with a broken handle; customer wants a replacement.',
    };
    fakeAnthropic.enqueue(toolUseResponse([{ name: 'create_support_ticket', input }]), (params) => {
      expect(lastToolResult(params).ticketNumber).toMatch(/^SUP-[0-9A-F]{8}$/);
      return textResponse('Ticket created.');
    });
    await sse(agent.post('/api/v1/ai/chat').send({ message: 'It arrived broken!' }));

    const [ticket] = await SupportTicket.find({ user: user._id }).lean();
    expect(ticket).toMatchObject({
      category: 'damaged_or_wrong_item',
      priority: 'high',
      status: 'open',
      orderNumber: order.orderNumber,
    });
    expect(String(ticket.order)).toBe(String(order._id));

    // Four more today reaches the limit of five; the next attempt is refused.
    await SupportTicket.create(
      Array.from({ length: 4 }, () => ({
        user: user._id,
        category: 'other',
        summary: 'Earlier question.',
      })),
    );
    fakeAnthropic.enqueue(toolUseResponse([{ name: 'create_support_ticket', input }]), (params) => {
      const result = params.messages.at(-1).content[0];
      expect(result.is_error).toBe(true);
      expect(JSON.parse(result.content).code).toBe('TICKET_LIMIT_REACHED');
      return textResponse('The team already has your requests.');
    });
    await sse(agent.post('/api/v1/ai/chat').send({ message: 'Another ticket' }));
    expect(await SupportTicket.countDocuments({ user: user._id })).toBe(5);
  });
});

describe('admin support tickets', () => {
  it('lets admins list, filter and resolve tickets; customers are forbidden', async () => {
    const customer = await createUser({ name: 'Ada Lovelace' });
    const [open] = await SupportTicket.create([
      { user: customer._id, category: 'refund', priority: 'high', summary: 'Wants a refund.' },
      { user: customer._id, category: 'other', summary: 'Old question.', status: 'resolved' },
    ]);
    const { agent: admin } = await loginAs(app, { role: 'admin' });

    const list = await admin.get('/api/v1/admin/support-tickets?status=open').expect(200);
    expect(list.body.data.map((t) => t.ticketNumber)).toEqual([open.ticketNumber]);
    expect(list.body.data[0].user).toMatchObject({ name: 'Ada Lovelace' });
    expect(list.body.meta.total).toBe(1);

    const resolved = await admin
      .patch(`/api/v1/admin/support-tickets/${open._id}/status`)
      .send({ status: 'resolved' })
      .expect(200);
    expect(resolved.body.data.status).toBe('resolved');
    expect(resolved.body.data.resolvedAt).toBeTruthy();

    const { agent: shopper } = await loginAs(app);
    await shopper.get('/api/v1/admin/support-tickets').expect(403);
  });
});
