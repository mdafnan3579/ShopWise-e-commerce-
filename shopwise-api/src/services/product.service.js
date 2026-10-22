import mongoose from 'mongoose';
import { CATEGORIES, CATEGORY_LABELS, LOW_STOCK_THRESHOLD } from '../config/catalog.js';
import { Product } from '../models/Product.js';
import { Review } from '../models/Review.js';
import { AppError } from '../utils/AppError.js';
import { buildPaginationMeta, getSkip, paginate } from '../utils/pagination.js';
import { escapeRegex } from '../utils/regex.js';
import { slugify } from '../utils/slugify.js';
import { MAX_PRODUCT_IMAGES } from '../validators/product.validators.js';
import { deleteImage, uploadProductImage } from './upload.service.js';

/** Fields for list/grid views (no long description or AI summary). */
const LIST_FIELDS = [
  'name',
  'slug',
  'tagline',
  'priceCents',
  'category',
  'brand',
  'tags',
  'images',
  'stock',
  'averageRating',
  'reviewCount',
  'isActive',
  'createdAt',
];
const LIST_PROJECTION = Object.fromEntries(LIST_FIELDS.map((field) => [field, 1]));

const SORT_FIELDS = {
  createdAt: 'createdAt',
  price: 'priceCents',
  rating: 'averageRating',
  reviewCount: 'reviewCount',
  name: 'name',
};

function resolveSort(sort, { textSearch }) {
  const effective = sort ?? (textSearch ? 'relevance' : '-createdAt');
  if (effective === 'relevance') {
    return textSearch ? { score: { $meta: 'textScore' }, _id: 1 } : { createdAt: -1, _id: 1 };
  }
  const descending = effective.startsWith('-');
  const key = descending ? effective.slice(1) : effective;
  return { [SORT_FIELDS[key]]: descending ? -1 : 1, _id: 1 };
}

/**
 * Translates validated filter params into a Mongo filter. Only known fields are read, so
 * request input can never inject arbitrary query operators.
 */
export function buildProductFilter(params, { admin = false } = {}) {
  const filter = {};

  if (!admin || params.status === 'active') filter.isActive = true;
  else if (params.status === 'inactive') filter.isActive = false;

  if (params.category) filter.category = params.category;
  if (params.brand) filter.brand = new RegExp(`^${escapeRegex(params.brand)}$`, 'i');

  if (params.minPriceCents !== undefined || params.maxPriceCents !== undefined) {
    filter.priceCents = {};
    if (params.minPriceCents !== undefined) filter.priceCents.$gte = params.minPriceCents;
    if (params.maxPriceCents !== undefined) filter.priceCents.$lte = params.maxPriceCents;
  }

  if (params.minRating !== undefined) filter.averageRating = { $gte: params.minRating };
  if (params.tags?.length) filter.tags = { $in: params.tags };

  if (params.lowStock) filter.stock = { $lte: LOW_STOCK_THRESHOLD };
  else if (params.inStock) filter.stock = { $gt: 0 };

  return filter;
}

/**
 * Catalog search used by the product listing, AI search, and AI assistant tools.
 *
 * Text queries use the weighted text index (relevance-ranked, stemmed whole words). If that
 * finds nothing, it falls back to a case-insensitive partial match so "runn" or "head" still
 * returns results.
 */
export async function searchProducts(params, { admin = false } = {}) {
  const { q, page, limit } = params;
  const base = buildProductFilter(params, { admin });

  if (!q) {
    return paginate(Product, {
      filter: base,
      sort: resolveSort(params.sort, { textSearch: false }),
      page,
      limit,
      projection: LIST_PROJECTION,
    });
  }

  const textFilter = { ...base, $text: { $search: q } };
  const total = await Product.countDocuments(textFilter);
  if (total > 0) {
    const items = await Product.find(textFilter, {
      ...LIST_PROJECTION,
      score: { $meta: 'textScore' },
    })
      .sort(resolveSort(params.sort, { textSearch: true }))
      .skip(getSkip({ page, limit }))
      .limit(limit)
      .lean();
    return { items, meta: buildPaginationMeta({ total, page, limit }) };
  }

  const pattern = new RegExp(escapeRegex(q), 'i');
  return paginate(Product, {
    filter: { ...base, $or: [{ name: pattern }, { brand: pattern }, { tags: pattern }] },
    sort: resolveSort(params.sort === 'relevance' ? undefined : params.sort, { textSearch: false }),
    page,
    limit,
    projection: LIST_PROJECTION,
  });
}

