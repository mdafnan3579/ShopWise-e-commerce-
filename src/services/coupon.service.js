import { Coupon } from '../models/Coupon.js';
import { AppError } from '../utils/AppError.js';
import { paginate, toMongoSort } from '../utils/pagination.js';
import { escapeRegex } from '../utils/regex.js';

/**
 * Checks whether a coupon applies to a subtotal.
 * Returns `{ coupon, discountCents }` or `{ error: { code, message } }`. Never throws, so the
 * cart preview can show "coupon expired" next to an otherwise valid cart.
 *
 * @param {string} code
 * @param {number} subtotalCents
 */
export async function evaluateCoupon(code, subtotalCents, now = new Date()) {
  const coupon = await Coupon.findOne({ code: code.trim().toUpperCase() }).lean();

  if (!coupon || !coupon.isActive) {
    return { error: { code: 'INVALID_COUPON', message: 'This coupon code is not valid' } };
  }
  if (coupon.expiresAt && coupon.expiresAt <= now) {
    return { error: { code: 'COUPON_EXPIRED', message: 'This coupon has expired' } };
  }
  if (coupon.usageLimit !== undefined && coupon.timesUsed >= coupon.usageLimit) {
    return {
      error: { code: 'COUPON_USAGE_LIMIT', message: 'This coupon has reached its usage limit' },
    };
  }
  if (subtotalCents < (coupon.minSubtotalCents ?? 0)) {
    return {
      error: {
        code: 'COUPON_MIN_SUBTOTAL',
        message: `Spend at least $${(coupon.minSubtotalCents / 100).toFixed(2)} to use this coupon`,
      },
    };
  }

  return { coupon, discountCents: computeDiscount(coupon, subtotalCents) };
}

/** Pure discount math, capped so a discount can never exceed the subtotal. */
export function computeDiscount(coupon, subtotalCents) {
  const raw =
    coupon.discountType === 'percent'
      ? Math.round((subtotalCents * coupon.value) / 100)
      : coupon.value;
  const capped =
    coupon.maxDiscountCents !== undefined ? Math.min(raw, coupon.maxDiscountCents) : raw;
  return Math.min(capped, subtotalCents);
}

// --- Admin CRUD ---

export function listCoupons({ page, limit, q, active, sort }) {
  const filter = {};
  if (q) filter.code = new RegExp(escapeRegex(q.toUpperCase()));
  if (active !== undefined) filter.isActive = active;
  return paginate(Coupon, { filter, sort: toMongoSort(sort), page, limit });
}

export async function createCoupon(data) {
  if (await Coupon.exists({ code: data.code })) {
    throw AppError.conflict('A coupon with this code already exists', { fields: ['code'] });
  }
  return Coupon.create(data);
}

export async function updateCoupon(couponId, changes) {
  const coupon = await Coupon.findById(couponId);
  if (!coupon) throw AppError.notFound('Coupon');

  if (changes.code && changes.code !== coupon.code) {
    if (await Coupon.exists({ code: changes.code, _id: { $ne: coupon._id } })) {
      throw AppError.conflict('A coupon with this code already exists', { fields: ['code'] });
    }
  }
  coupon.set(changes);
  await coupon.save();
  return coupon;
}

export async function deleteCoupon(couponId) {
  // Orders keep a snapshot of the coupon, so deleting it never alters order history.
  const result = await Coupon.deleteOne({ _id: couponId });
  if (result.deletedCount === 0) throw AppError.notFound('Coupon');
}
