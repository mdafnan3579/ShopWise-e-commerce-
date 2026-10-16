import { z } from 'zod';
import { CATEGORIES, LOW_STOCK_THRESHOLD } from '../../config/catalog.js';
import { Product } from '../../models/Product.js';
import { searchProducts } from '../../services/product.service.js';
import { formatMoney } from '../../utils/money.js';
import { objectId } from '../../validators/common.js';

/**
 * Tools for the shopping assistant. Data tools call the same services as the REST API, so the
 * assistant can only ever see real catalog data. `show_products` is a presentation tool: it
 * tells the UI which product cards to render, and the server rejects any id that did not come
 * back from a data tool in this conversation (grounding).
 */

const SORT_MAP = {
  relevance: 'relevance',
  price_asc: 'price',
  price_desc: '-price',
  rating: '-rating',
  newest: '-createdAt',
};

const MAX_RESULTS = 8;
const DESCRIPTION_PREVIEW = 600;

export const CHAT_TOOLS = [
  {
    name: 'search_products',
    description:
      'Search the store catalog. Returns up to 8 matching active products with id, price, rating and stock. Use for any request to find or browse products.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Product keywords, e.g. "waterproof trail shoes"' },
        category: { type: 'string', enum: [...CATEGORIES] },
        minPrice: { type: 'number', description: 'Minimum price in US dollars' },
        maxPrice: { type: 'number', description: 'Maximum price in US dollars' },
        sort: { type: 'string', enum: Object.keys(SORT_MAP) },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_product_details',
    description:
      'Get full details (description, tags, rating, stock) for one product by its id. Use before answering specific questions about a product.',
    input_schema: {
      type: 'object',
      properties: {
        productId: { type: 'string', description: 'Product id from a previous tool result' },
      },
      required: ['productId'],
      additionalProperties: false,
    },
  },
  {
    name: 'compare_products',
    description:
      'Compare 2 to 4 products side by side by id (price, rating, brand, key features, stock).',
    input_schema: {
      type: 'object',
      properties: {
        productIds: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 4 },
      },
      required: ['productIds'],
      additionalProperties: false,
    },
  },
  {
    name: 'check_stock',
    description: 'Check whether a product is in stock and roughly how many units are left.',
    input_schema: {
      type: 'object',
      properties: { productId: { type: 'string' } },
      required: ['productId'],
      additionalProperties: false,
    },
  },
  {
    name: 'show_products',
    description:
      'Display product cards to the customer for the products you are recommending (1 to 4). Only use ids returned by the other tools in this conversation.',
    input_schema: {
      type: 'object',
      properties: {
        productIds: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 4 },
      },
      required: ['productIds'],
      additionalProperties: false,
    },
  },
];

// Tool inputs are untrusted model output: validated with Zod before any query runs.
const inputSchemas = {
  search_products: z.object({
    query: z.string().trim().max(100).optional(),
    category: z.enum(CATEGORIES).optional(),
    minPrice: z.number().min(0).max(100_000).optional(),
    maxPrice: z.number().min(0).max(100_000).optional(),
    sort: z.enum(Object.keys(SORT_MAP)).optional(),
  }),
  get_product_details: z.object({ productId: objectId }),
  compare_products: z.object({ productIds: z.array(objectId).min(2).max(4) }),
  check_stock: z.object({ productId: objectId }),
  show_products: z.object({ productIds: z.array(objectId).min(1).max(4) }),
};

const toCents = (dollars) => (dollars === undefined ? undefined : Math.round(dollars * 100));

function stockLabel(stock) {
  if (stock === 0) return 'out of stock';
  if (stock <= LOW_STOCK_THRESHOLD) return `low stock (${stock} left)`;
  return 'in stock';
}

function compact(product) {
  return {
    id: String(product._id),
    name: product.name,
    brand: product.brand,
    category: product.category,
    price: formatMoney(product.priceCents),
    rating: product.averageRating,
    reviewCount: product.reviewCount,
    availability: stockLabel(product.stock),
  };
}

async function findActive(ids) {
  const products = await Product.find({ _id: { $in: ids }, isActive: true })
    .select('-aiReviewSummary -images')
    .lean();
  const byId = new Map(products.map((p) => [String(p._id), p]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

const executors = {
  async search_products(input, context) {
    const minPriceCents = toCents(input.minPrice);
    let maxPriceCents = toCents(input.maxPrice);
    if (
      minPriceCents !== undefined &&
      maxPriceCents !== undefined &&
      maxPriceCents < minPriceCents
    ) {
      maxPriceCents = undefined;
    }

    const { items, meta } = await searchProducts({
      q: input.query || undefined,
      category: input.category,
      minPriceCents,
      maxPriceCents,
      sort: input.sort ? SORT_MAP[input.sort] : undefined,
      page: 1,
      limit: MAX_RESULTS,
    });
    items.forEach((p) => context.seenProductIds.add(String(p._id)));
    return { totalMatches: meta.total, products: items.map(compact) };
  },

  async get_product_details({ productId }, context) {
    const [product] = await findActive([productId]);
    if (!product) return { error: 'No active product with this id' };
    context.seenProductIds.add(productId);
    return {
      ...compact(product),
      tagline: product.tagline,
      description: product.description.slice(0, DESCRIPTION_PREVIEW),
      tags: product.tags,
    };
  },

  async compare_products({ productIds }, context) {
    const products = await findActive([...new Set(productIds)]);
    products.forEach((p) => context.seenProductIds.add(String(p._id)));
    return {
      products: products.map((p) => ({
        ...compact(p),
        tags: p.tags,
        summary: p.tagline ?? p.description.slice(0, 160),
      })),
      notFound: productIds.filter((id) => !products.some((p) => String(p._id) === id)),
    };
  },

  async check_stock({ productId }, context) {
    const [product] = await findActive([productId]);
    if (!product) return { error: 'No active product with this id' };
    context.seenProductIds.add(productId);
    return {
      id: productId,
      name: product.name,
      inStock: product.stock > 0,
      availability: stockLabel(product.stock),
    };
  },

  async show_products({ productIds }, context) {
    const grounded = productIds.filter((id) => context.seenProductIds.has(id));
    const rejected = productIds.filter((id) => !context.seenProductIds.has(id));
    for (const id of grounded) {
      if (!context.displayedProductIds.includes(id)) context.displayedProductIds.push(id);
    }
    return rejected.length
      ? {
          displayed: grounded,
          rejected,
          note: 'Rejected ids were not returned by a catalog tool in this conversation.',
        }
      : { displayed: grounded };
  },
};

/**
 * Executes one tool_use block and returns a tool_result block. Never throws: failures are
 * reported to the model as `is_error` results so it can recover or apologize.
 *
 * @param {{ id: string, name: string, input: unknown }} toolUse
 * @param {{ seenProductIds: Set<string>, displayedProductIds: string[] }} context
 */
export async function runTool(toolUse, context) {
  const schema = inputSchemas[toolUse.name];
  const result = (content, isError = false) => ({
    type: 'tool_result',
    tool_use_id: toolUse.id,
    content: JSON.stringify(content),
    ...(isError && { is_error: true }),
  });

  if (!schema) return result({ error: `Unknown tool ${toolUse.name}` }, true);

  const parsed = schema.safeParse(toolUse.input);
  if (!parsed.success) {
    return result(
      {
        error: 'Invalid input',
        issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      },
      true,
    );
  }

  try {
    return result(await executors[toolUse.name](parsed.data, context));
  } catch (err) {
    context.log?.warn({ err, tool: toolUse.name }, 'Assistant tool failed');
    return result({ error: 'The catalog lookup failed, please try again' }, true);
  }
}
