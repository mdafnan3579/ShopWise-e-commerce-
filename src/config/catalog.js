/**
 * Fixed product taxonomy. A closed set (rather than free text) keeps filters consistent and lets
 * the AI search schema constrain Claude's output to categories that actually exist.
 */
export const CATEGORIES = Object.freeze([
  'electronics',
  'clothing',
  'shoes',
  'home-kitchen',
  'sports-outdoors',
  'beauty',
  'books',
  'toys-games',
]);

export const CATEGORY_LABELS = Object.freeze({
  electronics: 'Electronics',
  clothing: 'Clothing',
  shoes: 'Shoes',
  'home-kitchen': 'Home & Kitchen',
  'sports-outdoors': 'Sports & Outdoors',
  beauty: 'Beauty',
  books: 'Books',
  'toys-games': 'Toys & Games',
});

export const ROLES = Object.freeze(['customer', 'admin']);

/** Products at or below this stock level show up in the admin "low stock" list. */
export const LOW_STOCK_THRESHOLD = 5;

export const MAX_ADDRESSES = 10;
export const MAX_WISHLIST_ITEMS = 100;
