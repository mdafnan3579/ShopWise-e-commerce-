// Every tool the support agent can use. Each tool = { definition, run }:
//   definition → what Claude reads (name, when to use it, inputs). Write it like a note to a new colleague.
//   run        → your code that actually does the work. Its return value (a string) goes back to Claude.
//
// `strict: true` + `additionalProperties: false` + listing every field in `required` makes Claude's
// inputs always match the schema, so `run` never receives surprises.

import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { POLICIES, POLICY_TOPICS } from './policies.js';

const ORDER_STATUSES = ['pending', 'paid', 'shipped', 'delivered', 'cancelled'];
const dollars = (cents) => `$${(cents / 100).toFixed(2)}`;
const day = (date) => (date ? new Date(date).toISOString().slice(0, 10) : undefined);

/** Shrinks an order to what support needs: less text for Claude to read = cheaper and clearer. */
function summarizeOrder(order) {
  return {
    orderNumber: order.orderNumber,
    status: order.orderStatus,
    payment: order.paymentStatus,
    placed: day(order.createdAt),
    total: dollars(order.totalCents),
    items: order.items?.map((item) => `${item.quantity} × ${item.name}`),
    shippedOn: day(order.shippedAt),
    deliveredOn: day(order.deliveredAt),
    cancelledOn: day(order.cancelledAt),
    // Notes the store added when the status changed, e.g. a tracking number.
    updates: order.statusHistory
      ?.filter((event) => event.note)
      .map((event) => `${day(event.at)} ${event.status}: ${event.note}`),
  };
}

// ── Knowledge ──────────────────────────────────────────────────────────────────────────────

export const policyTool = {
  definition: {
    name: 'get_store_policy',
    description:
      'Look up an official ShopWise support policy. Use it before answering any question about shipping, ' +
      'returns, refunds, payments, cancellations, order statuses or how to contact support.',
    input_schema: {
      type: 'object',
      properties: { topic: { type: 'string', enum: POLICY_TOPICS } },
      required: ['topic'],
      additionalProperties: false,
    },
    strict: true,
  },
  run: ({ topic }) => POLICIES[topic] ?? `No policy found for "${topic}".`,
};

// ── Orders (read only) ─────────────────────────────────────────────────────────────────────

export function orderTools(shopwise) {
  return [
    {
      definition: {
        name: 'list_my_orders',
        description:
          "List the logged-in customer's most recent orders (newest first) with status, total and items. " +
          'Use it when the customer asks about "my order" without giving an order number, or to find one.',
        input_schema: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['any', ...ORDER_STATUSES],
              description: 'Only orders with this status, or "any" for all.',
            },
          },
          required: ['status'],
          additionalProperties: false,
        },
        strict: true,
      },
      run: async ({ status }) => {
        const orders = await shopwise.listMyOrders({ status: status === 'any' ? undefined : status });
        if (orders.length === 0) return 'This customer has no orders matching that.';
        return JSON.stringify(orders.map(summarizeOrder));
      },
    },
    {
      definition: {
        name: 'get_order_details',
        description:
          'Get full details of one of the customer\'s orders by its order number (looks like "SW-MG7K2P-9F3A1C"): ' +
          'items, status, payment, dates and tracking notes.',
        input_schema: {
          type: 'object',
          properties: { order_number: { type: 'string' } },
          required: ['order_number'],
          additionalProperties: false,
        },
        strict: true,
      },
      run: async ({ order_number }) => JSON.stringify(summarizeOrder(await shopwise.getOrder(order_number))),
    },
  ];
}

// ── Actions (change something, so they need care) ──────────────────────────────────────────

/**
 * Cancels an order, but only after `confirm` returns true. The check lives in CODE, not in the prompt:
 * whatever Claude decides, nothing is cancelled without the customer clicking/typing "yes".
 */
export function cancelOrderTool(shopwise, confirm) {
  return {
    definition: {
      name: 'cancel_order',
      description:
        'Cancel one of the customer\'s orders. Only pending, unpaid orders can be cancelled here. ' +
        'Before calling it, check the order with get_order_details and make sure the customer asked to cancel. ' +
        'The customer will be asked to confirm on screen; if they decline, do not try again.',
      input_schema: {
        type: 'object',
        properties: { order_number: { type: 'string' } },
        required: ['order_number'],
        additionalProperties: false,
      },
      strict: true,
    },
    run: async ({ order_number }) => {
      const order = await shopwise.getOrder(order_number);
      if (order.orderStatus !== 'pending' || order.paymentStatus !== 'unpaid') {
        return `Not cancelled: order ${order.orderNumber} is ${order.orderStatus} (payment ${order.paymentStatus}). ` +
          'Only pending, unpaid orders can be cancelled by the customer. Offer a support ticket instead.';
      }
      const approved = await confirm(`Cancel order ${order.orderNumber} (${dollars(order.totalCents)})?`);
      if (!approved) return `The customer declined. Order ${order.orderNumber} was NOT cancelled.`;

      const cancelled = await shopwise.cancelOrder(order_number);
      return `Cancelled. Order ${cancelled.orderNumber} is now ${cancelled.orderStatus}.`;
    },
  };
}

/**
 * Hands the case to a human. Here tickets are saved to a JSON file so you can open and read them;
 * in a real store this would create a record in the database or a helpdesk tool (Zendesk, etc.).
 */
export function supportTicketTool({ file, customer }) {
  return {
    definition: {
      name: 'create_support_ticket',
      description:
        'Hand the case to the human support team. Use it for refunds, returns, damaged or wrong items, ' +
        'delivery problems, cancelling paid orders, account issues, an upset customer, or anything you cannot solve. ' +
        'Tell the customer the ticket number and that the team replies by email within one business day.',
      input_schema: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            enum: ['refund', 'return', 'damaged_or_wrong_item', 'delivery_problem', 'cancel_paid_order', 'account', 'other'],
          },
          priority: { type: 'string', enum: ['low', 'normal', 'high'] },
          order_number: {
            type: 'string',
            description: 'The related order number, or "none".',
          },
          summary: {
            type: 'string',
            description: 'What happened and what the customer wants, written for a support colleague.',
          },
        },
        required: ['category', 'priority', 'order_number', 'summary'],
        additionalProperties: false,
      },
      strict: true,
    },
    run: async ({ category, priority, order_number, summary }) => {
      const tickets = JSON.parse(await readFile(file, 'utf8').catch(() => '[]'));
      const ticket = {
        id: `SUP-${randomUUID().slice(0, 8).toUpperCase()}`,
        createdAt: new Date().toISOString(),
        status: 'open',
        customer,
        category,
        priority,
        orderNumber: order_number === 'none' ? null : order_number,
        summary,
      };
      tickets.push(ticket);
      await writeFile(file, `${JSON.stringify(tickets, null, 2)}\n`);
      return `Ticket ${ticket.id} created (${priority} priority). The support team replies by email within one business day.`;
    },
  };
}
