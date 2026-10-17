import { Check } from 'lucide-react';
import { Link } from 'react-router';
import { capitalize, formatDateTime, formatPrice } from '../lib/format.js';
import { OrderSummary } from './OrderSummary.jsx';
import { StatusBadge } from './ui.jsx';

const FLOW = ['pending', 'paid', 'shipped', 'delivered'];

function Timeline({ order }) {
  if (order.orderStatus === 'cancelled') {
    return (
      <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">
        This order was cancelled on {formatDateTime(order.cancelledAt)}.
        {order.paymentStatus === 'refunded' && ' Your payment has been refunded.'}
      </p>
    );
  }
  const current = FLOW.indexOf(order.orderStatus);
  return (
    <ol className="flex items-center">
      {FLOW.map((step, i) => (
        <li key={step} className="flex flex-1 items-center last:flex-none">
          <div className="flex flex-col items-center gap-1">
            <span
              className={`flex size-7 items-center justify-center rounded-full text-xs font-semibold ${i <= current ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-500'}`}
            >
              {i <= current ? <Check className="size-4" /> : i + 1}
            </span>
            <span className="text-xs text-slate-600">{capitalize(step)}</span>
          </div>
          {i < FLOW.length - 1 && (
            <span
              className={`mx-2 mb-5 h-0.5 flex-1 ${i < current ? 'bg-brand-600' : 'bg-slate-200'}`}
            />
          )}
        </li>
      ))}
    </ol>
  );
}

export function OrderDetails({ order, productLink = true, children }) {
  const a = order.shippingAddress;
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="space-y-6">
        <section className="card p-5">
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <StatusBadge status={order.orderStatus} />
            <StatusBadge status={order.paymentStatus} />
            <span className="text-sm text-slate-500">Placed {formatDateTime(order.createdAt)}</span>
          </div>
          <Timeline order={order} />
        </section>

        <section className="card p-5">
          <h2 className="mb-3 font-semibold">Items</h2>
          <ul className="divide-y divide-slate-100">
            {order.items.map((item, i) => (
              <li key={i} className="flex items-center gap-3 py-3 text-sm">
                <div className="size-14 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                  {item.image && <img src={item.image} alt="" className="size-full object-cover" />}
                </div>
                <div className="flex-1">
                  {productLink && item.slug ? (
                    <Link
                      to={`/products/${item.slug}`}
                      className="font-medium hover:text-brand-700"
                    >
                      {item.name}
                    </Link>
                  ) : (
                    <span className="font-medium">{item.name}</span>
                  )}
                  <p className="text-slate-500">
                    {formatPrice(item.priceCents)} × {item.quantity}
                  </p>
                </div>
                <span className="font-medium tabular-nums">{formatPrice(item.lineTotalCents)}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card p-5 text-sm">
          <h2 className="mb-2 font-semibold">Shipping to</h2>
          <p>{a.fullName}</p>
          <p className="text-slate-600">
            {a.line1}
            {a.line2 && `, ${a.line2}`}, {a.city}
            {a.state && `, ${a.state}`} {a.postalCode}, {a.country}
          </p>
          {a.phone && <p className="text-slate-600">{a.phone}</p>}
        </section>

        {order.statusHistory?.length > 0 && (
          <section className="card p-5 text-sm">
            <h2 className="mb-2 font-semibold">History</h2>
            <ul className="space-y-1.5">
              {order.statusHistory.map((h, i) => (
                <li key={i} className="flex gap-3">
                  <span className="w-44 shrink-0 text-slate-500">{formatDateTime(h.at)}</span>
                  <span>
                    {capitalize(h.status)}
                    {h.note && <span className="text-slate-500"> · {h.note}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      <div className="space-y-4 lg:self-start">
        <OrderSummary totals={order} coupon={order.coupon} />
        {children}
      </div>
    </div>
  );
}
