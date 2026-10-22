import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, Truck } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { adminApi } from '../../api/endpoints.js';
import { ErrorState, PageLoader, Pagination, StatusBadge } from '../../components/ui.jsx';
import { errorMessage } from '../../lib/api.js';
import { formatDateTime, formatPrice } from '../../lib/format.js';
import { AdminHeader } from './AdminLayout.jsx';

/** One-click paid → shipped from the list; other transitions live on the order detail page. */
function MarkShippedButton({ order }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => adminApi.setOrderStatus(order._id, { status: 'shipped' }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['admin-order', order._id], updated);
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
      toast.success(`${updated.orderNumber} marked as shipped`);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <button
      className="btn-secondary px-2.5 py-1 text-xs whitespace-nowrap"
      disabled={mutation.isPending}
      onClick={() => mutation.mutate()}
    >
      <Truck className="size-3.5" />
      {mutation.isPending ? 'Saving…' : 'Mark shipped'}
    </button>
  );
}

export function AdminOrders() {
  const [filters, setFilters] = useState({
    q: '',
    status: '',
    paymentStatus: '',
    sort: '-createdAt',
    page: 1,
  });
  const [q, setQ] = useState('');
  const orders = useQuery({
    queryKey: ['admin-orders', filters],
    queryFn: () => adminApi.orders({ ...filters, limit: 20 }),
    placeholderData: keepPreviousData,
  });
  const update = (changes) => setFilters((f) => ({ ...f, page: 1, ...changes }));

  return (
    <>
      <AdminHeader title="Orders" />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <form
          className="relative"
          onSubmit={(e) => {
            e.preventDefault();
            update({ q });
          }}
        >
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <input
            className="input w-72 pl-9"
            placeholder="Order number, name or email"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </form>
        <select
          className="input w-auto"
          value={filters.status}
          onChange={(e) => update({ status: e.target.value })}
          aria-label="Order status"
        >
          <option value="">All statuses</option>
          {['pending', 'paid', 'shipped', 'delivered', 'cancelled'].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          className="input w-auto"
          value={filters.paymentStatus}
          onChange={(e) => update({ paymentStatus: e.target.value })}
          aria-label="Payment status"
        >
          <option value="">All payments</option>
          {['unpaid', 'paid', 'failed', 'refunded'].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          className="input w-auto"
          value={filters.sort}
          onChange={(e) => update({ sort: e.target.value })}
          aria-label="Sort"
        >
          <option value="-createdAt">Newest</option>
          <option value="createdAt">Oldest</option>
          <option value="-totalCents">Highest total</option>
          <option value="totalCents">Lowest total</option>
        </select>
      </div>

      {orders.isPending && <PageLoader />}
      {orders.isError && <ErrorState error={orders.error} onRetry={orders.refetch} />}
      {orders.data && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Order</th>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Payment</th>
                <th className="px-4 py-3 font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orders.data.items.map((o) => (
                <tr key={o._id} className="hover:bg-slate-50">
                  <td className="px-4 py-2">
                    <Link
                      to={`/admin/orders/${o._id}`}
                      className="font-mono font-medium text-brand-700 hover:underline"
                    >
                      {o.orderNumber}
                    </Link>
                    {o.needsAttention && (
                      <span className="ml-2 text-amber-600" title={o.needsAttention.reason}>
                        ⚠
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <p>{o.user?.name}</p>
                    <p className="text-xs text-slate-500">{o.user?.email}</p>
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap text-slate-600">
                    {formatDateTime(o.createdAt)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatPrice(o.totalCents)}</td>
                  <td className="px-4 py-2">
                    <StatusBadge status={o.orderStatus} />
                  </td>
                  <td className="px-4 py-2">
                    <StatusBadge status={o.paymentStatus} />
                  </td>
                  <td className="px-4 py-2 text-right">
                    {o.orderStatus === 'paid' && <MarkShippedButton order={o} />}
                  </td>
                </tr>
              ))}
              {orders.data.items.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    No orders found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <Pagination
        meta={orders.data?.meta}
        onPageChange={(page) => setFilters((f) => ({ ...f, page }))}
      />
    </>
  );
}
