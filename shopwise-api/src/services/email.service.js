import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { renderOrderConfirmation } from './emailTemplates.js';

let transporter;

/**
 * SMTP when configured; otherwise a JSON transport that "sends" by logging, so local
 * development and tests work without any email provider.
 */
function getTransporter() {
  if (transporter) return transporter;

  transporter = env.SMTP_HOST
    ? nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_PORT === 465,
        auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
      })
    : nodemailer.createTransport({ jsonTransport: true });
  return transporter;
}

/** @param {{ to: string, subject: string, html: string, text: string }} message */
export async function sendEmail(message) {
  const info = await getTransporter().sendMail({ from: env.EMAIL_FROM, ...message });
  logger.info(
    {
      to: message.to,
      subject: message.subject,
      messageId: info.messageId,
      delivered: Boolean(env.SMTP_HOST),
    },
    'Email sent',
  );
  return info;
}

/**
 * Order confirmation. Failures are logged, never thrown: a flaky email provider must not
 * fail the webhook (Stripe would retry the whole event) or the customer's order.
 */
export async function sendOrderConfirmation(order, user) {
  try {
    const { subject, html, text } = renderOrderConfirmation(order, user, env.CLIENT_URL[0]);
    await sendEmail({ to: user.email, subject, html, text });
    return true;
  } catch (err) {
    logger.error({ err, orderId: order._id }, 'Failed to send order confirmation email');
    return false;
  }
}
