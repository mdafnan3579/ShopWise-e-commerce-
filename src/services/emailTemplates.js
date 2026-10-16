import { formatMoney } from '../utils/money.js';

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** User-controlled values (names, addresses) are escaped before going into HTML. */
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

export function renderOrderConfirmation(order, user, clientUrl) {
  const money = (cents) => formatMoney(cents, order.currency);
  const orderUrl = `${clientUrl}/orders/${order._id}`;
  const subject = `Your ShopWise order ${order.orderNumber} is confirmed`;

  const rows = order.items
    .map(
      (item) => `
        <tr>
          <td style="padding:8px 0">${escapeHtml(item.name)} × ${item.quantity}</td>
          <td style="padding:8px 0;text-align:right">${money(item.lineTotalCents)}</td>
        </tr>`,
    )
    .join('');

  const totals = [
    ['Subtotal', order.subtotalCents],
    ...(order.discountCents
      ? [[`Discount (${escapeHtml(order.coupon?.code)})`, -order.discountCents]]
      : []),
    ['Shipping', order.shippingCents],
    ['Tax', order.taxCents],
  ]
    .map(
      ([label, cents]) =>
        `<tr><td style="color:#64748b">${label}</td><td style="text-align:right;color:#64748b">${money(cents)}</td></tr>`,
    )
    .join('');

  const address = order.shippingAddress;
  const html = `<!doctype html>
<html><body style="font-family:Arial,sans-serif;background:#f8fafc;padding:24px;color:#0f172a">
  <div style="max-width:560px;margin:auto;background:#fff;border-radius:12px;padding:32px">
    <h1 style="margin-top:0;font-size:22px">Thanks for your order, ${escapeHtml(user.name)}!</h1>
    <p>Your payment was received and order <strong>${escapeHtml(order.orderNumber)}</strong> is being prepared.</p>
    <table style="width:100%;border-collapse:collapse;border-top:1px solid #e2e8f0">${rows}</table>
    <table style="width:100%;margin-top:12px">${totals}
      <tr><td style="font-weight:bold;padding-top:8px">Total</td>
          <td style="font-weight:bold;text-align:right;padding-top:8px">${money(order.totalCents)}</td></tr>
    </table>
    <h2 style="font-size:16px;margin-top:24px">Shipping to</h2>
    <p style="margin:0;color:#334155">${escapeHtml(address.fullName)}<br>${escapeHtml(address.line1)}${
      address.line2 ? `<br>${escapeHtml(address.line2)}` : ''
    }<br>${escapeHtml(address.city)} ${escapeHtml(address.postalCode)}<br>${escapeHtml(address.country)}</p>
    <p style="margin-top:24px"><a href="${escapeHtml(orderUrl)}" style="background:#4f46e5;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">View your order</a></p>
  </div>
</body></html>`;

  const text = [
    `Thanks for your order, ${user.name}!`,
    `Order ${order.orderNumber}`,
    ...order.items.map((i) => `- ${i.name} x ${i.quantity}: ${money(i.lineTotalCents)}`),
    `Total: ${money(order.totalCents)}`,
    `View your order: ${orderUrl}`,
  ].join('\n');

  return { subject, html, text };
}
