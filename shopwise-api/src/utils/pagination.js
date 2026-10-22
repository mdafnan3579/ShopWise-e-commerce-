import { z } from 'zod';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/** Reusable Zod fields for `?page=&limit=` — spread into a resource's query schema. */
export const paginationQuery = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
};

/**
 * Builds a Zod enum for `?sort=` from an allow-list, e.g. `['price', '-price', '-createdAt']`.
 * A leading `-` means descending.
 *
 * @param {[string, ...string[]]} allowed
 * @param {string} fallback
 */
export function sortQuery(allowed, fallback) {
  return z.enum(allowed).default(fallback);
}

/** `'-price'` → `{ price: -1, _id: 1 }`. `_id` is a tiebreaker so pages are stable. */
export function toMongoSort(sort) {
  const descending = sort.startsWith('-');
  const field = descending ? sort.slice(1) : sort;
  return { [field]: descending ? -1 : 1, _id: 1 };
}

/** @param {{ page: number, limit: number }} params */
export function getSkip({ page, limit }) {
  return (page - 1) * limit;
}

/** @param {{ total: number, page: number, limit: number }} params */
export function buildPaginationMeta({ total, page, limit }) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
}

/**
 * Runs a paginated find and a count in parallel.
 *
 * @param {import('mongoose').Model} model
 * @param {{ filter?: object, sort?: object, page: number, limit: number, projection?: object | string, populate?: any }} options
 */
export async function paginate(
  model,
  { filter = {}, sort = { _id: 1 }, page, limit, projection, populate },
) {
  let query = model.find(filter, projection).sort(sort).skip(getSkip({ page, limit })).limit(limit);
  if (populate) query = query.populate(populate);

  const [items, total] = await Promise.all([query.lean(), model.countDocuments(filter)]);
  return { items, meta: buildPaginationMeta({ total, page, limit }) };
}
