import { randomBytes } from 'node:crypto';
import mongoose from 'mongoose';

const { Schema } = mongoose;

export const TICKET_CATEGORIES = Object.freeze([
  'refund',
  'return',
  'damaged_or_wrong_item',
  'delivery_problem',
  'cancel_paid_order',
  'account',
  'other',
]);
export const TICKET_PRIORITIES = Object.freeze(['low', 'normal', 'high']);
export const TICKET_STATUSES = Object.freeze(['open', 'resolved']);

/** e.g. SUP-3F9A1C7B: short enough for a customer to quote in an email. */
function generateTicketNumber() {
  return `SUP-${randomBytes(4).toString('hex').toUpperCase()}`;
}

/**
 * A case handed from the AI assistant to the human support team (refunds, returns, damaged
 * items, upset customers...). Admins read and resolve them in the admin panel.
 */
const supportTicketSchema = new Schema(
  {
    ticketNumber: { type: String, unique: true, default: generateTicketNumber },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    order: { type: Schema.Types.ObjectId, ref: 'Order' },
    orderNumber: String,
    category: { type: String, enum: TICKET_CATEGORIES, required: true },
    priority: { type: String, enum: TICKET_PRIORITIES, default: 'normal' },
    // Written by the assistant for a colleague: what happened and what the customer wants.
    summary: { type: String, required: true, trim: true, maxlength: 2000 },
    status: { type: String, enum: TICKET_STATUSES, default: 'open' },
    resolvedAt: Date,
  },
  { timestamps: true, versionKey: false },
);

supportTicketSchema.index({ status: 1, createdAt: -1 });

export const SupportTicket = mongoose.model('SupportTicket', supportTicketSchema);
