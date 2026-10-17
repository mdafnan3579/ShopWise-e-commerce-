import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, TrendingDown, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { adminApi } from '../../api/endpoints.js';
import { ErrorState, PageLoader } from '../../components/ui.jsx';
import { capitalize, formatDate, formatPercent, formatPrice } from '../../lib/format.js';
import { AdminHeader } from './AdminLayout.jsx';

const RANGES = [
  { days: 7, label: '7 days', granularity: 'day' },
  { days: 30, label: '30 days', granularity: 'day' },
  { days: 90, label: '90 days', granularity: 'week' },
  { days: 365, label: '12 months', granularity: 'month' },
];
const BRAND = '#4f46e5';

function rangeParams(days, granularity) {
  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);
  return { from: from.toISOString(), to: to.toISOString(), granularity };
}

function StatTile({ label, value, change }) {
  const up = change > 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <div className="card p-5">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
      {change !== undefined && (
        <p
          className={`mt-1 flex items-center gap-1 text-xs ${change === null ? 'text-slate-400' : up ? 'text-emerald-700' : 'text-rose-700'}`}
        >
          {change !== null && change !== 0 && <Icon className="size-3.5" />}
          {change === null ? 'No previous data' : `${formatPercent(change)} vs previous period`}
        </p>
      )}
    </div>
  );
}

function RevenueTooltip({ active, payload, granularity }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-slate-900">
        {granularity === 'month'
          ? formatDate(point.period, { month: 'long', year: 'numeric' })
          : `${granularity === 'week' ? 'Week of ' : ''}${formatDate(point.period)}`}
      </p>
      <p className="mt-1 text-slate-700">Revenue: {formatPrice(point.revenueCents)}</p>
      <p className="text-slate-500">
        {point.orders} order{point.orders === 1 ? '' : 's'} · {point.newCustomers} new customer
        {point.newCustomers === 1 ? '' : 's'}
      </p>
    </div>
  );
}

export function AdminDashboard() {
  const [range, setRange] = useState(RANGES[1]);
  const stats = useQuery({
    queryKey: ['admin-stats', range.days],
    queryFn: () => adminApi.stats(rangeParams(range.days, range.granularity)),
  });

  const filters = (
    <div
      className="flex rounded-lg border border-slate-300 bg-white p-0.5"
      role="group"
      aria-label="Date range"
    >
      {RANGES.map((r) => (
        <button
          key={r.days}
          onClick={() => setRange(r)}
          aria-pressed={r === range}
          className={`rounded-md px-3 py-1.5 text-sm ${r === range ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
        >
          {r.label}
        </button>
      ))}
    </div>
  );

  if (stats.isPending) {
    return (
      <>
        <AdminHeader title="Dashboard">{filters}</AdminHeader>
        <PageLoader />
      </>
    );
  }
  if (stats.isError) return <ErrorState error={stats.error} onRetry={stats.refetch} />;

  const s = stats.data;
  const statusTotal = Object.values(s.ordersByStatus).reduce((a, b) => a + b, 0) || 1;
  const tickFormat = (iso) =>
    range.granularity === 'month'
      ? formatDate(iso, { month: 'short' })
      : formatDate(iso, { month: 'short', day: 'numeric' });

  return (
    <>
      <AdminHeader title="Dashboard">{filters}</AdminHeader>

      {s.ordersNeedingAttention > 0 && (
        <Link
          to="/admin/orders"
          className="mb-6 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
        >
          <AlertTriangle className="size-4" />
          {s.ordersNeedingAttention} order{s.ordersNeedingAttention > 1 ? 's need' : ' needs'}{' '}
          attention
        </Link>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          label="Revenue"
          value={formatPrice(s.totals.revenueCents)}
          change={s.changeVsPreviousPeriod.revenuePercent}
        />
        <StatTile
          label="Orders"
          value={s.totals.orders}
          change={s.changeVsPreviousPeriod.ordersPercent}
        />
        <StatTile
          label="Avg. order value"
          value={formatPrice(s.totals.averageOrderValueCents)}
          change={s.changeVsPreviousPeriod.averageOrderValuePercent}
        />
        <StatTile
          label="New customers"
          value={s.totals.newCustomers}
          change={s.changeVsPreviousPeriod.newCustomersPercent}
        />
      </div>

      <section className="card mt-6 p-5">
        <h2 className="font-semibold">Revenue over time</h2>
        <p className="mb-4 text-xs text-slate-500">Paid orders, by {range.granularity}</p>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={s.revenueOverTime} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={BRAND} stopOpacity={0.18} />
                  <stop offset="100%" stopColor={BRAND} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="#e2e8f0" />
              <XAxis
                dataKey="period"
                tickFormatter={tickFormat}
                tick={{ fontSize: 12, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
                minTickGap={24}
              />
              <YAxis
                tickFormatter={(c) => `$${Math.round(c / 100).toLocaleString()}`}
                tick={{ fontSize: 12, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
                width={64}
              />
              <Tooltip
                content={<RevenueTooltip granularity={range.granularity} />}
                cursor={{ stroke: '#94a3b8', strokeDasharray: '3 3' }}
              />
              <Area
                type="monotone"
                dataKey="revenueCents"
                stroke={BRAND}
                strokeWidth={2}
                fill="url(#revenueFill)"
                activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="card p-5">
          <h2 className="mb-4 font-semibold">Orders by status</h2>
          <ul className="space-y-3">
            {Object.entries(s.ordersByStatus).map(([status, count]) => (
              <li key={status} className="text-sm">
                <div className="mb-1 flex justify-between">
                  <span>{capitalize(status)}</span>
                  <span className="font-medium tabular-nums">{count}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-brand-600"
                    style={{ width: `${(count / statusTotal) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="card p-5 lg:col-span-2">
          <h2 className="mb-3 font-semibold">Top products</h2>
          {s.topProducts.length === 0 ? (
            <p className="text-sm text-slate-500">No sales in this period.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500">
                  <th className="pb-2 font-medium">Product</th>
                  <th className="pb-2 text-right font-medium">Units</th>
                  <th className="pb-2 text-right font-medium">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {s.topProducts.map((p) => (
                  <tr key={p.productId}>
                    <td className="py-2">
                      <Link to={`/admin/products/${p.productId}`} className="hover:text-brand-700">
                        {p.name}
                      </Link>
                    </td>
                    <td className="py-2 text-right tabular-nums">{p.unitsSold}</td>
                    <td className="py-2 text-right tabular-nums">{formatPrice(p.revenueCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <section className="card mt-6 p-5">
        <h2 className="mb-3 font-semibold">Low stock (≤ {s.lowStock.threshold})</h2>
        {s.lowStock.products.length === 0 ? (
          <p className="text-sm text-slate-500">All products are well stocked.</p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {s.lowStock.products.map((p) => (
              <li key={p._id} className="flex items-center justify-between py-2">
                <Link to={`/admin/products/${p._id}`} className="hover:text-brand-700">
                  {p.name}
                </Link>
                <span
                  className={`font-medium ${p.stock === 0 ? 'text-red-600' : 'text-amber-700'}`}
                >
                  {p.stock === 0 ? 'Out of stock' : `${p.stock} left`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
