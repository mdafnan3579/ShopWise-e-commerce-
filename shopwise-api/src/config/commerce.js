/** Store-wide pricing rules. All money values are integer cents. */
export const CURRENCY = 'usd';

/** Flat estimated sales tax in basis points (800 = 8%). Real stores would use Stripe Tax. */
export const TAX_RATE_BPS = 800;

export const FREE_SHIPPING_THRESHOLD_CENTS = 7500;
export const STANDARD_SHIPPING_CENTS = 599;

export const MAX_CART_LINES = 50;
export const MAX_QUANTITY_PER_ITEM = 10;

/** Stripe requires Checkout Sessions to live at least 30 minutes. */
export const CHECKOUT_SESSION_TTL_MINUTES = 30;

export const ORDER_STATUSES = Object.freeze([
  'pending',
  'paid',
  'shipped',
  'delivered',
  'cancelled',
]);
export const PAYMENT_STATUSES = Object.freeze(['unpaid', 'paid', 'failed', 'refunded']);

/**
 * Allowed admin status transitions. `paid` is deliberately absent as a target: only the
 * verified Stripe webhook can mark an order paid.
 */
export const ORDER_TRANSITIONS = Object.freeze({
  pending: ['cancelled'],
  paid: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
});
