const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

/** Money is integer cents everywhere in the API. */
export const formatPrice = (cents) => currency.format((cents ?? 0) / 100);

export const formatDate = (iso, options = { dateStyle: 'medium' }) =>
  iso ? new Intl.DateTimeFormat('en-US', options).format(new Date(iso)) : '';

export const formatDateTime = (iso) => formatDate(iso, { dateStyle: 'medium', timeStyle: 'short' });

export const formatPercent = (value) =>
  value === null || value === undefined ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;

export const capitalize = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');

export const primaryImage = (product) => product?.images?.[0]?.url ?? null;

/** Stock copy from API.md §8. */
export function stockLabel(stock) {
  if (stock === 0) return { text: 'Out of stock', tone: 'danger' };
  if (stock <= 5) return { text: `Only ${stock} left`, tone: 'warning' };
  return { text: 'In stock', tone: 'success' };
}
