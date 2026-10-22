import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { PackageSearch, SlidersHorizontal, X } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { productApi } from '../api/endpoints.js';
import { ProductGrid, ProductGridSkeleton } from '../components/ProductCard.jsx';
import { EmptyState, ErrorState, Pagination } from '../components/ui.jsx';

const SORT_OPTIONS = [
  { value: '-createdAt', label: 'Newest' },
  { value: 'price', label: 'Price: low to high' },
  { value: '-price', label: 'Price: high to low' },
  { value: '-rating', label: 'Top rated' },
  { value: '-reviewCount', label: 'Most reviewed' },
  { value: 'name', label: 'Name A–Z' },
];
const FILTER_KEYS = [
  'q',
  'category',
  'brand',
  'minPriceCents',
  'maxPriceCents',
  'minRating',
  'inStock',
  'tags',
  'sort',
  'page',
];

const dollarsToCents = (v) => (v === '' ? '' : String(Math.round(Number(v) * 100)));
const centsToDollars = (v) => (v ? String(Number(v) / 100) : '');

function Filters({ params, setParam, categories }) {
  const [minPrice, setMinPrice] = useState(centsToDollars(params.get('minPriceCents')));
  const [maxPrice, setMaxPrice] = useState(centsToDollars(params.get('maxPriceCents')));

  return (
    <div className="space-y-6">
      <div>
        <h3 className="label">Category</h3>
        <div className="space-y-1">
          {[{ slug: '', label: 'All categories' }, ...categories].map((c) => (
            <label key={c.slug} className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name="category"
                className="accent-brand-600"
                checked={(params.get('category') ?? '') === c.slug}
                onChange={() => setParam({ category: c.slug })}
              />
              {c.label}
              {c.productCount !== undefined && (
                <span className="text-xs text-slate-400">({c.productCount})</span>
              )}
            </label>
          ))}
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setParam({
            minPriceCents: dollarsToCents(minPrice),
            maxPriceCents: dollarsToCents(maxPrice),
          });
        }}
      >
        <h3 className="label">Price ($)</h3>
        <div className="flex items-center gap-2">
          <input
            className="input"
            type="number"
            min="0"
            placeholder="Min"
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)}
            aria-label="Minimum price"
          />
          <span className="text-slate-400">–</span>
          <input
            className="input"
            type="number"
            min="0"
            placeholder="Max"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            aria-label="Maximum price"
          />
        </div>
        <button className="btn-secondary mt-2 w-full">Apply price</button>
      </form>

      <div>
        <h3 className="label">Rating</h3>
        <select
          className="input"
          value={params.get('minRating') ?? ''}
          onChange={(e) => setParam({ minRating: e.target.value })}
        >
          <option value="">Any rating</option>
          <option value="4">4 stars & up</option>
          <option value="3">3 stars & up</option>
          <option value="2">2 stars & up</option>
        </select>
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="accent-brand-600"
          checked={params.get('inStock') === 'true'}
          onChange={(e) => setParam({ inStock: e.target.checked ? 'true' : '' })}
        />
        In stock only
      </label>
    </div>
  );
}

export function ProductsPage() {
  const [params, setParams] = useSearchParams();
  const [showFilters, setShowFilters] = useState(false);
  const query = Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) ?? undefined]));

  const categories = useQuery({ queryKey: ['categories'], queryFn: productApi.categories });
  const products = useQuery({
    queryKey: ['products', query],
    queryFn: () => productApi.list({ ...query, limit: 20 }),
    placeholderData: keepPreviousData,
  });

  /** Filters live in the URL (API.md: params map 1:1); any change resets to page 1. */
  const setParam = (changes) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!('page' in changes)) next.delete('page');
    setParams(next);
  };

  const activeCategory = categories.data?.find((c) => c.slug === params.get('category'));
  const hasFilters = FILTER_KEYS.some((k) => k !== 'sort' && k !== 'page' && params.get(k));
  const title = params.get('q')
    ? `Results for “${params.get('q')}”`
    : (activeCategory?.label ?? 'All products');

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          {products.data && (
            <p className="text-sm text-slate-500">{products.data.meta.total} products</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-secondary lg:hidden" onClick={() => setShowFilters((s) => !s)}>
            <SlidersHorizontal className="size-4" /> Filters
          </button>
          <select
            className="input w-auto"
            value={params.get('sort') ?? (params.get('q') ? 'relevance' : '-createdAt')}
            onChange={(e) => setParam({ sort: e.target.value })}
            aria-label="Sort by"
          >
            {params.get('q') && <option value="relevance">Best match</option>}
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[220px_1fr]">
        <aside className={`${showFilters ? 'block' : 'hidden'} card p-4 lg:block lg:self-start`}>
          <Filters
            key={params.toString()}
            params={params}
            setParam={setParam}
            categories={categories.data ?? []}
          />
          {hasFilters && (
            <button
              className="btn-ghost mt-4 w-full"
              onClick={() => setParams(new URLSearchParams())}
            >
              <X className="size-4" /> Clear filters
            </button>
          )}
        </aside>

        <div>
          {products.isError ? (
            <ErrorState error={products.error} onRetry={products.refetch} />
          ) : products.isPending ? (
            <ProductGridSkeleton />
          ) : products.data.items.length === 0 ? (
            <EmptyState icon={PackageSearch} title="No products match these filters">
              Try removing a filter or searching for something else.
            </EmptyState>
          ) : (
            <div className={products.isPlaceholderData ? 'opacity-60 transition' : ''}>
              <ProductGrid products={products.data.items} />
              <Pagination
                meta={products.data.meta}
                onPageChange={(page) => setParam({ page: String(page) })}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
