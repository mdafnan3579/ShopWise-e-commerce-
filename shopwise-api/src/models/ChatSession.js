import mongoose from 'mongoose';

const { Schema } = mongoose;

export const MAX_STORED_MESSAGES = 50;
export const GUEST_SESSION_TTL_DAYS = 7;

const chatMessageSchema = new Schema(
  {
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, required: true, maxlength: 8000 },
    // Product cards shown with an assistant reply, so a reloaded chat renders them again.
    productIds: [{ type: Schema.Types.ObjectId, ref: 'Product' }],
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

/**
 * AI assistant conversation. Belongs to a user or, for guests, to an anonymous `guestId`
 * kept in an httpOnly cookie. Only plain text turns are stored; tool calls are re-run as needed.
 */
const chatSessionSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    guestId: { type: String, index: true },
    messages: { type: [chatMessageSchema], default: [] },
    // Set only for guest sessions so the TTL index cleans them up; user sessions persist.
    expiresAt: { type: Date },
  },
  { timestamps: true, versionKey: false },
);

chatSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const ChatSession = mongoose.model('ChatSession', chatSessionSchema);
