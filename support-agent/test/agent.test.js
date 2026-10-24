// Tests for the agent, with NO real Claude calls (free, fast, and they work without credits).
// Run: npm test
//
// The trick: `fakeClaude` pretends to be the Anthropic client and replays replies we script,
// e.g. "first ask for get_store_policy, then answer". That lets us check OUR code: the loop,
// the tools, the approval gate and the tickets. (Claude's own answers are tested by trying the agent.)

import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { runAgentTurn } from '../lib/agent.js';
import { ShopWiseClient } from '../lib/shopwise.js';
import { cancelOrderTool, orderTools, policyTool, supportTicketTool } from '../lib/tools.js';

// ── Helpers ────────────────────────────────────────────────────────────────────────────────

/** A pretend Claude client that returns the scripted replies in order and records every request. */
function fakeClaude(...replies) {
  const requests = [];
  const create = async (params) => {
    requests.push(structuredClone(params));
    const reply = replies.shift();
    if (!reply) throw new Error('fakeClaude: no scripted reply left');
    return reply;
  };
  return { requests, messages: { create }, beta: { messages: { create } } };
}

const usage = { input_tokens: 10, output_tokens: 5 };
const answer = (text) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text }], usage });
const askTools = (...calls) => ({
  stop_reason: 'tool_use',
  content: calls.map(([name, input], i) => ({ type: 'tool_use', id: `toolu_${name}_${i}`, name, input })),
  usage,
});

const turn = (client, tools, text) =>
  runAgentTurn({
    client,
    model: 'claude-opus-5-5',
    system: 'test',
    tools,
    messages: [{ role: 'user', content: text }],
  });

/** A pretend ShopWise backend with two orders, so order tools can be tested offline. */
function fakeShopwise() {
  const orders = {
    'SW-PENDING-1': {
      orderNumber: 'SW-PENDING-1', orderStatus: 'pending', paymentStatus: 'unpaid', totalCents: 2599,
      createdAt: '2026-10-20T10:00:00Z', items: [{ name: 'Velocity Jump Rope', quantity: 1 }], statusHistory: [],
    },
    'SW-SHIPPED-2': {
      orderNumber: 'SW-SHIPPED-2', orderStatus: 'shipped', paymentStatus: 'paid', totalCents: 19999,
      createdAt: '2026-10-10T10:00:00Z', shippedAt: '2026-10-12T10:00:00Z',
      items: [{ name: 'Aurora ANC Wireless Headphones', quantity: 1 }],
      statusHistory: [{ status: 'shipped', at: '2026-10-12T10:00:00Z', note: 'UPS 1Z999' }],
    },
  };
  const cancelled = [];
  return {
    cancelled,
    listMyOrders: async () => Object.values(orders),
    getOrder: async (number) => {
      if (!orders[number]) throw new Error(`No order ${number} found on this customer's account`);
      return orders[number];
    },
    cancelOrder: async (number) => {
      cancelled.push(number);
      return { ...orders[number], orderStatus: 'cancelled' };
    },
  };
}

// ── The loop ───────────────────────────────────────────────────────────────────────────────

test('runs a tool Claude asks for, sends the result back, and returns the final answer', async () => {
  const client = fakeClaude(askTools(['get_store_policy', { topic: 'returns' }]), answer('Yes, within 30 days.'));

  const reply = await turn(client, [policyTool], 'Can I return shoes?');

  assert.equal(reply, 'Yes, within 30 days.');
  // The second request must contain our tool result, linked to Claude's tool_use id.
  const lastMessage = client.requests[1].messages.at(-1);
  assert.equal(lastMessage.role, 'user');
  assert.equal(lastMessage.content[0].tool_use_id, 'toolu_get_store_policy_0');
  assert.match(lastMessage.content[0].content, /30 days/);
});

test('turns on the refusal fallback for claude-opus-5-5', async () => {
  const client = fakeClaude(answer('Hi!'));
  await turn(client, [policyTool], 'Hello');
  assert.deepEqual(client.requests[0].betas, ['server-side-fallback-2026-07-01']);
  assert.equal(client.requests[0].fallbacks, 'default');
});

test('answers several tool calls from one reply in ONE message', async () => {
  const client = fakeClaude(
    askTools(['get_store_policy', { topic: 'shipping' }], ['get_store_policy', { topic: 'cancellations' }]),
    answer('Done'),
  );
  await turn(client, [policyTool], 'Shipping cost and can I cancel?');

  const results = client.requests[1].messages.at(-1).content;
  assert.equal(results.length, 2);
  assert.match(results[0].content, /\$5\.99/);
  assert.match(results[1].content, /pending and unpaid/);
});