function lookupFilter(idOrSlug) {
  return mongoose.isValidObjectId(idOrSlug) && /^[a-f\d]{24}$/i.test(idOrSlug)
    ? { _id: idOrSlug }
    : { slug: idOrSlug.toLowerCase() };
}

/** Product detail by id or slug, with the rating distribution for the reviews widget. */
export async function getProductDetail(idOrSlug, { admin = false } = {}) {
  const filter = lookupFilter(idOrSlug);
  if (!admin) filter.isActive = true;

  const product = await Product.findOne(filter).select('-aiReviewSummary').lean();
  if (!product) throw AppError.notFound('Product');

  const ratingBreakdown = await Review.ratingBreakdown(product._id);
  return { ...product, ratingBreakdown };
}

export async function getRelatedProducts(productId, limit = 8) {
  const product = await Product.findOne({ _id: productId, isActive: true })
    .select('category')
    .lean();
  if (!product) throw AppError.notFound('Product');

  return Product.find(
    { isActive: true, category: product.category, _id: { $ne: product._id } },
    LIST_PROJECTION,
  )
    .sort({ averageRating: -1, reviewCount: -1, _id: 1 })
    .limit(limit)
    .lean();
}

/** Every category with its active product count (zero-count categories included). */
export async function getCategories() {
  const counts = await Product.aggregate([
    { $match: { isActive: true } },
    { $group: { _id: '$category', count: { $sum: 1 } } },
  ]);
  const byCategory = Object.fromEntries(counts.map((row) => [row._id, row.count]));

  return CATEGORIES.map((slug) => ({
    slug,
    label: CATEGORY_LABELS[slug],
    productCount: byCategory[slug] ?? 0,
  }));
}

async function uniqueSlug(base, excludeId) {
  let candidate = base;
  for (let n = 2; ; n += 1) {
    const taken = await Product.exists({
      slug: candidate,
      ...(excludeId && { _id: { $ne: excludeId } }),
    });
    if (!taken) return candidate;
    candidate = `${base}-${n}`;
  }
}

export async function createProduct(data) {
  const slug = await uniqueSlug(data.slug ?? slugify(data.name));
  return Product.create({ ...data, slug });
}

/** Slugs are stable once created (they are in URLs); they change only when sent explicitly. */
export async function updateProduct(productId, changes) {
  const product = await Product.findById(productId);
  if (!product) throw AppError.notFound('Product');

  if (changes.slug && changes.slug !== product.slug) {
    if (await Product.exists({ slug: changes.slug, _id: { $ne: product._id } })) {
      throw AppError.conflict('Another product already uses this slug', { fields: ['slug'] });
    }
  }

  product.set(changes);
  await product.save();
  return product;
}

/**
 * Soft delete: deactivating keeps order history, reviews and analytics intact while hiding the
 * product from the storefront.
 */
export async function deactivateProduct(productId) {
  const product = await Product.findByIdAndUpdate(
    productId,
    { isActive: false },
    { returnDocument: 'after' },
  ).lean();
  if (!product) throw AppError.notFound('Product');
  return product;
}

/**
 * Uploads images in parallel. If any upload fails, the ones that succeeded are deleted so no
 * orphaned files are left in Cloudinary.
 *
 * @param {Array<{ buffer: Buffer, originalname: string }>} files
 */
export async function addProductImages(productId, files) {
  if (!files?.length) throw AppError.badRequest('Attach at least one image in the "images" field');

  const product = await Product.findById(productId);
  if (!product) throw AppError.notFound('Product');

  if (product.images.length + files.length > MAX_PRODUCT_IMAGES) {
    throw new AppError(
      `A product can have at most ${MAX_PRODUCT_IMAGES} images`,
      400,
      'IMAGE_LIMIT',
    );
  }

  const results = await Promise.allSettled(files.map((file) => uploadProductImage(file.buffer)));
  const failed = results.find((r) => r.status === 'rejected');
  if (failed) {
    await Promise.all(
      results.filter((r) => r.status === 'fulfilled').map((r) => deleteImage(r.value.publicId)),
    );
    throw failed.reason;
  }

  results.forEach((result, index) => {
    product.images.push({
      ...result.value,
      alt: product.name || files[index].originalname,
    });
  });
  await product.save();
  return product;
}

export async function removeProductImage(productId, imageId) {
  const product = await Product.findById(productId);
  if (!product) throw AppError.notFound('Product');

  const image = product.images.id(imageId);
  if (!image) throw AppError.notFound('Image');

  const { publicId } = image;
  image.deleteOne();
  await product.save();
  await deleteImage(publicId);
  return product;
}
