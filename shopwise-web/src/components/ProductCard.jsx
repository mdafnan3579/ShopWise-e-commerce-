import { Heart, ShoppingCart } from 'lucide-react';
import { Link } from 'react-router';
import { primaryImage, stockLabel } from '../lib/format.js';
import { useAddToCart, useWishlist } from '../lib/hooks.js';
import { Badge, Price, Stars } from './ui.jsx';

export function ProductCard({ product, reason }) {
  const wishlist = useWishlist();
  const addToCart = useAddToCart();
  const stock = stockLabel(product.stock);
  const saved = wishlist.has(product._id);
  const image = primaryImage(product);

  return (
    <article className="card group relative flex flex-col overflow-hidden transition hover:shadow-md">
      <Link to={`/products/${product.slug}`} className="block aspect-square bg-slate-100">
        {image && (
          <img
            src={image}
            alt={product.images[0].alt ?? product.name}
            loading="lazy"
            className="size-full object-cover transition group-hover:scale-[1.02]"
          />
        )}
      </Link>
      <button
        type="button"
        onClick={() => wishlist.toggle(product._id)}
        className="absolute top-2 right-2 rounded-full bg-white/90 p-2 shadow-sm hover:bg-white"
        aria-label={saved ? 'Remove from wishlist' : 'Save to wishlist'}
        aria-pressed={saved}
      >
        <Heart className={`size-4 ${saved ? 'fill-rose-500 text-rose-500' : 'text-slate-500'}`} />
      </button>

      <div className="flex flex-1 flex-col p-4">
        <p className="text-xs tracking-wide text-slate-500 uppercase">{product.brand}</p>
        <Link
          to={`/products/${product.slug}`}
          className="mt-0.5 line-clamp-2 font-medium hover:text-brand-700"
        >
          {product.name}
        </Link>
        <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
          <Stars value={product.averageRating} size="size-3.5" />
          <span>({product.reviewCount})</span>
        </div>
        {reason && <p className="mt-2 text-xs text-brand-700 italic">“{reason}”</p>}
        <div className="mt-auto flex items-end justify-between gap-2 pt-3">
          <div>
            <Price cents={product.priceCents} className="text-lg" />
            {stock.tone !== 'success' && (
              <Badge tone={stock.tone} className="mt-1 block w-fit">
                {stock.text}
              </Badge>
            )}
          </div>
          <button
            type="button"
            className="btn-primary px-3"
            disabled={product.stock === 0}
            onClick={() => addToCart(product)}
            aria-label={`Add ${product.name} to cart`}
          >
            <ShoppingCart className="size-4" />
          </button>
        </div>
      </div>
    </article>
  );
}

export function ProductGrid({ products, reasons }) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
      {products.map((p) => (
        <ProductCard key={p._id} product={p} reason={reasons?.[p._id]} />
      ))}
    </div>
  );
}

export function ProductGridSkeleton({ count = 8 }) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="card animate-pulse overflow-hidden">
          <div className="aspect-square bg-slate-200" />
          <div className="space-y-2 p-4">
            <div className="h-3 w-1/3 rounded bg-slate-200" />
            <div className="h-4 w-3/4 rounded bg-slate-200" />
            <div className="h-5 w-1/4 rounded bg-slate-200" />
          </div>
        </div>
      ))}
    </div>
  );
}
