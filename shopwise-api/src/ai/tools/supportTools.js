import { z } from 'zod';
import { ORDER_STATUSES } from '../../config/commerce.js';
import { POLICIES, POLICY_TOPICS, SUPPORT_REPLY_TIME } from '../../config/support.js';
import { Order } from '../../models/Order.js';
import { TICKET_CATEGORIES, TICKET_PRIORITIES } from '../../models/SupportTicket.js';
import { listMyOrders } from '../../services/order.service.js';
import { createTicket } from '../../services/supportTicket.service.js';
import { formatMoney } from '../../utils/money.js';

/**
 * Customer support tools (store policies, the customer's orders, cancellation, handoff to a
 * human). Order tools only ever query with the signed-in user's id, so the assistant cannot
 * see anyone else's orders whatever it is told.
 *
 * Nothing here changes an order: `request_order_cancellation` only checks the order and asks
 * the UI to show a confirm button. The customer's click calls the normal
 * `POST /orders/:id/cancel` endpoint, so a cancellation always needs a human action.
 */

const MAX_ORDERS = 10;
const SIGN_IN_REQUIRED = {
  error: 'The customer is not signed in. Ask them to sign in to get help with their orders.',
};

const orderNumber = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^SW-[A-Z0-9-]{3,40}$/, 'Order numbers look like SW-MG7K2P-9F3A1C');

export const SUPPORT_TOOLS = [
  {
    name: 'get_store_policy',
    description:
      'Look up an official ShopWise support policy. Use it before answering any question about shipping, returns, refunds, payments, cancellations, order statuses or how to contact support.',
    input_schema: {
      type: 'object',
      properties: { topic: { type: 'string', enum: [...POLICY_TOPICS] } },
      required: ['topic'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_my_orders',
    description:
      'List the signed-in customer\'s most recent orders (newest first) with order number, status, total and items. Use it when they ask about "my order" without an order number.',
    input_schema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: [...ORDER_STATUSES],
          description: 'Only orders with this status. Omit for all orders.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_order_details',
    description:
      'Get one of the signed-in customer\'s orders by order number (looks like "SW-MG7K2P-9F3A1C"): items, status, payment, dates and tracking notes.',
    input_schema: {
      type: 'object',
      properties: { orderNumber: { type: 'string' } },
      required: ['orderNumber'],
      additionalProperties: false,
    },
  },
  {
    name: 'request_order_cancellation',
    description:
      'Show the customer a button to cancel one of their orders. Only pending, unpaid orders qualify. Use it only when the customer asks to cancel. It does NOT cancel anything by itself: the order is cancelled only if the customer clicks the button.',
    input_schema: {
      type: 'object',
      properties: { orderNumber: { type: 'string' } },
      required: ['orderNumber'],
      additionalProperties: false,
    },
  },
  {
    name: 'create_support_ticket',
    description: `Hand the case to the human support team. Use it for refunds, returns, damaged or wrong items, delivery problems, cancelling paid orders, account issues, an upset customer or anything you cannot solve. Then give the customer the ticket number and tell them the team replies by email ${SUPPORT_REPLY_TIME}.`,
    input_schema: {
      type: 'object',
      properties: {
        category: { type: 'string', enum: [...TICKET_CATEGORIES] },
        priority: { type: 'string', enum: [...TICKET_PRIORITIES] },
        orderNumber: { type: 'string', description: 'The related order number, if any.' },
        summary: {
          type: 'string',
          description:
            'What happened and what the customer wants, written for a support colleague.',
        },
      },
      required: ['category', 'priority', 'summary'],
      additionalProperties: false,
    },
  },
];

export const supportInputSchemas = {
  get_store_policy: z.object({ topic: z.enum(POLICY_TOPICS) }),
  list_my_orders: z.object({ status: z.enum(ORDER_STATUSES).optional() }),
  get_order_details: z.object({ orderNumber }),
  request_order_cancellation: z.object({ orderNumber }),
  create_support_ticket: z.object({
    category: z.enum(TICKET_CATEGORIES),
    priority: z.enum(TICKET_PRIORITIES),
    orderNumber: orderNumber.optional(),
    summary: z.string().trim().min(10).max(2000),
  }),
};

const day = (date) => (date ? new Date(date).toISOString().slice(0, 10) : undefined);

/** Shrinks an order to what support needs: less for the model to read, nothing sensitive. */
function summarizeOrder(order) {
  return {
    orderNumber: order.orderNumber,
    status: order.orderStatus,
    payment: order.paymentStatus,
    placed: day(order.createdAt),
    total: formatMoney(order.totalCents, order.currency),
    items: order.items?.map((item) => `${item.quantity} × ${item.name}`),
    shippedOn: day(order.shippedAt),
    deliveredOn: day(order.deliveredAt),
    cancelledOn: day(order.cancelledAt),
    // Notes the store added on status changes, e.g. a tracking number.
    updates: order.statusHistory
      ?.filter((event) => event.note)
      .map((event) => `${day(event.at)} ${event.status}: ${event.note}`),
  };
}

function findMyOrder(userId, number) {
  return Order.findOne({ orderNumber: number, user: userId })
    .select('-needsAttention -stripePaymentIntentId -stripeSessionId -shippingAddress')
    .lean();
}

const notFound = (number) => ({ error: `No order ${number} on this customer's account` });

export const supportExecutors = {
  get_store_policy({ topic }) {
    return { topic, policy: POLICIES[topic] };
  },

  async list_my_orders({ status }, { userId }) {
    if (!userId) return SIGN_IN_REQUIRED;
    const { items, meta } = await listMyOrders(userId, { page: 1, limit: MAX_ORDERS, status });
    return { totalOrders: meta.total, orders: items.map(summarizeOrder) };
  },

  async get_order_details({ orderNumber: number }, { userId }) {
    if (!userId) return SIGN_IN_REQUIRED;
    const order = await findMyOrder(userId, number);
    return order ? summarizeOrder(order) : notFound(number);
  },

  async request_order_cancellation({ orderNumber: number }, context) {
    if (!context.userId) return SIGN_IN_REQUIRED;
    const order = await findMyOrder(context.userId, number);
    if (!order) return notFound(number);
    if (order.orderStatus !== 'pending' || order.paymentStatus !== 'unpaid') {
      return {
        cancellable: false,
        reason: `Order ${order.orderNumber} is ${order.orderStatus} (payment ${order.paymentStatus}). Only pending, unpaid orders can be cancelled by the customer. Offer a support ticket instead.`,
      };
    }

    if (!context.actions.some((a) => a.orderId === String(order._id))) {
      context.actions.push({
        type: 'cancel_order',
        orderId: String(order._id),
        orderNumber: order.orderNumber,
        totalCents: order.totalCents,
      });
    }
    return {
      cancellable: true,
      buttonShown: true,
      note: `The order is NOT cancelled yet. A "Cancel order ${order.orderNumber}" button is shown under your reply; tell the customer to click it to confirm.`,
    };
  },

  async create_support_ticket(input, { userId }) {
    if (!userId) return SIGN_IN_REQUIRED;
    const ticket = await createTicket({ userId, ...input });
    return {
      ticketNumber: ticket.ticketNumber,
      priority: ticket.priority,
      replyTime: `The support team replies by email ${SUPPORT_REPLY_TIME}.`,
    };
  },
};
