import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Heart, Minus, Plus, ShoppingCart, ThumbsDown, ThumbsUp, Truck } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { productApi } from '../api/endpoints.js';
import { ProductGrid } from '../components/ProductCard.jsx';
import {
  AiBadge,
  Badge,
  ErrorState,
  Field,
  FormError,
  PageLoader,
  Pagination,
  Price,
  Stars,
} from '../components/ui.jsx';
import { errorMessage, fieldErrors } from '../lib/api.js';
import { capitalize, formatDate, stockLabel } from '../lib/format.js';
import { useAddToCart, useWishlist } from '../lib/hooks.js';
import { useAuthStore } from '../stores/authStore.js';
import { MAX_QUANTITY } from '../stores/cartStore.js';
import { NotFoundPage } from './NotFoundPage.jsx';

function ReviewSummary({ productId }) {
  const { data } = useQuery({
    queryKey: ['review-summary', productId],
    queryFn: () => productApi.reviewSummary(productId),
  });
  // API.md: render only when status === 'ready'.
  if (data?.status !== 'ready') return null;
  return (
    <div className="card border-brand-200 bg-brand-50/50 p-5">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="font-semibold">What reviewers say</h3>
        <AiBadge />
      </div>
      <p className="text-sm text-slate-700">{data.summary}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <ul className="space-y-1 text-sm">
          {data.pros.map((p) => (
            <li key={p} className="flex gap-2">
              <ThumbsUp className="mt-0.5 size-4 shrink-0 text-emerald-600" /> {p}
            </li>
          ))}
        </ul>
        <ul className="space-y-1 text-sm">
          {data.cons.map((c) => (
            <li key={c} className="flex gap-2">
              <ThumbsDown className="mt-0.5 size-4 shrink-0 text-rose-600" /> {c}
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-3 text-xs text-slate-500">Based on {data.basedOnReviews} reviews.</p>
    </div>
  );
}

function ReviewForm({ productId, existing, onDone }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    rating: existing?.rating ?? 5,
    title: existing?.title ?? '',
    comment: existing?.comment ?? '',
  });
  const mutation = useMutation({
    mutationFn: (body) =>
      existing
        ? productApi.updateReview(existing._id, body)
        : productApi.createReview(productId, body),
    onSuccess: () => {
      toast.success(existing ? 'Review updated' : 'Thanks for your review!');
      queryClient.invalidateQueries({ queryKey: ['reviews', productId] });
      queryClient.invalidateQueries({ queryKey: ['product'] });
      queryClient.invalidateQueries({ queryKey: ['review-summary', productId] });
      onDone();
    },
  });
  const errors = fieldErrors(mutation.error);

  return (
    <form
      className="card space-y-3 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate({ ...form, title: form.title || undefined });
      }}
    >
      <Field label="Rating" error={errors.rating}>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              type="button"
              key={n}
              onClick={() => setForm({ ...form, rating: n })}
              aria-label={`${n} stars`}
              className="text-2xl"
            >
              <span className={n <= form.rating ? 'text-amber-400' : 'text-slate-300'}>★</span>
            </button>
          ))}
        </div>
      </Field>
      <Field label="Title (optional)" error={errors.title}>
        <input
          className="input"
          maxLength={100}
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />
      </Field>
      <Field label="Review" error={errors.comment} hint="10–2000 characters">
        <textarea
          className="input min-h-24"
          maxLength={2000}
          value={form.comment}
          onChange={(e) => setForm({ ...form, comment: e.target.value })}
          required
        />
      </Field>
      {!errors.comment && !errors.rating && <FormError error={mutation.error} />}
      <div className="flex gap-2">
        <button className="btn-primary" disabled={mutation.isPending}>
          {existing ? 'Save changes' : 'Post review'}
        </button>
        <button type="button" className="btn-ghost" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function Reviews({ product }) {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('-createdAt');
  const [rating, setRating] = useState('');
  const [editing, setEditing] = useState(null); // null | 'new' | review
  const reviews = useQuery({
    queryKey: ['reviews', product._id, { page, sort, rating }],
    queryFn: () => productApi.reviews(product._id, { page, sort, rating, limit: 10 }),
  });
  const remove = useMutation({
    mutationFn: productApi.deleteReview,
    onSuccess: () => {
      toast.success('Review deleted');
      queryClient.invalidateQueries({ queryKey: ['reviews', product._id] });
      queryClient.invalidateQueries({ queryKey: ['product'] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const total = product.reviewCount;
  return (
    <section className="mt-12">
      <h2 className="mb-4 text-xl font-bold">Customer reviews</h2>
      <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
        <div className="space-y-4">
          <div className="card p-5">
            <div className="flex items-center gap-3">
              <span className="text-4xl font-bold">{product.averageRating.toFixed(1)}</span>
              <div>
                <Stars value={product.averageRating} />
                <p className="text-sm text-slate-500">{total} reviews</p>
              </div>
            </div>
            <div className="mt-4 space-y-1.5">
              {[5, 4, 3, 2, 1].map((n) => {
                const count = product.ratingBreakdown?.[n] ?? 0;
                return (
                  <button
                    key={n}
                    onClick={() => {
                      setRating(rating === String(n) ? '' : String(n));
                      setPage(1);
                    }}
                    className={`flex w-full items-center gap-2 text-sm ${rating === String(n) ? 'font-semibold text-brand-700' : ''}`}
                  >
                    <span className="w-8">{n} ★</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <span
                        className="block h-full bg-amber-400"
                        style={{ width: `${total ? (count / total) * 100 : 0}%` }}
                      />
                    </span>
                    <span className="w-8 text-right text-slate-500">{count}</span>
                  </button>
                );
              })}
            </div>
          </div>
          {user ? (
            !editing && (
              <button className="btn-secondary w-full" onClick={() => setEditing('new')}>
                Write a review
              </button>
            )
          ) : (
            <p className="text-sm text-slate-600">
              <Link
                to="/login"
                state={{ from: `/products/${product.slug}` }}
                className="font-medium text-brand-700 hover:underline"
              >
                Sign in
              </Link>{' '}
              to write a review.
            </p>
          )}
        </div>

        <div className="space-y-4">
          <ReviewSummary productId={product._id} />
          {editing && (
            <ReviewForm
              productId={product._id}
              existing={editing === 'new' ? null : editing}
              onDone={() => setEditing(null)}
            />
          )}
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">
              {rating ? `Showing ${rating}-star reviews` : 'All reviews'}
            </p>
            <select
              className="input w-auto"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              aria-label="Sort reviews"
            >
              <option value="-createdAt">Newest</option>
              <option value="createdAt">Oldest</option>
              <option value="-rating">Highest rated</option>
              <option value="rating">Lowest rated</option>
            </select>
          </div>
          {reviews.isError && <ErrorState error={reviews.error} onRetry={reviews.refetch} />}
          {reviews.data?.items.length === 0 && (
            <p className="card p-6 text-center text-sm text-slate-500">No reviews yet.</p>
          )}
          {reviews.data?.items.map((r) => {
            const mine = user && r.user._id === user._id;
            return (
              <article key={r._id} className="card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Stars value={r.rating} size="size-3.5" />
                  {r.title && <h3 className="font-semibold">{r.title}</h3>}
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {r.user.name} · {formatDate(r.createdAt)}
                  {r.verifiedPurchase && (
                    <Badge tone="success" className="ml-2">
                      Verified purchase
                    </Badge>
                  )}
                </p>
                <p className="mt-2 text-sm whitespace-pre-line text-slate-700">{r.comment}</p>
                {(mine || user?.role === 'admin') && (
                  <div className="mt-2 flex gap-3 text-xs">
                    {mine && (
                      <button
                        className="text-brand-700 hover:underline"
                        onClick={() => setEditing(r)}
                      >
                        Edit
                      </button>
                    )}
                    <button
                      className="text-red-600 hover:underline"
                      onClick={() => window.confirm('Delete this review?') && remove.mutate(r._id)}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </article>
            );
          })}
          <Pagination meta={reviews.data?.meta} onPageChange={setPage} />
        </div>
      </div>
    </section>
  );
}

/** Keyed by slug so quantity and gallery state reset when moving between products. */
export function ProductDetailPage() {
  const { slug } = useParams();
  return <ProductDetail key={slug} slug={slug} />;
}

function ProductDetail({ slug }) {
  const [quantity, setQuantity] = useState(1);
  const [imageIndex, setImageIndex] = useState(0);
  const addToCart = useAddToCart();
  const wishlist = useWishlist();

  const product = useQuery({ queryKey: ['product', slug], queryFn: () => productApi.get(slug) });
  const related = useQuery({
    queryKey: ['related', product.data?._id],
    queryFn: () => productApi.related(product.data._id),
    enabled: !!product.data,
  });

  if (product.isPending) return <PageLoader />;
  if (product.isError) {
    if (product.error.response?.status === 404) return <NotFoundPage what="product" />;
    return <ErrorState error={product.error} onRetry={product.refetch} />;
  }

  const p = product.data;
  const stock = stockLabel(p.stock);
  const image = p.images[imageIndex] ?? p.images[0];
  const saved = wishlist.has(p._id);
  const maxQty = Math.min(MAX_QUANTITY, p.stock);

  return (
    <>
      <nav className="mb-4 text-sm text-slate-500">
        <Link to="/products" className="hover:underline">
          Shop
        </Link>{' '}
        /{' '}
        <Link to={`/products?category=${p.category}`} className="hover:underline">
          {capitalize(p.category.replace('-', ' & '))}
        </Link>
      </nav>

      <div className="grid gap-8 md:grid-cols-2">
        <div>
          <div className="card aspect-square overflow-hidden bg-slate-100">
            {image && (
              <img src={image.url} alt={image.alt ?? p.name} className="size-full object-cover" />
            )}
          </div>
          {p.images.length > 1 && (
            <div className="mt-3 flex gap-2">
              {p.images.map((img, i) => (
                <button
                  key={img._id}
                  onClick={() => setImageIndex(i)}
                  className={`size-16 overflow-hidden rounded-lg border-2 ${i === imageIndex ? 'border-brand-500' : 'border-transparent'}`}
                >
                  <img src={img.url} alt="" className="size-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <p className="text-sm tracking-wide text-slate-500 uppercase">{p.brand}</p>
          <h1 className="mt-1 text-3xl font-bold">{p.name}</h1>
          {p.tagline && <p className="mt-1 text-slate-600">{p.tagline}</p>}
          <a href="#reviews" className="mt-3 flex items-center gap-2 text-sm">
            <Stars value={p.averageRating} />
            <span className="text-slate-600">
              {p.averageRating.toFixed(1)} · {p.reviewCount} reviews
            </span>
          </a>
          <Price cents={p.priceCents} className="mt-4 block text-3xl" />
          <Badge tone={stock.tone} className="mt-2">
            {stock.text}
          </Badge>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <div className="flex items-center rounded-lg border border-slate-300 bg-white">
              <button
                className="p-2.5 disabled:opacity-40"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                disabled={quantity <= 1}
                aria-label="Decrease quantity"
              >
                <Minus className="size-4" />
              </button>
              <span className="w-10 text-center tabular-nums" aria-live="polite">
                {quantity}
              </span>
              <button
                className="p-2.5 disabled:opacity-40"
                onClick={() => setQuantity((q) => Math.min(maxQty, q + 1))}
                disabled={quantity >= maxQty}
                aria-label="Increase quantity"
              >
                <Plus className="size-4" />
              </button>
            </div>
            <button
              className="btn-primary flex-1 py-2.5"
              disabled={p.stock === 0}
              onClick={() => addToCart(p, quantity)}
            >
              <ShoppingCart className="size-4" /> Add to cart
            </button>
            <button
              className="btn-secondary py-2.5"
              onClick={() => wishlist.toggle(p._id)}
              aria-pressed={saved}
            >
              <Heart className={`size-4 ${saved ? 'fill-rose-500 text-rose-500' : ''}`} />
              {saved ? 'Saved' : 'Save'}
            </button>
          </div>

          <p className="mt-4 flex items-center gap-2 text-sm text-slate-600">
            <Truck className="size-4" /> Free shipping on orders over $75
          </p>

          <div className="mt-8 border-t border-slate-200 pt-6">
            <h2 className="mb-2 font-semibold">About this product</h2>
            <p className="text-sm leading-relaxed whitespace-pre-line text-slate-700">
              {p.description}
            </p>
            {p.tags?.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {p.tags.map((t) => (
                  <Link key={t} to={`/products?tags=${encodeURIComponent(t)}`}>
                    <Badge>#{t}</Badge>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div id="reviews">
        <Reviews product={p} />
      </div>

      {related.data?.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-4 text-xl font-bold">You might also like</h2>
          <ProductGrid products={related.data.slice(0, 4)} />
        </section>
      )}
    </>
  );
}
