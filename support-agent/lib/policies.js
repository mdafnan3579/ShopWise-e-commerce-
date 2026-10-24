// The store's support policies: the facts the agent is allowed to quote.
//
// Shipping, tax, payment and cancellation rules match the ShopWise backend
// (shopwise-api/src/config/commerce.js and the order service).
// Delivery times, returns and refund timing are DEMO values: ShopWise has no returns feature yet,
// so edit them to whatever your store really offers.

export const POLICY_TOPICS = [
  'shipping',
  'returns',
  'refunds',
  'payments',
  'cancellations',
  'order_status',
  'contact',
];

export const POLICIES = {
  shipping:
    'Shipping is free when the order total after discounts is $75 or more; otherwise it costs $5.99. ' +
    'Orders ship within 1–2 business days of payment and usually arrive 3–7 business days after shipping (demo value). ' +
    'A flat 8% sales tax is added at checkout.',
  returns:
    'Items can be returned within 30 days of delivery if unused and in their original packaging (demo value). ' +
    'Damaged or wrong items can always be returned. Returns are handled by a human support agent: ' +
    'the AI agent opens a support ticket and the team replies by email with a return label.',
  refunds:
    'Refunds go back to the original card through Stripe and usually appear within 5–10 business days (demo value). ' +
    'Only the support team can issue refunds; the AI agent cannot.',
  payments:
    'ShopWise accepts card payments through Stripe-hosted checkout. An order is only marked paid after Stripe confirms the payment. ' +
    'If a payment failed, the order stays unpaid and the customer can place it again.',
  cancellations:
    'Customers can cancel an order themselves while it is pending and unpaid. ' +
    'A paid order that has not shipped yet can be cancelled and refunded by the support team. ' +
    'Shipped or delivered orders cannot be cancelled; they can be returned instead (see returns).',
  order_status:
    'Order statuses: pending (waiting for payment), paid (payment confirmed, preparing to ship), ' +
    'shipped (on its way; a tracking note may be attached), delivered, cancelled.',
  contact:
    'Human support answers tickets by email within one business day (demo value). ' +
    'Customers can also see all their orders on the Orders page of their ShopWise account.',
};
