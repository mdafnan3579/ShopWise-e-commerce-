import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { adminApi } from '../../api/endpoints.js';
import {
  Badge,
  ErrorState,
  Field,
  FormError,
  PageLoader,
  Pagination,
} from '../../components/ui.jsx';
import { errorMessage, fieldErrors } from '../../lib/api.js';
import { formatDate, formatPrice } from '../../lib/format.js';
import { AdminHeader } from './AdminLayout.jsx';

const EMPTY = {
  code: '',
  description: '',
  discountType: 'percent',
  value: '',
  minSubtotal: '',
  maxDiscount: '',
  expiresAt: '',
  usageLimit: '',
  isActive: true,
};

const dollars = (cents) => (cents ? String(cents / 100) : '');
const cents = (d) => (d === '' ? undefined : Math.round(Number(d) * 100));

function toForm(c) {
  return {
    code: c.code,
    description: c.description ?? '',
    discountType: c.discountType,
    value: c.discountType === 'percent' ? String(c.value) : dollars(c.value),
    minSubtotal: dollars(c.minSubtotalCents),
    maxDiscount: dollars(c.maxDiscountCents),
    expiresAt: c.expiresAt ? c.expiresAt.slice(0, 10) : '',
    usageLimit: c.usageLimit ? String(c.usageLimit) : '',
    isActive: c.isActive,
  };
}

function toInput(f) {
  const body = {
    code: f.code.trim().toUpperCase(),
    discountType: f.discountType,
    value: f.discountType === 'percent' ? Number(f.value) : cents(f.value),
    minSubtotalCents: cents(f.minSubtotal) ?? 0,
    isActive: f.isActive,
  };
  if (f.description.trim()) body.description = f.description.trim();
  if (f.maxDiscount !== '') body.maxDiscountCents = cents(f.maxDiscount);
  if (f.expiresAt) body.expiresAt = new Date(`${f.expiresAt}T23:59:59Z`).toISOString();
  if (f.usageLimit !== '') body.usageLimit = Number(f.usageLimit);
  return body;
}

function describe(c) {
  const off = c.discountType === 'percent' ? `${c.value}% off` : `${formatPrice(c.value)} off`;
  const parts = [off];
  if (c.minSubtotalCents) parts.push(`orders ≥ ${formatPrice(c.minSubtotalCents)}`);
  if (c.maxDiscountCents) parts.push(`max ${formatPrice(c.maxDiscountCents)}`);
  return parts.join(' · ');
}

