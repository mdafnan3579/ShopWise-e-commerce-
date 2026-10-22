import mongoose from 'mongoose';
import { ORDER_TRANSITIONS } from '../config/commerce.js';
import { logger } from '../config/logger.js';
import { getStripe } from '../config/stripe.js';
import { Order } from '../models/Order.js';
import { Product } from '../models/Product.js';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { paginate, toMongoSort } from '../utils/pagination.js';
import { escapeRegex } from '../utils/regex.js';

const CUSTOMER_LIST_FIELDS =
  'orderNumber items totalCents currency paymentStatus orderStatus createdAt paidAt shippedAt deliveredAt';

// --- Customer ---

export function listMyOrders(userId, { page, limit, status }) {
  const filter = { user: userId };
  if (status) filter.orderStatus = status;
  return paginate(Order, {
    filter,
    sort: { createdAt: -1, _id: 1 },
    page,
    limit,
    projection: CUSTOMER_LIST_FIELDS,
  });
}

/** Another user's order is reported as "not found", never "forbidden", so ids are not probeable. */
export async function getMyOrder(userId, orderId) {
  const order = await Order.findOne({ _id: orderId, user: userId })
    .select('-needsAttention -stripePaymentIntentId')
    .lean();
  if (!order) throw AppError.notFound('Order');
  return order;
}

/** Used by the checkout success page, which only knows the Stripe session id. */
export async function getMyOrderBySession(userId, sessionId) {
  const order = await Order.findOne({ stripeSessionId: sessionId, user: userId })
    .select('-needsAttention -stripePaymentIntentId')
    .lean();
  if (!order) throw AppError.notFound('Order');
  return order;
}

/** Customers can cancel only orders that have not been paid yet. */
export async function cancelMyOrder(userId, orderId) {
  const order = await Order.findOne({ _id: orderId, user: userId });
  if (!order) throw AppError.notFound('Order');

  if (order.orderStatus !== 'pending' || order.paymentStatus !== 'unpaid') {
    throw new AppError(
      'Only unpaid orders can be cancelled. Please contact support for paid orders.',
      409,
      'ORDER_NOT_CANCELLABLE',
    );
  }

  order.orderStatus = 'cancelled';
  order.cancelledAt = new Date();
  order.statusHistory.push({ status: 'cancelled', note: 'Cancelled by customer' });
  await order.save();

  // Close the Stripe session so the payment link can no longer be used (best effort).
  if (order.stripeSessionId) {
    try {
      await getStripe().checkout.sessions.expire(order.stripeSessionId);
    } catch (err) {
      logger.warn({ err, orderId }, 'Could not expire Stripe session for cancelled order');
    }
  }
  return order;
}

// --- Admin ---

export async function listOrders({ page, limit, status, paymentStatus, q, from, to, sort }) {
  const filter = {};
  if (status) filter.orderStatus = status;
  if (paymentStatus) filter.paymentStatus = paymentStatus;
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = from;
    if (to) filter.createdAt.$lte = to;
  }
  if (q) {
    const pattern = new RegExp(escapeRegex(q), 'i');
    const users = await User.find({ $or: [{ email: pattern }, { name: pattern }] })
      .select('_id')
      .limit(100)
      .lean();
    filter.$or = [{ orderNumber: pattern }, { user: { $in: users.map((u) => u._id) } }];
  }

  return paginate(Order, {
    filter,
    sort: toMongoSort(sort),
    page,
    limit,
    projection: `${CUSTOMER_LIST_FIELDS} user needsAttention`,
    populate: { path: 'user', select: 'name email' },
  });
}

export async function getOrder(orderId) {
  const order = await Order.findById(orderId).populate('user', 'name email').lean();
  if (!order) throw AppError.notFound('Order');
  return order;
}

async function restock(order, session) {
  for (const item of order.items) {
    await Product.updateOne({ _id: item.product }, { $inc: { stock: item.quantity } }, { session });
  }
}

/**
 * Admin status changes follow an explicit state machine (see ORDER_TRANSITIONS).
 * Cancelling a paid order refunds it through Stripe first, then restocks. If the refund fails,
 * nothing changes.
 */
export async function updateOrderStatus(orderId, nextStatus, note) {
  const order = await Order.findById(orderId);
  if (!order) throw AppError.notFound('Order');

  const allowed = ORDER_TRANSITIONS[order.orderStatus] ?? [];
  if (!allowed.includes(nextStatus)) {
    throw new AppError(
      `Cannot change an order from "${order.orderStatus}" to "${nextStatus}"`,
      409,
      'INVALID_STATUS_TRANSITION',
      { from: order.orderStatus, allowed },
    );
  }

  const refunding = nextStatus === 'cancelled' && order.paymentStatus === 'paid';
  if (refunding) {
    if (!order.stripePaymentIntentId) {
      throw new AppError('This order has no payment to refund', 409, 'REFUND_UNAVAILABLE');
    }
    try {
      await getStripe().refunds.create(
        { payment_intent: order.stripePaymentIntentId, metadata: { orderId: String(order._id) } },
        { idempotencyKey: `refund-${order._id}` },
      );
    } catch (err) {
      logger.error({ err, orderId }, 'Stripe refund failed');
      throw new AppError('Refund failed at the payment provider', 502, 'PAYMENT_PROVIDER_ERROR');
    }
  }

  const now = new Date();
  await mongoose.connection.transaction(async (session) => {
    order.orderStatus = nextStatus;
    if (nextStatus === 'shipped') order.shippedAt = now;
    if (nextStatus === 'delivered') order.deliveredAt = now;
    if (nextStatus === 'cancelled') order.cancelledAt = now;
    if (refunding) {
      order.paymentStatus = 'refunded';
      await restock(order, session);
    }
    order.statusHistory.push({ status: nextStatus, at: now, note });
    await order.save({ session });
  });

  return order;
}

/** Verified-purchase check used when a review is posted. */
export async function hasPaidOrderFor(userId, productId) {
  return Boolean(
    await Order.exists({
      user: userId,
      'items.product': productId,
      paymentStatus: { $in: ['paid'] },
    }),
  );
}
