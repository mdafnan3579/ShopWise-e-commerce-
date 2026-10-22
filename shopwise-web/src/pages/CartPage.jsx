import { useMutation } from '@tanstack/react-query';
import { AlertTriangle, ShoppingCart, Tag, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { cartApi } from '../api/endpoints.js';
import { OrderSummary } from '../components/OrderSummary.jsx';
import { EmptyState, ErrorState, PageLoader, Price } from '../components/ui.jsx';
import { errorMessage } from '../lib/api.js';
import { useCartPricing } from '../lib/hooks.js';
import { useAuthStore } from '../stores/authStore.js';
import { MAX_QUANTITY, useCartStore } from '../stores/cartStore.js';

function CouponForm() {
  const items = useCartStore((s) => s.items);
  const couponCode = useCartStore((s) => s.couponCode);
  const setCoupon = useCartStore((s) => s.setCoupon);
  const [code, setCode] = useState('');

  // `/coupons/validate` returns the precise rejection reason (API.md §4 Cart & coupons).
  const apply = useMutation({
    mutationFn: (c) => cartApi.validateCoupon(c, items),
    onSuccess: ({ coupon }) => {
      setCoupon(coupon.code);
      setCode('');
      toast.success(`Coupon ${coupon.code} applied`);
    },
  });

  if (couponCode) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm">
        <span className="flex items-center gap-2 font-medium text-emerald-800">
          <Tag className="size-4" /> {couponCode}
        </span>
        <button
          onClick={() => setCoupon(null)}
          className="text-emerald-800 hover:text-emerald-950"
          aria-label="Remove coupon"
        >
          <X className="size-4" />
        </button>
      </div>
    );
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (code.trim()) apply.mutate(code.trim().toUpperCase());
      }}
    >
      <div className="flex gap-2">
        <input
          className="input uppercase"
          placeholder="Coupon code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          maxLength={30}
          aria-label="Coupon code"
        />
        <button className="btn-secondary" disabled={apply.isPending || !code.trim()}>
          Apply
        </button>
      </div>
      {apply.error && <p className="mt-1 text-xs text-red-600">{errorMessage(apply.error)}</p>}
      <p className="mt-1 text-xs text-slate-500">Try WELCOME10 or SAVE20.</p>
    </form>
  );
}

export function CartPage() {
  const items = useCartStore((s) => s.items);
  const setQuantity = useCartStore((s) => s.setQuantity);
  const remove = useCartStore((s) => s.remove);
  const setCoupon = useCartStore((s) => s.setCoupon);
  const status = useAuthStore((s) => s.status);
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const pricing = useCartPricing();

  useEffect(() => {
    if (params.get('checkout') === 'cancelled') {
      toast.info('Checkout cancelled. Your cart is still here.');
      setParams({}, { replace: true });
    }
  }, [params, setParams]);

  // The server dropped a coupon that no longer applies: surface it once and clear it.
  const couponError = pricing.data?.couponError;
  useEffect(() => {
    if (couponError) {
      toast.error(couponError.message);
      setCoupon(null);
    }
  }, [couponError, setCoupon]);

  if (items.length === 0) {
    return (
      <EmptyState
        icon={ShoppingCart}
        title="Your cart is empty"
        action={
          <Link to="/products" className="btn-primary">
            Start shopping
          </Link>
        }
      >
        Browse the shop or ask the AI assistant for ideas.
      </EmptyState>
    );
  }
  if (pricing.isPending) return <PageLoader />;
  if (pricing.isError) return <ErrorState error={pricing.error} onRetry={pricing.refetch} />;

  const data = pricing.data;
  const issuesById = Object.fromEntries(data.issues.map((i) => [i.productId, i]));
  const pricedIds = new Set(data.items.map((i) => i.productId));
  const unavailable = data.issues.filter((i) => !pricedIds.has(i.productId));
  const blocked = data.issues.length > 0;

  const checkout = () => {
    if (status !== 'authenticated') {
      toast.info('Sign in to check out. Your cart will be saved.');
      navigate('/login', { state: { from: '/checkout' } });
    } else navigate('/checkout');
  };

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Shopping cart</h1>
      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        <div className={`space-y-3 ${pricing.isPlaceholderData ? 'opacity-60' : ''}`}>
          {data.items.map((line) => {
            const issue = issuesById[line.productId];
            const maxQty = Math.max(1, Math.min(MAX_QUANTITY, line.stock));
            return (
              <div key={line.productId} className="card flex gap-4 p-4">
                <Link
                  to={`/products/${line.slug}`}
                  className="size-24 shrink-0 overflow-hidden rounded-lg bg-slate-100"
                >
                  {line.image && <img src={line.image} alt="" className="size-full object-cover" />}
                </Link>
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex justify-between gap-2">
                    <Link
                      to={`/products/${line.slug}`}
                      className="font-medium hover:text-brand-700"
                    >
                      {line.name}
                    </Link>
                    <Price cents={line.lineTotalCents} />
                  </div>
                  <p className="text-sm text-slate-500">
                    <Price cents={line.priceCents} className="font-normal" /> each
                  </p>
                  {issue && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-amber-700">
                      <AlertTriangle className="size-3.5" /> {issue.message}
                    </p>
                  )}
                  <div className="mt-auto flex items-center gap-3 pt-2">
                    <select
                      className="input w-20 py-1"
                      value={line.quantity}
                      onChange={(e) => setQuantity(line.productId, Number(e.target.value))}
                      aria-label={`Quantity for ${line.name}`}
                    >
                      {Array.from({ length: Math.max(maxQty, line.quantity) }, (_, i) => i + 1).map(
                        (n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ),
                      )}
                    </select>
                    <button
                      onClick={() => remove(line.productId)}
                      className="flex items-center gap-1 text-sm text-slate-500 hover:text-red-600"
                    >
                      <Trash2 className="size-4" /> Remove
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {unavailable.map((issue) => (
            <div
              key={issue.productId}
              className="card flex items-center justify-between gap-3 border-amber-200 bg-amber-50 p-4 text-sm"
            >
              <span className="flex items-center gap-2 text-amber-800">
                <AlertTriangle className="size-4" /> {issue.message}
              </span>
              <button onClick={() => remove(issue.productId)} className="btn-secondary py-1">
                Remove
              </button>
            </div>
          ))}
        </div>

        <div className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <OrderSummary totals={data} coupon={data.coupon}>
            <div className="pt-3">
              <CouponForm />
            </div>
            <button className="btn-primary mt-3 w-full py-3" disabled={blocked} onClick={checkout}>
              {status === 'authenticated' ? 'Proceed to checkout' : 'Sign in to check out'}
            </button>
            {blocked && (
              <p className="text-xs text-amber-700">Fix the highlighted items to continue.</p>
            )}
          </OrderSummary>
        </div>
      </div>
    </div>
  );
}
