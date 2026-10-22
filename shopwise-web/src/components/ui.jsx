import { AlertCircle, ChevronLeft, ChevronRight, Loader2, Star } from 'lucide-react';
import { errorMessage } from '../lib/api.js';
import { formatPrice } from '../lib/format.js';

export function Spinner({ className = 'size-5' }) {
  return <Loader2 className={`animate-spin text-brand-600 ${className}`} aria-label="Loading" />;
}

export function PageLoader() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Spinner className="size-8" />
    </div>
  );
}

export function ErrorState({ error, onRetry, title = 'Something went wrong' }) {
  return (
    <div className="card mx-auto my-8 max-w-lg p-6 text-center">
      <AlertCircle className="mx-auto size-8 text-red-500" />
      <h2 className="mt-2 font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-slate-600">{errorMessage(error)}</p>
      {onRetry && (
        <button className="btn-secondary mt-4" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children, action }) {
  return (
    <div className="card flex flex-col items-center px-6 py-12 text-center">
      {Icon && <Icon className="size-10 text-slate-300" />}
      <h2 className="mt-3 text-lg font-semibold">{title}</h2>
      {children && <p className="mt-1 max-w-md text-sm text-slate-600">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Price({ cents, className = '' }) {
  return <span className={`font-semibold tabular-nums ${className}`}>{formatPrice(cents)}</span>;
}

export function Stars({ value = 0, size = 'size-4', className = '' }) {
  return (
    <span className={`inline-flex ${className}`} aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`${size} ${
            value >= n - 0.25 ? 'fill-amber-400 text-amber-400' : 'fill-slate-200 text-slate-200'
          }`}
        />
      ))}
    </span>
  );
}

const TONES = {
  success: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-amber-50 text-amber-700',
  danger: 'bg-red-50 text-red-700',
  info: 'bg-sky-50 text-sky-700',
  neutral: 'bg-slate-100 text-slate-700',
  brand: 'bg-brand-50 text-brand-700',
};

export function Badge({ tone = 'neutral', children, className = '' }) {
  return <span className={`badge ${TONES[tone]} ${className}`}>{children}</span>;
}

const STATUS_TONES = {
  pending: 'warning',
  unpaid: 'warning',
  paid: 'info',
  shipped: 'brand',
  delivered: 'success',
  cancelled: 'neutral',
  failed: 'danger',
  refunded: 'neutral',
};

export function StatusBadge({ status }) {
  return <Badge tone={STATUS_TONES[status] ?? 'neutral'}>{status}</Badge>;
}

export function Pagination({ meta, onPageChange }) {
  if (!meta || meta.totalPages <= 1) return null;
  return (
    <nav className="mt-8 flex items-center justify-center gap-3" aria-label="Pagination">
      <button
        className="btn-secondary"
        disabled={!meta.hasPrevPage}
        onClick={() => onPageChange(meta.page - 1)}
      >
        <ChevronLeft className="size-4" /> Previous
      </button>
      <span className="text-sm text-slate-600">
        Page {meta.page} of {meta.totalPages}
      </span>
      <button
        className="btn-secondary"
        disabled={!meta.hasNextPage}
        onClick={() => onPageChange(meta.page + 1)}
      >
        Next <ChevronRight className="size-4" />
      </button>
    </nav>
  );
}

export function Field({ label, error, hint, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      {label && <span className="label">{label}</span>}
      {children}
      {error ? (
        <span className="mt-1 block text-xs text-red-600">{error}</span>
      ) : (
        hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>
      )}
    </label>
  );
}

export function FormError({ error }) {
  if (!error) return null;
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {errorMessage(error)}
    </div>
  );
}

export function AiBadge({ className = '' }) {
  return (
    <Badge tone="brand" className={className}>
      ✨ AI-generated
    </Badge>
  );
}
