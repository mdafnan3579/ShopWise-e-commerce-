import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  BookOpen,
  Dumbbell,
  Gamepad2,
  Laptop,
  Shirt,
  Sparkles,
  Footprints,
  Sofa,
  Gem,
} from 'lucide-react';
import { Link } from 'react-router';
import { aiApi, productApi } from '../api/endpoints.js';
import { ProductGrid, ProductGridSkeleton } from '../components/ProductCard.jsx';
import { AiBadge, ErrorState } from '../components/ui.jsx';
import { useAuthStore } from '../stores/authStore.js';

const CATEGORY_ICONS = {
  electronics: Laptop,
  clothing: Shirt,
  shoes: Footprints,
  'home-kitchen': Sofa,
  'sports-outdoors': Dumbbell,
  beauty: Gem,
  books: BookOpen,
  'toys-games': Gamepad2,
};

function Recommendations() {
  const status = useAuthStore((s) => s.status);
  const userId = useAuthStore((s) => s.user?._id);
  const { data, isPending, isError } = useQuery({
    queryKey: ['recommendations', userId ?? 'guest'],
    queryFn: aiApi.recommendations,
    enabled: status !== 'loading',
  });

  if (isError) return null;
  const personalized = data?.source === 'ai';
  const reasons = Object.fromEntries(
    (data?.items ?? []).filter((i) => i.reason).map((i) => [i.product._id, i.reason]),
  );

  return (
    <section className="mt-12">
      <div className="mb-4 flex items-center gap-3">
        <h2 className="text-xl font-bold">
          {personalized ? 'Picked for you' : 'Top rated right now'}
        </h2>
        {personalized && <AiBadge />}
      </div>
      {isPending ? (
        <ProductGridSkeleton count={4} />
      ) : (
        <ProductGrid products={data.items.map((i) => i.product).slice(0, 8)} reasons={reasons} />
      )}
    </section>
  );
}

export function HomePage() {
  const categories = useQuery({ queryKey: ['categories'], queryFn: productApi.categories });
  const newest = useQuery({
    queryKey: ['products', { sort: '-createdAt', limit: 8 }],
    queryFn: () => productApi.list({ sort: '-createdAt', limit: 8 }),
  });

  return (
    <>
      <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-brand-900 via-brand-700 to-brand-500 px-6 py-14 text-white sm:px-12">
        <div className="max-w-2xl">
          <p className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium">
            <Sparkles className="size-3.5" /> AI-powered shopping
          </p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">
            Find exactly what you need. Just ask.
          </h1>
          <p className="mt-4 text-brand-100 sm:text-lg">
            Search in plain English, get honest AI summaries of real reviews, and chat with an
            assistant that knows the whole catalog.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/products" className="btn bg-white text-brand-700 hover:bg-brand-50">
              Browse the shop <ArrowRight className="size-4" />
            </Link>
            <Link
              to="/search?q=gifts%20under%20%2450%20with%20great%20reviews"
              className="btn border border-white/40 text-white hover:bg-white/10"
            >
              Try “gifts under $50 with great reviews”
            </Link>
          </div>
        </div>
      </section>

      <section className="mt-12">
        <h2 className="mb-4 text-xl font-bold">Shop by category</h2>
        {categories.isError ? (
          <ErrorState error={categories.error} onRetry={categories.refetch} />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(categories.data ?? []).map((c) => {
              const Icon = CATEGORY_ICONS[c.slug] ?? Sparkles;
              return (
                <Link
                  key={c.slug}
                  to={`/products?category=${c.slug}`}
                  className="card flex items-center gap-3 p-4 transition hover:border-brand-300 hover:shadow-md"
                >
                  <span className="rounded-lg bg-brand-50 p-2.5 text-brand-600">
                    <Icon className="size-5" />
                  </span>
                  <span>
                    <span className="block text-sm font-medium">{c.label}</span>
                    <span className="text-xs text-slate-500">{c.productCount} products</span>
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <Recommendations />

      <section className="mt-12">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold">New arrivals</h2>
          <Link to="/products" className="text-sm font-medium text-brand-700 hover:underline">
            View all
          </Link>
        </div>
        {newest.isError ? (
          <ErrorState error={newest.error} onRetry={newest.refetch} />
        ) : newest.isPending ? (
          <ProductGridSkeleton count={8} />
        ) : (
          <ProductGrid products={newest.data.items} />
        )}
      </section>
    </>
  );
}
