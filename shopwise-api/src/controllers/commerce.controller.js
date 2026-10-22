import * as cartService from '../services/cart.service.js';
import * as checkoutService from '../services/checkout.service.js';
import * as couponService from '../services/coupon.service.js';
import { priceCart } from '../services/pricing.service.js';
import { AppError } from '../utils/AppError.js';
import { sendCreated, sendSuccess } from '../utils/apiResponse.js';

// --- Cart ---

/** Stateless pricing for any cart (guests included). */
export async function validateCart(req, res) {
  const { items, couponCode } = req.validated.body;
  sendSuccess(res, { data: await priceCart(items, { couponCode }) });
}

export async function getCart(req, res) {
  sendSuccess(res, { data: await cartService.getCart(req.user.id) });
}

export async function replaceCart(req, res) {
  sendSuccess(res, { data: await cartService.replaceCart(req.user.id, req.validated.body.items) });
}

export async function mergeCart(req, res) {
  sendSuccess(res, { data: await cartService.mergeCart(req.user.id, req.validated.body.items) });
}

export async function clearCart(req, res) {
  await cartService.clearCart(req.user.id);
  sendSuccess(res, { message: 'Cart cleared' });
}

// --- Coupons ---

export async function validateCoupon(req, res) {
  const { code, items } = req.validated.body;
  const pricing = await priceCart(items, { couponCode: code });
  if (pricing.couponError) {
    throw new AppError(pricing.couponError.message, 400, pricing.couponError.code);
  }
  sendSuccess(res, {
    data: { coupon: pricing.coupon, discountCents: pricing.discountCents, totals: pricing },
    message: 'Coupon applied',
  });
}

export async function listCoupons(req, res) {
  const { items, meta } = await couponService.listCoupons(req.validated.query);
  sendSuccess(res, { data: items, meta });
}

export async function createCoupon(req, res) {
  sendCreated(res, {
    data: await couponService.createCoupon(req.validated.body),
    message: 'Coupon created',
  });
}

export async function updateCoupon(req, res) {
  const coupon = await couponService.updateCoupon(req.validated.params.id, req.validated.body);
  sendSuccess(res, { data: coupon, message: 'Coupon updated' });
}

export async function deleteCoupon(req, res) {
  await couponService.deleteCoupon(req.validated.params.id);
  sendSuccess(res, { message: 'Coupon deleted' });
}

// --- Checkout ---

export async function createCheckoutSession(req, res) {
  const session = await checkoutService.createCheckoutSession(req.user, req.validated.body);
  sendCreated(res, { data: session, message: 'Redirect to the checkout URL to pay' });
}
