import mongoose from 'mongoose';
import { CATEGORIES } from '../config/catalog.js';

const { Schema } = mongoose;

const integer = {
  validator: Number.isInteger,
  message: '{PATH} must be an integer',
};

const imageSchema = new Schema({
  url: { type: String, required: true },
  publicId: { type: String }, // Cloudinary id, needed to delete the asset
  alt: { type: String, trim: true, maxlength: 140 },
});

const productSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 140 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    tagline: { type: String, trim: true, maxlength: 160 },
    description: { type: String, required: true, trim: true, maxlength: 5000 },
    // Money is stored as integer cents to avoid floating-point rounding errors.
    priceCents: { type: Number, required: true, min: 0, validate: integer },
    category: { type: String, required: true, enum: CATEGORIES },
    brand: { type: String, trim: true, maxlength: 80, default: '' },
    tags: { type: [{ type: String, lowercase: true, trim: true, maxlength: 40 }], default: [] },
    images: { type: [imageSchema], default: [] },
    stock: { type: Number, required: true, min: 0, default: 0, validate: integer },
    averageRating: { type: Number, default: 0, min: 0, max: 5 },
    reviewCount: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true },
    // Bumped whenever a review is created, edited or deleted, so the cached AI summary knows
    // when it is stale.
    reviewsUpdatedAt: { type: Date },
    aiReviewSummary: {
      type: new Schema(
        {
          summary: String,
          pros: [String],
          cons: [String],
          generatedAt: Date,
          reviewCountAtGeneration: Number,
        },
        { _id: false },
      ),
      default: undefined,
    },
  },
  { timestamps: true, versionKey: false },
);

// Full-text search, weighted so name matches rank above description matches.
productSchema.index(
  { name: 'text', brand: 'text', tags: 'text', description: 'text' },
  { weights: { name: 10, brand: 5, tags: 3, description: 1 }, name: 'product_text_search' },
);
productSchema.index({ isActive: 1, category: 1, priceCents: 1 });
productSchema.index({ isActive: 1, averageRating: -1 });
productSchema.index({ isActive: 1, createdAt: -1 });
productSchema.index({ stock: 1 });

export const Product = mongoose.model('Product', productSchema);