function CouponForm({ coupon, onDone }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(coupon ? toForm(coupon) : EMPTY);
  const set = (k) => (e) =>
    setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const save = useMutation({
    mutationFn: (body) =>
      coupon ? adminApi.updateCoupon(coupon._id, body) : adminApi.createCoupon(body),
    onSuccess: () => {
      toast.success(coupon ? 'Coupon saved' : 'Coupon created');
      queryClient.invalidateQueries({ queryKey: ['admin-coupons'] });
      onDone();
    },
  });
  const errors = fieldErrors(save.error);

  return (
    <form
      className="card mb-6 grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(toInput(form));
      }}
    >
      <Field label="Code" error={errors.code} hint="A–Z, 0–9, _ or -">
        <input
          className="input uppercase"
          required
          pattern="[A-Za-z0-9_\-]{3,30}"
          value={form.code}
          onChange={set('code')}
        />
      </Field>
      <Field label="Type" error={errors.discountType}>
        <select className="input" value={form.discountType} onChange={set('discountType')}>
          <option value="percent">Percent off</option>
          <option value="fixed">Fixed amount off</option>
        </select>
      </Field>
      <Field
        label={form.discountType === 'percent' ? 'Percent (1–100)' : 'Amount ($)'}
        error={errors.value}
      >
        <input
          className="input"
          type="number"
          required
          min="0"
          step={form.discountType === 'percent' ? '1' : '0.01'}
          max={form.discountType === 'percent' ? 100 : undefined}
          value={form.value}
          onChange={set('value')}
        />
      </Field>
      <Field label="Description" error={errors.description} className="sm:col-span-2 lg:col-span-3">
        <input className="input" value={form.description} onChange={set('description')} />
      </Field>
      <Field label="Minimum subtotal ($)" error={errors.minSubtotalCents}>
        <input
          className="input"
          type="number"
          min="0"
          step="0.01"
          value={form.minSubtotal}
          onChange={set('minSubtotal')}
        />
      </Field>
      <Field label="Max discount ($)" error={errors.maxDiscountCents}>
        <input
          className="input"
          type="number"
          min="0"
          step="0.01"
          value={form.maxDiscount}
          onChange={set('maxDiscount')}
        />
      </Field>
      <Field label="Usage limit" error={errors.usageLimit}>
        <input
          className="input"
          type="number"
          min="1"
          step="1"
          value={form.usageLimit}
          onChange={set('usageLimit')}
        />
      </Field>
      <Field label="Expires on" error={errors.expiresAt}>
        <input className="input" type="date" value={form.expiresAt} onChange={set('expiresAt')} />
      </Field>
      <label className="flex items-center gap-2 self-end pb-2 text-sm">
        <input
          type="checkbox"
          className="accent-brand-600"
          checked={form.isActive}
          onChange={set('isActive')}
        />
        Active
      </label>
      {Object.keys(errors).length === 0 && (
        <div className="sm:col-span-2 lg:col-span-3">
          <FormError error={save.error} />
        </div>
      )}
      <div className="flex gap-2 sm:col-span-2 lg:col-span-3">
        <button className="btn-primary" disabled={save.isPending}>
          {coupon ? 'Save coupon' : 'Create coupon'}
        </button>
        <button type="button" className="btn-ghost" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function AdminCoupons() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null);
  const [now] = useState(() => Date.now());
  const coupons = useQuery({
    queryKey: ['admin-coupons', page],
    queryFn: () => adminApi.coupons({ page, limit: 20 }),
    placeholderData: keepPreviousData,
  });
  const remove = useMutation({
    mutationFn: adminApi.deleteCoupon,
    onSuccess: () => {
      toast.success('Coupon deleted');
      queryClient.invalidateQueries({ queryKey: ['admin-coupons'] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <>
      <AdminHeader title="Coupons">
        {!editing && (
          <button className="btn-primary" onClick={() => setEditing('new')}>
            <Plus className="size-4" /> New coupon
          </button>
        )}
      </AdminHeader>
      {editing && (
        <CouponForm
          key={editing === 'new' ? 'new' : editing._id}
          coupon={editing === 'new' ? null : editing}
          onDone={() => setEditing(null)}
        />
      )}
      {coupons.isPending && <PageLoader />}
      {coupons.isError && <ErrorState error={coupons.error} onRetry={coupons.refetch} />}
      {coupons.data && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Code</th>
                <th className="px-4 py-3 font-medium">Discount</th>
                <th className="px-4 py-3 font-medium">Used</th>
                <th className="px-4 py-3 font-medium">Expires</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {coupons.data.items.map((c) => {
                const expired = c.expiresAt && new Date(c.expiresAt).getTime() < now;
                return (
                  <tr key={c._id}>
                    <td className="px-4 py-2">
                      <p className="font-mono font-medium">{c.code}</p>
                      {c.description && <p className="text-xs text-slate-500">{c.description}</p>}
                    </td>
                    <td className="px-4 py-2">{describe(c)}</td>
                    <td className="px-4 py-2 tabular-nums">
                      {c.timesUsed}
                      {c.usageLimit ? ` / ${c.usageLimit}` : ''}
                    </td>
                    <td className="px-4 py-2 text-slate-600">
                      {c.expiresAt ? formatDate(c.expiresAt) : 'Never'}
                    </td>
                    <td className="px-4 py-2">
                      <Badge tone={expired ? 'danger' : c.isActive ? 'success' : 'neutral'}>
                        {expired ? 'Expired' : c.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      <button
                        className="mr-3 text-brand-700 hover:underline"
                        onClick={() => setEditing(c)}
                      >
                        Edit
                      </button>
                      <button
                        className="text-red-600 hover:underline"
                        onClick={() =>
                          window.confirm(`Delete coupon ${c.code}?`) && remove.mutate(c._id)
                        }
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pagination meta={coupons.data?.meta} onPageChange={setPage} />
    </>
  );
}
