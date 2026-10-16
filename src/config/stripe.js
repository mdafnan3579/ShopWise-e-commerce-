import Stripe from 'stripe';
import pkg from '../../package.json' with { type: 'json' };
import { AppError } from '../utils/AppError.js';
import { env } from './env.js';

let client;

export function isStripeConfigured() {
  return Boolean(env.STRIPE_SECRET_KEY);
}

/**
 * Lazily created Stripe client instance (the SDK pins its own API version).
 * Without a key, payment endpoints answer 503 instead of crashing the whole API.
 */
export function getStripe() {
  if (!env.STRIPE_SECRET_KEY) {
    throw new AppError('Payments are not configured', 503, 'PAYMENTS_UNAVAILABLE');
  }
  client ??= new Stripe(env.STRIPE_SECRET_KEY, {
    maxNetworkRetries: 2,
    timeout: 20_000,
    appInfo: { name: 'ShopWise API', version: pkg.version },
  });
  return client;
}