test('a failing or unknown tool is reported to Claude as an error instead of crashing', async () => {
  const client = fakeClaude(askTools(['delete_everything', {}]), answer('Sorry, I cannot do that.'));
  const reply = await turn(client, [policyTool], 'Delete everything');

  const result = client.requests[1].messages.at(-1).content[0];
  assert.equal(result.is_error, true);
  assert.match(result.content, /Unknown tool/);
  assert.equal(reply, 'Sorry, I cannot do that.');
});

test('handles refusals, cut-off replies and endless tool loops', async () => {
  assert.match(await turn(fakeClaude({ stop_reason: 'refusal', content: [], usage }), [], 'x'), /can't help/);

  const cutOff = { stop_reason: 'max_tokens', content: [{ type: 'text', text: 'Part one' }], usage };
  assert.match(await turn(fakeClaude(cutOff), [], 'x'), /Part one[\s\S]*cut off/);

  const loopy = Array.from({ length: 8 }, () => askTools(['get_store_policy', { topic: 'contact' }]));
  assert.match(await turn(fakeClaude(...loopy), [policyTool], 'x'), /couldn't finish/);
});

// ── Order tools, approval gate and tickets ─────────────────────────────────────────────────

test('order tools return a short summary with dollars and tracking notes', async () => {
  const [listTool, detailsTool] = orderTools(fakeShopwise());
  const details = JSON.parse(await detailsTool.run({ order_number: 'SW-SHIPPED-2' }));
  assert.equal(details.total, '$199.99');
  assert.deepEqual(details.updates, ['2026-10-12 shipped: UPS 1Z999']);
  assert.equal(JSON.parse(await listTool.run({ status: 'any' })).length, 2);
});

test('cancel_order does nothing unless the customer confirms', async () => {
  const shopwise = fakeShopwise();
  const declined = await cancelOrderTool(shopwise, async () => false).run({ order_number: 'SW-PENDING-1' });
  assert.match(declined, /declined/);
  assert.deepEqual(shopwise.cancelled, []);

  const approved = await cancelOrderTool(shopwise, async () => true).run({ order_number: 'SW-PENDING-1' });
  assert.match(approved, /now cancelled/);
  assert.deepEqual(shopwise.cancelled, ['SW-PENDING-1']);
});

test('cancel_order refuses paid/shipped orders without even asking', async () => {
  let asked = false;
  const shopwise = fakeShopwise();
  const result = await cancelOrderTool(shopwise, async () => (asked = true)).run({ order_number: 'SW-SHIPPED-2' });
  assert.match(result, /Not cancelled/);
  assert.equal(asked, false);
  assert.deepEqual(shopwise.cancelled, []);
});

test('create_support_ticket saves a ticket a human can read', async () => {
  const file = path.join(await mkdtemp(path.join(tmpdir(), 'tickets-')), 'tickets.json');
  const tool = supportTicketTool({ file, customer: { name: 'Demo Customer', email: 'demo@shopwise.dev' } });

  const result = await tool.run({
    category: 'damaged_or_wrong_item', priority: 'high', order_number: 'SW-SHIPPED-2',
    summary: 'Headphones arrived with a cracked headband; customer wants a replacement.',
  });

  const [ticket] = JSON.parse(await readFile(file, 'utf8'));
  assert.match(result, new RegExp(ticket.id));
  assert.equal(ticket.orderNumber, 'SW-SHIPPED-2');
  assert.equal(ticket.customer.email, 'demo@shopwise.dev');
  assert.equal(ticket.status, 'open');
});

// ── The real ShopWise backend (skipped when it isn't running) ──────────────────────────────

const backendUp = await fetch('http://localhost:5000/api/v1/health').then((r) => r.ok, () => false);

test('logs in to the real ShopWise backend and reads the demo customer\'s orders', { skip: !backendUp && 'ShopWise backend not running' }, async () => {
  const shopwise = new ShopWiseClient({ email: 'demo@shopwise.dev', password: 'Demo@12345' });
  const customer = await shopwise.login();
  assert.equal(customer.email, 'demo@shopwise.dev');

  const [listTool, detailsTool] = orderTools(shopwise);
  const orders = JSON.parse(await listTool.run({ status: 'any' }));
  assert.ok(orders.length > 0, 'the demo customer should have seeded orders');
  const details = JSON.parse(await detailsTool.run({ order_number: orders[0].orderNumber }));
  assert.equal(details.orderNumber, orders[0].orderNumber);

  await assert.rejects(shopwise.getOrder('SW-NOT-MINE'), /No order SW-NOT-MINE/);
});
