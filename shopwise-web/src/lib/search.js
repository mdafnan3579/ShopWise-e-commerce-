const SORT_MAP = {
  price_asc: 'price',
  price_desc: '-price',
  rating: '-rating',
  newest: '-createdAt',
};

/**
 * API.md §4 AI: removing a chip drops that filter and runs a normal `GET /products` query,
 * so we hand the remaining filters to the catalog page.
 */
export function chipRemovalUrl(filters, removedKey) {
  const f = { ...filters };
  if (removedKey === 'price') {
    delete f.minPrice;
    delete f.maxPrice;
  } else {
    delete f[removedKey];
  }
  const p = new URLSearchParams();
  if (f.keywords) p.set('q', f.keywords);
  if (f.category) p.set('category', f.category);
  if (f.minPrice != null) p.set('minPriceCents', String(Math.round(f.minPrice * 100)));
  if (f.maxPrice != null) p.set('maxPriceCents', String(Math.round(f.maxPrice * 100)));
  if (f.minRating != null) p.set('minRating', String(f.minRating));
  if (f.inStockOnly) p.set('inStock', 'true');
  if (f.sort && SORT_MAP[f.sort]) p.set('sort', SORT_MAP[f.sort]);
  const qs = p.toString();
  return qs ? `/products?${qs}` : '/products';
}
