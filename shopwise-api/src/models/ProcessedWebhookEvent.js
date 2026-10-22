import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Idempotency ledger for Stripe webhooks. Stripe delivers events at least once and may retry
 * or deliver duplicates, so each event id is recorded inside the same transaction as its side
 * effects. A duplicate delivery hits the unique index and is skipped.
 */
const processedWebhookEventSchema = new Schema(
  {
    eventId: { type: String, required: true, unique: true },
    type: { type: String, required: true },
    processedAt: { type: Date, default: Date.now },
  },
  { versionKey: false },
);

// Stripe retries for up to 3 days; keep a comfortable margin, then let MongoDB clean up.
processedWebhookEventSchema.index({ processedAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

export const ProcessedWebhookEvent = mongoose.model(
  'ProcessedWebhookEvent',
  processedWebhookEventSchema,
);
