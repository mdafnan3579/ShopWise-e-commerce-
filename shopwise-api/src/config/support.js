import { formatMoney } from '../utils/money.js';
import {
  FREE_SHIPPING_THRESHOLD_CENTS,
  STANDARD_SHIPPING_CENTS,
  TAX_RATE_BPS,
} from './commerce.js';

/**
 * Customer support policies the assistant may quote (via the `get_store_policy` tool).
 *
 * Shipping, tax, payment and cancellation rules are built from the real commerce config and
 * order rules. Delivery times, the returns window, refund timing and the reply time are store
 * policy, not code: edit them to match what the store really offers.
 */
export const POLICY_TOPICS = Object.freeze([
  'shipping',
  'returns',
  'refunds',
  'payments',
  'cancellations',
  'order_status',
  'contact',
]);

export const SUPPORT_REPLY_TIME = 'within one business day';

export const POLICIES = Object.freeze({
  shipping:
    `Shipping is free when the order total after discounts is ${formatMoney(FREE_SHIPPING_THRESHOLD_CENTS)} or more; ` +
    `otherwise it costs ${formatMoney(STANDARD_SHIPPING_CENTS)}. Orders ship within 1–2 business days of payment and ` +
    `usually arrive 3–7 business days after shipping. A flat ${TAX_RATE_BPS / 100}% sales tax is added at checkout.`,
  returns:
    'Items can be returned within 30 days of delivery if unused and in their original packaging. ' +
    'Damaged or wrong items can always be returned. Returns are handled by the support team: ' +
    'the assistant opens a support ticket and the team replies by email with a return label.',
  refunds:
    'Refunds go back to the original card through Stripe and usually appear within 5–10 business days. ' +
    'Only the support team can issue refunds; the assistant cannot.',
  payments:
    'ShopWise accepts card payments through Stripe-hosted checkout. An order is only marked paid after Stripe ' +
    'confirms the payment. If a payment failed, the order stays unpaid and the customer can place it again.',
  cancellations:
    'Customers can cancel an order themselves while it is pending and unpaid. A paid order that has not shipped ' +
    'yet can be cancelled and refunded by the support team. Shipped or delivered orders cannot be cancelled; ' +
    'they can be returned instead.',
  order_status:
    'Order statuses: pending (waiting for payment), paid (payment confirmed, preparing to ship), ' +
    'shipped (on its way; a tracking note may be attached), delivered, cancelled.',
  contact:
    `The support team answers tickets by email ${SUPPORT_REPLY_TIME}. ` +
    'Customers can see all their orders on the Orders page of their ShopWise account.',
});
