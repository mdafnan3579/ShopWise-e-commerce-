import { z } from 'zod';
import { CATEGORIES } from '../config/catalog.js';

/**
 * Zod schemas for everything the model returns. Output schemas stay permissive about length
 * (the model's JSON Schema can't express every constraint) and services trim afterwards.
 * Anything that fails validation is treated as an AI failure and falls back.
 */

export const SEARCH_SORTS = ['relevance', 'price_asc', 'price_desc', 'rating', 'newest'];

/** Arguments of the `apply_search_filters` tool (natural-language search). */
export const searchFiltersSchema = z.object({
  keywords: z.string().max(200).optional(),
  category: z.enum(CATEGORIES).optional(),
  minPrice: z.number().min(0).max(100_000).optional(),
  maxPrice: z.number().min(0).max(100_000).optional(),
  minRating: z.number().min(0).max(5).optional(),
  inStockOnly: z.boolean().optional(),
  sort: z.enum(SEARCH_SORTS).optional(),
});

export const reviewSummarySchema = z.object({
  summary: z.string().min(1),
  pros: z.array(z.string()),
  cons: z.array(z.string()),
});

export const productCopySchema = z.object({
  description: z.string().min(1),
  tagline: z.string().min(1),
  tags: z.array(z.string()),
});

export const recommendationsSchema = z.object({
  recommendations: z.array(z.object({ productId: z.string(), reason: z.string() })),
});
