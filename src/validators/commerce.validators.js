import { z } from 'zod';
import {
  MAX_CART_LINES,
  MAX_QUANTITY_PER_ITEM,
  ORDER_STATUSES,
  PAYMENT_STATUSES,
} from '../config/commerce.js';
import { paginationQuery, sortQuery } from '../utils/pagination.js';
import { idParams, objectId, queryBoolean, searchTerm } from './common.js';
import { addressBody } from './user.validators.js';

/** Clients send ids and quantities only. Any price field is stripped and ignored. */
const cartItem = z.object({
  productId: objectId,
  quantity: z.number().int().min(1).max(MAX_QUANTITY_PER_ITEM),
});

const cartItems = z.array(cartItem).max(MAX_CART_LINES);

const couponCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9_-]{3,30}$/, 'Invalid coupon code format');

export const validateCartSchema = {
  body: z.object({ items: cartItems, couponCode: couponCode.optional() }),
};

export const replaceCartSchema = { body: z.object({ items: cartItems }) };

export const mergeCartSchema = { body: z.object({ items: cartItems }) };

export const validateCouponSchema = {
  body: z.object({ code: couponCode, items: cartItems.min(1) }),
};

export const checkoutSchema = {
  body: z
    .object({
      items: cartItems.min(1, 'Your cart is empty'),
      couponCode: couponCode.optional(),
      addressId: objectId.optional(),
      shippingAddress: addressBody.omit({ label: true, isDefault: true }).optional(),
    })
    .refine((b) => Boolean(b.addressId) !== Boolean(b.shippingAddress), {
      error: 'Provide either addressId or shippingAddress',
      path: ['shippingAddress'],
    }),
};

// --- Orders ---

export const listMyOrdersSchema = {
  query: z.object({ ...paginationQuery, status: z.enum(ORDER_STATUSES).optional() }),
};

export const orderIdSchema = { params: idParams('id') };

export const orderBySessionSchema = {
  params: z.object({
    sessionId: z.string().regex(/^cs_(test|live)_[A-Za-z0-9]+$/, 'Invalid session id'),
  }),
};

export const adminListOrdersSchema = {
  query: z
    .object({
      ...paginationQuery,
      status: z.enum(ORDER_STATUSES).optional(),
      paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
      q: searchTerm.optional(),
      from: z.coerce.date().optional(),
      to: z.coerce.date().optional(),
      sort: sortQuery(['-createdAt', 'createdAt', '-totalCents', 'totalCents'], '-createdAt'),
    })
    .refine((q) => !q.from || !q.to || q.from <= q.to, {
      error: 'from must be before to',
      path: ['from'],
    }),
};

export const updateOrderStatusSchema = {
  params: idParams('id'),
  body: z.object({
    status: z.enum(ORDER_STATUSES.filter((s) => s !== 'paid' && s !== 'pending')),
    note: z.string().trim().max(300).optional(),
  }),
};

// --- Admin coupons ---

const couponFields = {
  code: couponCode,
  description: z.string().trim().max(200).optional(),
  discountType: z.enum(['percent', 'fixed']),
  value: z.number().int().min(1),
  minSubtotalCents: z.number().int().min(0).optional(),
  maxDiscountCents: z.number().int().min(1).optional(),
  expiresAt: z.coerce.date().optional(),
  usageLimit: z.number().int().min(1).optional(),
  isActive: z.boolean().optional(),
};

const percentWithinRange = (c) => c.discountType !== 'percent' || c.value <= 100;
const percentError = { error: 'Percent discounts must be between 1 and 100', path: ['value'] };

export const createCouponSchema = {
  body: z.object(couponFields).refine(percentWithinRange, percentError),
};

export const updateCouponSchema = {
  params: idParams('id'),
  body: z
    .object(couponFields)
    .partial()
    .refine((b) => Object.keys(b).length > 0, { error: 'Provide at least one field to update' })
    .refine((c) => c.discountType === undefined || percentWithinRange(c), percentError),
};

export const listCouponsSchema = {
  query: z.object({
    ...paginationQuery,
    q: searchTerm.optional(),
    active: queryBoolean.optional(),
    sort: sortQuery(['-createdAt', 'createdAt', 'code', '-timesUsed'], '-createdAt'),
  }),
};

export const couponIdSchema = { params: idParams('id') };
