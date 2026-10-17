import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { adminApi } from '../../api/endpoints.js';
import { OrderDetails } from '../../components/OrderDetails.jsx';
import { ErrorState, Field, FormError, PageLoader } from '../../components/ui.jsx';
import { AdminHeader } from './AdminLayout.jsx';

/** Mirrors the API's ORDER_TRANSITIONS for admins; the server stays the authority (409 otherwise). */
const NEXT = {
  pending: ['cancelled'],
  paid: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};
const LABELS = {
  shipped: 'Mark as shipped',
  delivered: 'Mark as delivered',
  cancelled: 'Cancel order',
};

function StatusPanel({ order }) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const mutation = useMutation({
    mutationFn: (status) =>
      adminApi.setOrderStatus(order._id, { status, note: note.trim() || undefined }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['admin-order', order._id], updated);
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
      setNote('');
      toast.success(`Order ${updated.orderStatus}`);
    },
  });
  const options = NEXT[order.orderStatus] ?? [];
  if (options.length === 0) return null;

  return (
    <div className="card space-y-3 p-4">
      <h2 className="font-semibold">Update status</h2>
      <Field label="Note (optional)">
        <input
          className="input"
          maxLength={300}
          placeholder="Tracking number, reason…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
      <FormError error={mutation.error} />
      <div className="flex flex-col gap-2">
        {options.map((status) => (
          <button
            key={status}
            className={status === 'cancelled' ? 'btn-secondary text-red-600' : 'btn-primary'}
            disabled={mutation.isPending}
            onClick={() => {
              const refund = status === 'cancelled' && order.paymentStatus === 'paid';
              if (
                status !== 'cancelled' ||
                window.confirm(
                  refund ? 'Cancel and refund this order through Stripe?' : 'Cancel this order?',
                )
              ) {
                mutation.mutate(status);
              }
            }}
          >
            {LABELS[status]}
            {status === 'cancelled' && order.paymentStatus === 'paid' && ' & refund'}
          </button>
        ))}
      </div>
    </div>
  );
}

export function AdminOrderDetail() {
  const { id } = useParams();
  const order = useQuery({ queryKey: ['admin-order', id], queryFn: () => adminApi.order(id) });

  if (order.isPending) return <PageLoader />;
  if (order.isError) return <ErrorState error={order.error} onRetry={order.refetch} />;
  const o = order.data;

  return (
    <>
      <Link
        to="/admin/orders"
        className="mb-4 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="size-4" /> Orders
      </Link>
      <AdminHeader title={<span className="font-mono">{o.orderNumber}</span>} />
      {o.needsAttention && (
        <div className="mb-6 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="size-4 shrink-0" />
          <span>
            <strong>Needs attention:</strong> {o.needsAttention.reason}
            {o.needsAttention.details && (
              <span className="block text-xs">
                {typeof o.needsAttention.details === 'string'
                  ? o.needsAttention.details
                  : JSON.stringify(o.needsAttention.details)}
              </span>
            )}
          </span>
        </div>
      )}
      <OrderDetails order={o} productLink={false}>
        <div className="card p-4 text-sm">
          <h2 className="mb-1 font-semibold">Customer</h2>
          <p>{o.user?.name}</p>
          <p className="text-slate-500">{o.user?.email}</p>
        </div>
        <StatusPanel order={o} />
      </OrderDetails>
    </>
  );
}
