import { z } from 'zod';
import { CATEGORIES } from '../config/catalog.js';
import { paginationQuery } from '../utils/pagination.js';
import { idParams, objectId, queryBoolean, searchTerm } from './common.js';

export const MAX_PRICE_CENTS = 10_000_000; // $100,000
export const MAX_PRODUCT_IMAGES = 8;

/** Public sort keys → stable API contract, independent of internal field names. */
export const PRODUCT_SORTS = [
  'relevance',
  '-createdAt',
  'price',
  '-price',
  '-rating',
  '-reviewCount',
  'name',
];

const priceCents = z.coerce.number().int().min(0).max(MAX_PRICE_CENTS);

/** `?tags=waterproof,trail` → `['waterproof', 'trail']` */
const tagList = z
  .string()
  .transform((value) =>
    value
      .split(',')
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean),
  )
  .pipe(z.array(z.string().max(40)).max(10));

const filterFields = {
  q: searchTerm.optional(),
  category: z.enum(CATEGORIES).optional(),
  brand: z.string().trim().min(1).max(80).optional(),
  minPriceCents: priceCents.optional(),
  maxPriceCents: priceCents.optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  inStock: queryBoolean.optional(),
  tags: tagList.optional(),
  sort: z.enum(PRODUCT_SORTS).optional(),
  ...paginationQuery,
};

const priceRangeIsValid = (q) =>
  q.minPriceCents === undefined ||
  q.maxPriceCents === undefined ||
  q.minPriceCents <= q.maxPriceCents;
const priceRangeError = {
  error: 'minPriceCents must be less than or equal to maxPriceCents',
  path: ['minPriceCents'],
};

export const listProductsSchema = {
  query: z.object(filterFields).refine(priceRangeIsValid, priceRangeError),
};

export const adminListProductsSchema = {
  query: z
    .object({
      ...filterFields,
      status: z.enum(['all', 'active', 'inactive']).default('all'),
      lowStock: queryBoolean.optional(),
    })
    .refine(priceRangeIsValid, priceRangeError),
};

export const productLookupSchema = {
  params: z.object({ idOrSlug: z.string().trim().min(1).max(140) }),
};

export const productIdSchema = { params: idParams('id') };

const slug = z
  .string()
  .trim()
  .toLowerCase()
  .max(80)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'Slug may only contain lowercase letters, numbers and dashes',
  );

const imageInput = z.object({
  url: z.url({ protocol: /^https$/, error: 'Image URL must be an https URL' }),
  alt: z.string().trim().max(140).optional(),
});

const productFields = {
  name: z.string().trim().min(2).max(140),
  slug: slug.optional(),
  tagline: z.string().trim().max(160).optional(),
  description: z.string().trim().min(20).max(5000),
  priceCents: z.number().int().min(0).max(MAX_PRICE_CENTS),
  category: z.enum(CATEGORIES),
  brand: z.string().trim().max(80).optional(),
  tags: z.array(z.string().trim().toLowerCase().min(1).max(40)).max(20).optional(),
  images: z.array(imageInput).max(MAX_PRODUCT_IMAGES).optional(),
  stock: z.number().int().min(0).max(100_000),
  isActive: z.boolean().optional(),
};

export const productBody = z.object(productFields);

export const createProductSchema = { body: productBody };

export const updateProductSchema = {
  params: idParams('id'),
  body: productBody
    .partial()
    .refine((b) => Object.keys(b).length > 0, { error: 'Provide at least one field to update' }),
};

export const deleteImageSchema = {
  params: z.object({ id: objectId, imageId: objectId }),
};
