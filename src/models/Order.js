import { randomBytes } from 'node:crypto';
import mongoose from 'mongoose';
import { CURRENCY, ORDER_STATUSES, PAYMENT_STATUSES } from '../config/commerce.js';

const { Schema } = mongoose;

/**
 * Line items are snapshots: name, price and image are copied at checkout so that later product
 * edits (price changes, renames, deletion) never rewrite order history.
 */
const orderItemSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true },
    slug: String,
    image: String,
    priceCents: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
    lineTotalCents: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const shippingAddressSchema = new Schema(
  {
    fullName: { type: String, required: true },
    line1: { type: String, required: true },
    line2: String,
    city: { type: String, required: true },
    state: String,
    postalCode: { type: String, required: true },
    country: { type: String, required: true },
    phone: String,
  },
  { _id: false },
);

const statusEventSchema = new Schema(
  {
    status: { type: String, required: true },
    at: { type: Date, default: Date.now },
    note: String,
  },
  { _id: false },
);

/** e.g. SW-MG7K2P-9F3A1C: time-ordered and short enough to read out to support. */
function generateOrderNumber() {
  return `SW-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString('hex').toUpperCase()}`;
}

const orderSchema = new Schema(
  {
    orderNumber: { type: String, unique: true, default: generateOrderNumber },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    items: {
      type: [orderItemSchema],
      validate: [(items) => items.length > 0, 'An order needs at least one item'],
    },
    shippingAddress: { type: shippingAddressSchema, required: true },

    subtotalCents: { type: Number, required: true, min: 0 },
    discountCents: { type: Number, default: 0, min: 0 },
    taxCents: { type: Number, required: true, min: 0 },
    shippingCents: { type: Number, required: true, min: 0 },
    totalCents: { type: Number, required: true, min: 0 },
    currency: { type: String, default: CURRENCY },
    coupon: {
      type: new Schema({ code: String, discountType: String, value: Number }, { _id: false }),
      default: undefined,
    },

    paymentStatus: { type: String, enum: PAYMENT_STATUSES, default: 'unpaid' },
    orderStatus: { type: String, enum: ORDER_STATUSES, default: 'pending' },
    statusHistory: { type: [statusEventSchema], default: () => [{ status: 'pending' }] },

    stripeSessionId: { type: String },
    stripePaymentIntentId: { type: String },
    paidAt: Date,
    shippedAt: Date,
    deliveredAt: Date,
    cancelledAt: Date,

    // Set by the webhook when something needs a human (e.g. stock ran out before payment).
    needsAttention: {
      type: new Schema({ reason: String, details: Schema.Types.Mixed }, { _id: false }),
      default: undefined,
    },
  },
  { timestamps: true, versionKey: false },
);

orderSchema.index(
  { stripeSessionId: 1 },
  { unique: true, partialFilterExpression: { stripeSessionId: { $type: 'string' } } },
);
orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ orderStatus: 1, createdAt: -1 });
orderSchema.index({ paymentStatus: 1, paidAt: -1 });
orderSchema.index({ 'items.product': 1, paymentStatus: 1 });

export const Order = mongoose.model('Order', orderSchema);
