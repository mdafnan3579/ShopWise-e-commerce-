import mongoose from 'mongoose';

const { Schema } = mongoose;

const couponSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    description: { type: String, trim: true, maxlength: 200 },
    discountType: { type: String, enum: ['percent', 'fixed'], required: true },
    // percent: 1–100; fixed: amount in cents
    value: { type: Number, required: true, min: 1 },
    minSubtotalCents: { type: Number, default: 0, min: 0 },
    maxDiscountCents: { type: Number, min: 0 }, // optional cap for percent coupons
    expiresAt: { type: Date },
    usageLimit: { type: Number, min: 1 }, // undefined = unlimited
    timesUsed: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, versionKey: false },
);

couponSchema.path('value').validate(function validatePercent(value) {
  return this.discountType !== 'percent' || value <= 100;
}, 'Percent discounts cannot exceed 100');

export const Coupon = mongoose.model('Coupon', couponSchema);
