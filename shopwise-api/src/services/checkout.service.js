import { CHECKOUT_SESSION_TTL_MINUTES } from '../config/commerce.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { getStripe } from '../config/stripe.js';
import { Order } from '../models/Order.js';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { priceCart } from './pricing.service.js';

// Tags sessions created by this integration in the Stripe Dashboard.
const INTEGRATION_IDENTIFIER = 'shopwise_web_checkout_qkzmrtvb';

async function resolveShippingAddress(userId, { addressId, shippingAddress }) {
  if (shippingAddress) return shippingAddress;

  const user = await User.findById(userId).select('addresses').lean();
  const saved = user?.addresses?.find((a) => String(a._id) === addressId);
  if (!saved) throw AppError.notFound('Address');

  const { _id, label: _label, isDefault: _isDefault, ...address } = saved;
  return address;
}

/** Translates our computed totals into Stripe line items so Stripe charges exactly our total. */
function buildStripeLineItems(pricing) {
  const lineItems = pricing.items.map((item) => ({
    quantity: item.quantity,
    price_data: {
      currency: pricing.currency,
      unit_amount: item.priceCents,
      product_data: {
        name: item.name,
        ...(item.image?.startsWith('https://') && { images: [item.image] }),
        metadata: { productId: item.productId },
      },
    },
  }));

  if (pricing.taxCents > 0) {
    lineItems.push({
      quantity: 1,
      price_data: {
        currency: pricing.currency,
        unit_amount: pricing.taxCents,
        product_data: { name: 'Estimated sales tax' },
      },
    });
  }
  return lineItems;
}

/**
 * Creates a pending order and a Stripe Checkout Session for it.
 *
 * Prices are recomputed server-side from the catalog (the client sends only ids and quantities).
 * Stock is not decremented here: that happens only in the verified webhook once payment
 * succeeds, so abandoned checkouts never lock inventory.
 */
export async function createCheckoutSession(
  user,
  { items, couponCode, addressId, shippingAddress },
) {
  const stripe = getStripe(); // fail fast (503) before creating an order if Stripe is not configured

  const pricing = await priceCart(items, { couponCode });
  if (pricing.items.length === 0 && pricing.issues.length === 0) {
    throw new AppError('Your cart is empty', 400, 'EMPTY_CART');
  }
  if (pricing.issues.length > 0) {
    throw new AppError(
      'Some items in your cart need attention',
      409,
      'CART_ISSUES',
      pricing.issues,
    );
  }
  if (pricing.couponError) {
    throw new AppError(pricing.couponError.message, 400, pricing.couponError.code);
  }

  const address = await resolveShippingAddress(user.id, { addressId, shippingAddress });

  const order = await Order.create({
    user: user.id,
    items: pricing.items.map(
      ({ productId, name, slug, image, priceCents, quantity, lineTotalCents }) => ({
        product: productId,
        name,
        slug,
        image,
        priceCents,
        quantity,
        lineTotalCents,
      }),
    ),
    shippingAddress: address,
    subtotalCents: pricing.subtotalCents,
    discountCents: pricing.discountCents,
    taxCents: pricing.taxCents,
    shippingCents: pricing.shippingCents,
    totalCents: pricing.totalCents,
    currency: pricing.currency,
    coupon: pricing.coupon
      ? {
          code: pricing.coupon.code,
          discountType: pricing.coupon.discountType,
          value: pricing.coupon.value,
        }
      : undefined,
  });

  const orderId = String(order._id);
  const clientUrl = env.CLIENT_URL[0];
  const customer = await User.findById(user.id).select('email').lean();

  try {
    // A one-off Stripe coupon carries our exact discount, so Stripe's total matches ours.
    const discounts = [];
    if (pricing.discountCents > 0) {
      const stripeCoupon = await stripe.coupons.create(
        {
          amount_off: pricing.discountCents,
          currency: pricing.currency,
          duration: 'once',
          max_redemptions: 1,
          name: pricing.coupon.code,
        },
        { idempotencyKey: `coupon-${orderId}` },
      );
      discounts.push({ coupon: stripeCoupon.id });
    }

    const session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        integration_identifier: INTEGRATION_IDENTIFIER,
        line_items: buildStripeLineItems(pricing),
        ...(discounts.length && { discounts }),
        shipping_options: [
          {
            shipping_rate_data: {
              type: 'fixed_amount',
              display_name: pricing.shippingCents === 0 ? 'Free shipping' : 'Standard shipping',
              fixed_amount: { amount: pricing.shippingCents, currency: pricing.currency },
            },
          },
        ],
        customer_email: customer?.email,
        client_reference_id: orderId,
        metadata: { orderId, userId: String(user.id) },
        payment_intent_data: { metadata: { orderId } },
        success_url: `${clientUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${clientUrl}/cart?checkout=cancelled`,
        expires_at: Math.floor(Date.now() / 1000) + CHECKOUT_SESSION_TTL_MINUTES * 60,
      },
      // Retries of this call (network blips) can never create a second session for the order.
      { idempotencyKey: `checkout-${orderId}` },
    );

    order.stripeSessionId = session.id;
    await order.save();

    return { orderId, orderNumber: order.orderNumber, sessionId: session.id, url: session.url };
  } catch (err) {
    logger.error({ err, orderId }, 'Stripe Checkout Session creation failed');
    order.orderStatus = 'cancelled';
    order.cancelledAt = new Date();
    order.statusHistory.push({ status: 'cancelled', note: 'Payment provider error at checkout' });
    await order.save();

    if (err instanceof AppError) throw err;
    throw new AppError(
      'Could not start checkout with the payment provider, please try again',
      502,
      'PAYMENT_PROVIDER_ERROR',
    );
  }
}
