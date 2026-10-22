import { MAX_CART_LINES } from '../config/commerce.js';
import { Cart } from '../models/Cart.js';
import { AppError } from '../utils/AppError.js';
import { normalizeItems, priceCart } from './pricing.service.js';

function toCartItems(items) {
  return items.map(({ productId, quantity }) => ({ product: productId, quantity }));
}

function fromCartItems(cart) {
  return (cart?.items ?? []).map(({ product, quantity }) => ({
    productId: String(product),
    quantity,
  }));
}

async function saveItems(userId, items) {
  const normalized = normalizeItems(items);
  if (normalized.length > MAX_CART_LINES) {
    throw new AppError(
      `A cart can hold at most ${MAX_CART_LINES} different products`,
      400,
      'CART_LIMIT',
    );
  }
  await Cart.findOneAndUpdate(
    { user: userId },
    { items: toCartItems(normalized) },
    { upsert: true, runValidators: true },
  );
  return priceCart(normalized);
}

export async function getCart(userId) {
  const cart = await Cart.findOne({ user: userId }).lean();
  return priceCart(fromCartItems(cart));
}

/** Replaces the saved cart. The frontend calls this after each local cart change (debounced). */
export function replaceCart(userId, items) {
  return saveItems(userId, items);
}

/**
 * Merges a guest cart (from localStorage) into the saved cart on login. Quantities for the
 * same product are added together (capped), so nothing the user picked is lost.
 */
export async function mergeCart(userId, guestItems) {
  const cart = await Cart.findOne({ user: userId }).lean();
  return saveItems(userId, [...fromCartItems(cart), ...guestItems]);
}

export async function clearCart(userId) {
  await Cart.updateOne({ user: userId }, { items: [] });
}
