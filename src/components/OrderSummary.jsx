import { formatPrice } from '../lib/format.js';

/** Displays server-computed totals; works for both `CartPricing` and `Order`. */
export function OrderSummary({ totals, coupon, children }) {
  const freeShippingGap =
    totals.freeShippingThresholdCents !== undefined && totals.shippingCents > 0
      ? totals.freeShippingThresholdCents - (totals.subtotalCents - totals.discountCents)
      : 0;

  const row = 'flex justify-between text-sm';
  return (
    <div className="card space-y-2 p-5">
      <h2 className="mb-2 font-semibold">Order summary</h2>
      <div className={row}>
        <span className="text-slate-600">Subtotal</span>
        <span className="tabular-nums">{formatPrice(totals.subtotalCents)}</span>
      </div>
      {totals.discountCents > 0 && (
        <div className={`${row} text-emerald-700`}>
          <span>Discount{coupon ? ` (${coupon.code})` : ''}</span>
          <span className="tabular-nums">−{formatPrice(totals.discountCents)}</span>
        </div>
      )}
      <div className={row}>
        <span className="text-slate-600">Shipping</span>
        <span className="tabular-nums">
          {totals.shippingCents === 0 ? 'Free' : formatPrice(totals.shippingCents)}
        </span>
      </div>
      <div className={row}>
        <span className="text-slate-600">Tax</span>
        <span className="tabular-nums">{formatPrice(totals.taxCents)}</span>
      </div>
      <div className="flex justify-between border-t border-slate-200 pt-3 font-semibold">
        <span>Total</span>
        <span className="tabular-nums">{formatPrice(totals.totalCents)}</span>
      </div>
      {freeShippingGap > 0 && (
        <p className="rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700">
          Add {formatPrice(freeShippingGap)} more for free shipping.
        </p>
      )}
      {children}
    </div>
  );
}
