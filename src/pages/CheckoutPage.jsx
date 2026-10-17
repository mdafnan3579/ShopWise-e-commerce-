import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CreditCard, Lock } from 'lucide-react';
import { useState } from 'react';
import { Link, Navigate } from 'react-router';
import { orderApi, userApi } from '../api/endpoints.js';
import { AddressForm } from '../components/AddressForm.jsx';
import { OrderSummary } from '../components/OrderSummary.jsx';
import { ErrorState, FormError, PageLoader } from '../components/ui.jsx';
import { toApiError } from '../lib/api.js';
import { useCartPricing } from '../lib/hooks.js';
import { useCartStore } from '../stores/cartStore.js';

function formatAddress(a) {
  return [a.line1, a.line2, a.city, a.state, a.postalCode, a.country].filter(Boolean).join(', ');
}

export function CheckoutPage() {
  const items = useCartStore((s) => s.items);
  const couponCode = useCartStore((s) => s.couponCode);
  const queryClient = useQueryClient();
  const pricing = useCartPricing();
  const addresses = useQuery({ queryKey: ['addresses'], queryFn: userApi.addresses });
  const [selected, setSelected] = useState(null); // address id | 'new'

  const checkout = useMutation({
    mutationFn: orderApi.checkout,
    onSuccess: ({ url }) => window.location.assign(url),
    onError: (err) => {
      if (toApiError(err).code === 'CART_ISSUES') {
        queryClient.invalidateQueries({ queryKey: ['cart-pricing'] });
      }
    },
  });

  if (items.length === 0) return <Navigate to="/cart" replace />;
  if (pricing.isPending || addresses.isPending) return <PageLoader />;
  if (pricing.isError) return <ErrorState error={pricing.error} onRetry={pricing.refetch} />;
  if (addresses.isError) return <ErrorState error={addresses.error} onRetry={addresses.refetch} />;

  const saved = addresses.data.addresses;
  const defaultId = saved.find((a) => a.isDefault)?._id ?? saved[0]?._id;
  const choice = selected ?? defaultId ?? 'new';
  const data = pricing.data;
  const hasIssues = data.issues.length > 0;

  const placeOrder = (shippingAddress) => {
    const body = { items, couponCode: couponCode ?? undefined };
    if (shippingAddress) body.shippingAddress = shippingAddress;
    else body.addressId = choice;
    checkout.mutate(body);
  };

  const error = checkout.error && toApiError(checkout.error);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Checkout</h1>
      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="mb-4 font-semibold">Shipping address</h2>
            <div className="space-y-2">
              {saved.map((a) => (
                <label
                  key={a._id}
                  className={`flex cursor-pointer gap-3 rounded-lg border p-3 text-sm ${choice === a._id ? 'border-brand-500 bg-brand-50' : 'border-slate-200'}`}
                >
                  <input
                    type="radio"
                    name="address"
                    className="mt-0.5 accent-brand-600"
                    checked={choice === a._id}
                    onChange={() => setSelected(a._id)}
                  />
                  <span>
                    <span className="font-medium">{a.fullName}</span>
                    {a.label && <span className="ml-2 text-xs text-slate-500">{a.label}</span>}
                    <span className="block text-slate-600">{formatAddress(a)}</span>
                  </span>
                </label>
              ))}
              {saved.length > 0 && (
                <label
                  className={`flex cursor-pointer gap-3 rounded-lg border p-3 text-sm ${choice === 'new' ? 'border-brand-500 bg-brand-50' : 'border-slate-200'}`}
                >
                  <input
                    type="radio"
                    name="address"
                    className="accent-brand-600"
                    checked={choice === 'new'}
                    onChange={() => setSelected('new')}
                  />
                  Ship to a different address
                </label>
              )}
            </div>

            {choice === 'new' && (
              <div className="mt-4">
                <AddressForm
                  showLabel={false}
                  submitLabel={
                    <>
                      <Lock className="size-4" /> Continue to payment
                    </>
                  }
                  pending={checkout.isPending || hasIssues}
                  error={checkout.error}
                  onSubmit={placeOrder}
                />
              </div>
            )}
          </section>

          <section className="card p-5">
            <h2 className="mb-3 font-semibold">Items ({data.items.length})</h2>
            <ul className="divide-y divide-slate-100">
              {data.items.map((line) => (
                <li key={line.productId} className="flex items-center gap-3 py-2 text-sm">
                  <div className="size-12 shrink-0 overflow-hidden rounded-md bg-slate-100">
                    {line.image && (
                      <img src={line.image} alt="" className="size-full object-cover" />
                    )}
                  </div>
                  <span className="flex-1">
                    {line.name} <span className="text-slate-500">× {line.quantity}</span>
                  </span>
                </li>
              ))}
            </ul>
            {hasIssues && (
              <p className="mt-3 text-sm text-amber-700">
                Some items changed availability.{' '}
                <Link to="/cart" className="font-medium underline">
                  Review your cart
                </Link>
                .
              </p>
            )}
          </section>
        </div>

        <div className="lg:sticky lg:top-24 lg:self-start">
          <OrderSummary totals={data} coupon={data.coupon}>
            {choice !== 'new' && (
              <>
                {error && error.code !== 'VALIDATION_ERROR' && (
                  <div className="pt-2">
                    <FormError error={checkout.error} />
                  </div>
                )}
                <button
                  className="btn-primary mt-3 w-full py-3"
                  disabled={checkout.isPending || hasIssues}
                  onClick={() => placeOrder()}
                >
                  <CreditCard className="size-4" />
                  {checkout.isPending ? 'Redirecting to Stripe…' : 'Pay with Stripe'}
                </button>
              </>
            )}
            {error?.code === 'PAYMENTS_UNAVAILABLE' && (
              <p className="text-xs text-slate-500">
                Payments need <code>STRIPE_SECRET_KEY</code> in the API’s <code>.env</code>.
              </p>
            )}
            <p className="flex items-center gap-1 text-xs text-slate-500">
              <Lock className="size-3" /> Secure payment on Stripe’s hosted page. Test card 4242
              4242 4242 4242.
            </p>
          </OrderSummary>
        </div>
      </div>
    </div>
  );
}
