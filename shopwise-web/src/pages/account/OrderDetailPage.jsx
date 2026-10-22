import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { orderApi } from '../../api/endpoints.js';
import { OrderDetails } from '../../components/OrderDetails.jsx';
import { ErrorState, PageLoader } from '../../components/ui.jsx';
import { errorMessage } from '../../lib/api.js';
import { NotFoundPage } from '../NotFoundPage.jsx';

export function OrderDetailPage() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const order = useQuery({ queryKey: ['my-order', id], queryFn: () => orderApi.get(id) });
  const cancel = useMutation({
    mutationFn: () => orderApi.cancel(id),
    onSuccess: (data) => {
      queryClient.setQueryData(['my-order', id], data);
      queryClient.invalidateQueries({ queryKey: ['my-orders'] });
      toast.success('Order cancelled');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (order.isPending) return <PageLoader />;
  if (order.isError) {
    if (order.error.response?.status === 404) return <NotFoundPage what="order" />;
    return <ErrorState error={order.error} onRetry={order.refetch} />;
  }
  const o = order.data;
  // API.md: customers can cancel only pending + unpaid orders.
  const cancellable = o.orderStatus === 'pending' && o.paymentStatus === 'unpaid';

  return (
    <div>
      <Link
        to="/account/orders"
        className="mb-4 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="size-4" /> All orders
      </Link>
      <h1 className="mb-6 text-2xl font-bold">
        Order <span className="font-mono">{o.orderNumber}</span>
      </h1>
      <OrderDetails order={o}>
        {cancellable && (
          <div className="card p-4 text-sm">
            <p className="text-slate-600">This order hasn’t been paid yet.</p>
            <button
              className="btn-secondary mt-3 w-full text-red-600"
              disabled={cancel.isPending}
              onClick={() => window.confirm('Cancel this order?') && cancel.mutate()}
            >
              Cancel order
            </button>
          </div>
        )}
      </OrderDetails>
    </div>
  );
}
