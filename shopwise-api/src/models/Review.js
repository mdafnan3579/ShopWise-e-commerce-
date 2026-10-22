import mongoose from 'mongoose';
import { Product } from './Product.js';

const { Schema } = mongoose;

const reviewSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
      validate: { validator: Number.isInteger, message: 'Rating must be a whole number' },
    },
    title: { type: String, trim: true, maxlength: 100 },
    comment: { type: String, required: true, trim: true, maxlength: 2000 },
    // True when the reviewer has a paid order containing this product.
    verifiedPurchase: { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false },
);

// One review per user per product, enforced by the database (race-safe), not only in code.
reviewSchema.index({ user: 1, product: 1 }, { unique: true });
reviewSchema.index({ product: 1, createdAt: -1 });
reviewSchema.index({ product: 1, rating: -1 });

/**
 * Recomputes the denormalized `averageRating` / `reviewCount` on the product from the source of
 * truth (the reviews themselves). Recomputing instead of incrementing keeps the numbers correct
 * even if an earlier update failed halfway.
 */
reviewSchema.statics.recalculateProductRating = async function recalculateProductRating(productId) {
  const [stats] = await this.aggregate([
    { $match: { product: new mongoose.Types.ObjectId(String(productId)) } },
    { $group: { _id: null, average: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);

  await Product.updateOne(
    { _id: productId },
    {
      averageRating: stats ? Math.round(stats.average * 10) / 10 : 0,
      reviewCount: stats?.count ?? 0,
      reviewsUpdatedAt: new Date(),
    },
  );
};

/** `{ 1: n, 2: n, 3: n, 4: n, 5: n }` for a product. */
reviewSchema.statics.ratingBreakdown = async function ratingBreakdown(productId) {
  const rows = await this.aggregate([
    { $match: { product: new mongoose.Types.ObjectId(String(productId)) } },
    { $group: { _id: '$rating', count: { $sum: 1 } } },
  ]);
  const breakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const row of rows) breakdown[row._id] = row.count;
  return breakdown;
};

export const Review = mongoose.model('Review', reviewSchema);
