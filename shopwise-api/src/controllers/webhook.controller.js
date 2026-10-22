import { constructStripeEvent, handleStripeEvent } from '../services/webhook.service.js';

/**
 * Stripe webhook endpoint. Receives the raw body (needed for signature verification).
 * Returns 2xx only once the event is safely processed; any thrown error becomes a 5xx and
 * Stripe retries the delivery.
 */
export async function stripeWebhook(req, res) {
  const event = constructStripeEvent(req.body, req.get('stripe-signature'));
  req.log?.info({ eventId: event.id, type: event.type }, 'Stripe webhook received');

  const outcome = await handleStripeEvent(event);
  res.json({ received: true, ...outcome });
}
