import {
  CURRENCY,
  FREE_SHIPPING_THRESHOLD_CENTS,
  MAX_QUANTITY_PER_ITEM,
  STANDARD_SHIPPING_CENTS,
  TAX_RATE_BPS,
} from '../config/commerce.js';
import { Product } from '../models/Product.js';
import { evaluateCoupon } from './coupon.service.js';

/**
 * Merges duplicate product lines and clamps quantities.
 * @param {Array<{ productId: string, quantity: number }>} items
 */
export function normalizeItems(items) {
  const merged = new Map();
  for (const { productId, quantity } of items) {
    const id = String(productId);
    merged.set(id, Math.min((merged.get(id) ?? 0) + quantity, MAX_QUANTITY_PER_ITEM));
  }
  return [...merged].map(([productId, quantity]) => ({ productId, quantity }));
}

export function calculateShipping(merchandiseCents) {
  if (merchandiseCents <= 0) return 0;
  return merchandiseCents >= FREE_SHIPPING_THRESHOLD_CENTS ? 0 : STANDARD_SHIPPING_CENTS;
}

export function calculateTax(taxableCents) {
  return Math.round((taxableCents * TAX_RATE_BPS) / 10_000);
}

/**
 * The single source of truth for what a cart costs.
 *
 * The client only ever sends product ids and quantities. Every price is read from the database
 * here, so a tampered client request cannot change what the customer pays. Used by the cart
 * preview, the saved cart, and checkout.
 *
 * @param {Array<{ productId: string, quantity: number }>} rawItems
 * @param {{ couponCode?: string }} [options]
 */
export async function priceCart(rawItems, { couponCode } = {}) {
  const requested = normalizeItems(rawItems);
  const products = await Product.find({ _id: { $in: requested.map((i) => i.productId) } })
    .select('name slug priceCents images stock isActive')
    .lean();
  const byId = new Map(products.map((p) => [String(p._id), p]));

  const items = [];
  const issues = [];

  for (const { productId, quantity } of requested) {
    const product = byId.get(productId);

    if (!product || !product.isActive) {
      issues.push({
        productId,
        code: 'UNAVAILABLE',
        message: 'This product is no longer available',
      });
      continue;
    }
    if (product.stock === 0) {
      issues.push({ productId, code: 'OUT_OF_STOCK', message: `${product.name} is out of stock` });
      continue;
    }
    if (quantity > product.stock) {
      issues.push({
        productId,
        code: 'INSUFFICIENT_STOCK',
        message: `Only ${product.stock} of ${product.name} left in stock`,
        available: product.stock,
      });
    }

    items.push({
      productId,
      name: product.name,
      slug: product.slug,
      image: product.images?.[0]?.url ?? null,
      priceCents: product.priceCents,
      quantity,
      lineTotalCents: product.priceCents * quantity,
      stock: product.stock,
    });
  }

  const subtotalCents = items.reduce((sum, item) => sum + item.lineTotalCents, 0);

  let coupon = null;
  let couponError = null;
  let discountCents = 0;
  if (couponCode && subtotalCents > 0) {
    const result = await evaluateCoupon(couponCode, subtotalCents);
    if (result.error) {
      couponError = result.error;
    } else {
      discountCents = result.discountCents;
      coupon = {
        code: result.coupon.code,
        discountType: result.coupon.discountType,
        value: result.coupon.value,
        description: result.coupon.description,
      };
    }
  }

  const merchandiseCents = subtotalCents - discountCents;
  const shippingCents = calculateShipping(merchandiseCents);
  const taxCents = calculateTax(merchandiseCents);

  return {
    items,
    issues,
    coupon,
    couponError,
    currency: CURRENCY,
    subtotalCents,
    discountCents,
    shippingCents,
    taxCents,
    totalCents: merchandiseCents + shippingCents + taxCents,
    freeShippingThresholdCents: FREE_SHIPPING_THRESHOLD_CENTS,
  };
}
