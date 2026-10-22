import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Clock } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router';
import { orderApi } from '../api/endpoints.js';
import { ErrorState, PageLoader, Spinner } from '../components/ui.jsx';
import { formatPrice } from '../lib/format.js';
import { useCartStore } from '../stores/cartStore.js';

const POLL_MS = 2000;
const GIVE_UP_MS = 30_000;

/**
 * API.md checkout flow step 3: the webhook that marks the order paid can lag the redirect,
 * so poll while `paymentStatus === 'unpaid'` and stop after ~30 s.
 */
export function CheckoutSuccessPage() {
  const [params] = useSearchParams();
  const sessionId = params.get('session_id');
  const clearCart = useCartStore((s) => s.clear);
  const [startedAt] = useState(() => Date.now());
  const [timedOut, setTimedOut] = useState(false);

  const order = useQuery({
    queryKey: ['order-by-session', sessionId],
    queryFn: () => orderApi.bySession(sessionId),
    enabled: !!sessionId,
    refetchInterval: (query) =>
      query.state.data?.paymentStatus === 'unpaid' && Date.now() - startedAt < GIVE_UP_MS
        ? POLL_MS
        : false,
  });

  const paid = order.data?.paymentStatus === 'paid';
  useEffect(() => {
    if (paid) clearCart();
  }, [paid, clearCart]);

  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), GIVE_UP_MS);
    return () => clearTimeout(timer);
  }, []);

  if (!sessionId) return <Navigate to="/" replace />;
  if (order.isPending) return <PageLoader />;
  if (order.isError) return <ErrorState error={order.error} title="We couldn’t find that order" />;

  const o = order.data;
  return (
    <div className="card mx-auto max-w-xl p-8 text-center">
      {paid ? (
        <CheckCircle2 className="mx-auto size-14 text-emerald-500" />
      ) : (
        <Clock className="mx-auto size-14 text-amber-500" />
      )}
      <h1 className="mt-4 text-2xl font-bold">
        {paid ? 'Thank you for your order!' : 'Payment processing'}
      </h1>
      <p className="mt-2 text-slate-600">
        Order <span className="font-mono font-medium">{o.orderNumber}</span> ·{' '}
        {formatPrice(o.totalCents)}
      </p>
      {!paid && (
        <p className="mt-4 flex items-center justify-center gap-2 text-sm text-slate-500">
          {timedOut ? (
            'This is taking longer than usual. We’ll update your order as soon as Stripe confirms.'
          ) : (
            <>
              <Spinner className="size-4" /> Waiting for Stripe to confirm your payment…
            </>
          )}
        </p>
      )}
      {paid && <p className="mt-4 text-sm text-slate-500">A confirmation email is on its way.</p>}
      <div className="mt-8 flex justify-center gap-3">
        <Link to={`/account/orders/${o._id}`} className="btn-primary">
          View order
        </Link>
        <Link to="/products" className="btn-secondary">
          Keep shopping
        </Link>
      </div>
    </div>
  );
}
