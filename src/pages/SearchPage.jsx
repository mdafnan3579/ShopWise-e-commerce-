import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { PackageSearch, Sparkles, X } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router';
import { aiApi } from '../api/endpoints.js';
import { chipRemovalUrl } from '../lib/search.js';
import { ProductGrid, ProductGridSkeleton } from '../components/ProductCard.jsx';
import { Badge, EmptyState, ErrorState, Pagination } from '../components/ui.jsx';

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const q = params.get('q') ?? '';
  const page = Number(params.get('page') ?? 1);

  const search = useQuery({
    queryKey: ['ai-search', q, page],
    queryFn: () => aiApi.search({ query: q, page, limit: 20 }),
    enabled: q.trim().length >= 2,
    placeholderData: keepPreviousData,
  });

  if (q.trim().length < 2) {
    return (
      <EmptyState icon={Sparkles} title="Describe what you’re looking for">
        Use the search bar above, e.g. “warm jacket for hiking under $150”.
      </EmptyState>
    );
  }

  const data = search.data;
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Search: “{q}”</h1>
        {data && (
          <div className="mt-3 space-y-2">
            {data.fallback ? (
              <p className="text-sm text-slate-500">Showing plain text-search results.</p>
            ) : (
              <>
                <p className="flex items-center gap-2 text-sm text-slate-600">
                  <Sparkles className="size-4 text-brand-500" /> {data.summary}
                </p>
                {data.chips.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {data.chips.map((chip) => (
                      <button
                        key={chip.key}
                        onClick={() => navigate(chipRemovalUrl(data.interpretedFilters, chip.key))}
                        className="inline-flex items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 hover:bg-brand-100"
                        aria-label={`Remove filter ${chip.label}`}
                      >
                        {chip.label} <X className="size-3" />
                      </button>
                    ))}
                  </div>
                )}
                {data.relaxed && (
                  <Badge tone="warning">No exact matches, so we broadened the search</Badge>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {search.isError ? (
        <ErrorState error={search.error} onRetry={search.refetch} />
      ) : search.isPending ? (
        <ProductGridSkeleton />
      ) : data.products.length === 0 ? (
        <EmptyState icon={PackageSearch} title="Nothing found">
          Try describing it differently, or browse the categories.
        </EmptyState>
      ) : (
        <div className={search.isPlaceholderData ? 'opacity-60' : ''}>
          <ProductGrid products={data.products} />
          <Pagination meta={data.meta} onPageChange={(p) => setParams({ q, page: String(p) })} />
        </div>
      )}
    </div>
  );
}
