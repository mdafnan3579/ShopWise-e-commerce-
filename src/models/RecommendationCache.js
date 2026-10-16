import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Per-user cache of AI-ranked recommendations (1 hour). Stored in MongoDB rather than process
 * memory so it survives restarts and is shared by every API instance. The TTL index deletes
 * expired rows.
 */
const recommendationCacheSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    items: [
      new Schema(
        { product: { type: Schema.Types.ObjectId, ref: 'Product' }, reason: String },
        { _id: false },
      ),
    ],
    generatedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
  },
  { versionKey: false },
);

recommendationCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RecommendationCache = mongoose.model('RecommendationCache', recommendationCacheSchema);
