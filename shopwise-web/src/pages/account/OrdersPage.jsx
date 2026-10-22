import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronRight, Package } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { orderApi } from '../../api/endpoints.js';
import {
  EmptyState,
  ErrorState,
  PageLoader,
  Pagination,
  StatusBadge,
} from '../../components/ui.jsx';
import { formatDate, formatPrice } from '../../lib/format.js';
import { AccountShell } from './AccountNav.jsx';

const STATUSES = ['', 'pending', 'paid', 'shipped', 'delivered', 'cancelled'];

export function OrdersPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const orders = useQuery({
    queryKey: ['my-orders', { page, status }],
    queryFn: () => orderApi.mine({ page, status, limit: 10 }),
    placeholderData: keepPreviousData,
  });

  return (
    <AccountShell
      title="Your orders"
      actions={
        <select
          className="input w-auto"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by status"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s ? s[0].toUpperCase() + s.slice(1) : 'All orders'}
            </option>
          ))}
        </select>
      }
    >
      {orders.isPending && <PageLoader />}
      {orders.isError && <ErrorState error={orders.error} onRetry={orders.refetch} />}
      {orders.data?.items.length === 0 && (
        <EmptyState
          icon={Package}
          title="No orders yet"
          action={
            <Link to="/products" className="btn-primary">
              Start shopping
            </Link>
          }
        />
      )}
      <div className="space-y-3">
        {orders.data?.items.map((o) => (
          <Link
            key={o._id}
            to={`/account/orders/${o._id}`}
            className="card flex items-center gap-4 p-4 transition hover:border-brand-300"
          >
            <div className="flex w-[84px] shrink-0 -space-x-3">
              {o.items.slice(0, 3).map((item, i) => (
                <div
                  key={i}
                  className="size-12 overflow-hidden rounded-lg border-2 border-white bg-slate-100"
                >
                  {item.image && <img src={item.image} alt="" className="size-full object-cover" />}
                </div>
              ))}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-mono text-sm font-medium">{o.orderNumber}</p>
              <p className="text-xs text-slate-500">
                {formatDate(o.createdAt)} · {o.items.reduce((n, i) => n + i.quantity, 0)} items
              </p>
            </div>
            <div className="text-right">
              <p className="font-semibold">{formatPrice(o.totalCents)}</p>
              <StatusBadge status={o.orderStatus} />
            </div>
            <ChevronRight className="size-4 text-slate-400" />
          </Link>
        ))}
      </div>
      <Pagination meta={orders.data?.meta} onPageChange={setPage} />
    </AccountShell>
  );
}
