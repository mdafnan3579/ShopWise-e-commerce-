import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { getStripe } from '../config/stripe.js';
import { Cart } from '../models/Cart.js';
import { Coupon } from '../models/Coupon.js';
import { Order } from '../models/Order.js';
import { ProcessedWebhookEvent } from '../models/ProcessedWebhookEvent.js';
import { Product } from '../models/Product.js';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { sendOrderConfirmation } from './email.service.js';

/**
 * Verifies the Stripe signature against the raw request body. Anything that fails verification
 * is rejected before it touches the database: only Stripe can mark an order paid.
 *
 * @param {Buffer} rawBody
 * @param {string | undefined} signature
 */
export function constructStripeEvent(rawBody, signature) {
  if (!env.STRIPE_WEBHOOK_SECRET) {
    throw new AppError('Webhooks are not configured', 503, 'PAYMENTS_UNAVAILABLE');
  }
  if (!signature) throw new AppError('Missing Stripe signature', 400, 'INVALID_SIGNATURE');

  try {
    return getStripe().webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch {
    throw new AppError('Invalid Stripe signature', 400, 'INVALID_SIGNATURE');
  }
}

function isDuplicateKey(err) {
  return err?.code === 11000 || err?.errorResponse?.code === 11000;
}

/**
 * Runs `work` and records the event id in ONE transaction. If the event was already processed,
 * the ledger insert hits the unique index, the transaction aborts, and nothing is applied twice.
 * If `work` throws, the ledger entry rolls back too, so Stripe's retry can process it again.
 *
 * @returns {Promise<{ duplicate: boolean, result?: unknown }>}
 */
async function processOnce(event, work) {
  try {
    const result = await mongoose.connection.transaction(async (session) => {
      await ProcessedWebhookEvent.create([{ eventId: event.id, type: event.type }], { session });
      return work(session);
    });
    return { duplicate: false, result };
  } catch (err) {
    if (isDuplicateKey(err)) {
      logger.info({ eventId: event.id, type: event.type }, 'Duplicate webhook event ignored');
      return { duplicate: true };
    }
    throw err;
  }
}

/**
 * Marks an order paid and decrements stock. This is the ONLY code path that does either.
 *
 * Stock is decremented with a conditional update (`stock >= qty`), so it can never go negative,
 * even under concurrent payments. If stock ran out between checkout and payment, the order is
 * still recorded as paid (the money was taken) but flagged for a human to refund or backorder.
 */
async function fulfillOrder(stripeSession, mongoSession) {
  const orderId = stripeSession.metadata?.orderId ?? stripeSession.client_reference_id;
  const order = await Order.findById(orderId).session(mongoSession);
  if (!order) {
    logger.error({ stripeSessionId: stripeSession.id, orderId }, 'Webhook for unknown order');
    return null;
  }

  // A second "paid" event for the same order (completed + async_payment_succeeded).
  if (order.paymentStatus === 'paid') return null;

  const shortages = [];
  for (const item of order.items) {
    const update = await Product.updateOne(
      { _id: item.product, stock: { $gte: item.quantity } },
      { $inc: { stock: -item.quantity } },
      { session: mongoSession },
    );
    if (update.modifiedCount === 0) {
      shortages.push({ productId: String(item.product), name: item.name, quantity: item.quantity });
    }
  }

  const problems = [];
  if (shortages.length) problems.push({ reason: 'INSUFFICIENT_STOCK', details: shortages });
  if (stripeSession.amount_total != null && stripeSession.amount_total !== order.totalCents) {
    problems.push({
      reason: 'AMOUNT_MISMATCH',
      details: { expected: order.totalCents, charged: stripeSession.amount_total },
    });
  }

  const now = new Date();
  order.paymentStatus = 'paid';
  order.orderStatus = 'paid';
  order.paidAt = now;
  order.stripePaymentIntentId =
    typeof stripeSession.payment_intent === 'string'
      ? stripeSession.payment_intent
      : stripeSession.payment_intent?.id;
  order.statusHistory.push({ status: 'paid', at: now, note: 'Payment confirmed by Stripe' });
  if (problems.length) {
    order.needsAttention = {
      reason: problems.map((p) => p.reason).join(','),
      details: problems,
    };
    logger.warn({ orderId, problems }, 'Paid order needs attention');
  }
  await order.save({ session: mongoSession });

  if (order.coupon?.code) {
    await Coupon.updateOne(
      { code: order.coupon.code },
      { $inc: { timesUsed: 1 } },
      { session: mongoSession },
    );
  }
  await Cart.updateOne({ user: order.user }, { items: [] }, { session: mongoSession });

  return order;
}

async function markPaymentFailed(stripeSession, mongoSession) {
  const orderId = stripeSession.metadata?.orderId ?? stripeSession.client_reference_id;
  await Order.updateOne(
    { _id: orderId, paymentStatus: 'unpaid' },
    {
      paymentStatus: 'failed',
      orderStatus: 'cancelled',
      cancelledAt: new Date(),
      $push: { statusHistory: { status: 'cancelled', note: 'Payment failed' } },
    },
    { session: mongoSession },
  );
}

async function expirePendingOrder(stripeSession, mongoSession) {
  const orderId = stripeSession.metadata?.orderId ?? stripeSession.client_reference_id;
  await Order.updateOne(
    { _id: orderId, orderStatus: 'pending', paymentStatus: 'unpaid' },
    {
      orderStatus: 'cancelled',
      cancelledAt: new Date(),
      $push: { statusHistory: { status: 'cancelled', note: 'Checkout session expired' } },
    },
    { session: mongoSession },
  );
}

/**
 * Dispatches a verified Stripe event. Unknown event types are acknowledged (200) so Stripe
 * stops retrying them.
 */
export async function handleStripeEvent(event) {
  const stripeSession = event.data.object;

  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      // Delayed payment methods complete the session before the money arrives
      // (payment_status 'unpaid'); those orders are fulfilled on async_payment_succeeded.
      if (!['paid', 'no_payment_required'].includes(stripeSession.payment_status)) {
        logger.info({ eventId: event.id }, 'Checkout completed, awaiting asynchronous payment');
        return { handled: false };
      }

      const { duplicate, result: order } = await processOnce(event, (session) =>
        fulfillOrder(stripeSession, session),
      );

      // Side effects outside the database run only after the transaction committed.
      if (!duplicate && order) {
        const user = await User.findById(order.user).select('name email').lean();
        if (user) await sendOrderConfirmation(order, user);
      }
      return { handled: true, duplicate, fulfilled: Boolean(order) };
    }

    case 'checkout.session.async_payment_failed': {
      const { duplicate } = await processOnce(event, (session) =>
        markPaymentFailed(stripeSession, session),
      );
      return { handled: true, duplicate };
    }

    case 'checkout.session.expired': {
      const { duplicate } = await processOnce(event, (session) =>
        expirePendingOrder(stripeSession, session),
      );
      return { handled: true, duplicate };
    }

    default:
      logger.debug({ type: event.type }, 'Unhandled Stripe event type');
      return { handled: false };
  }
}
