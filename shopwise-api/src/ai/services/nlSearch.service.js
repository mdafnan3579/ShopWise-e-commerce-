import { CATEGORY_LABELS } from '../../config/catalog.js';
import { getCategories, searchProducts } from '../../services/product.service.js';
import { AIUnavailableError, MODELS, createMessage } from '../client.js';
import { searchParserSystemPrompt, searchParserUserPrompt } from '../prompts/search.js';
import { SEARCH_SORTS, searchFiltersSchema } from '../schemas.js';

const FEATURE = 'nl_search';
const TIMEOUT_MS = 8_000; // search must feel instant; fall back quickly
const TOOL_NAME = 'apply_search_filters';

const SORT_MAP = {
  relevance: 'relevance',
  price_asc: 'price',
  price_desc: '-price',
  rating: '-rating',
  newest: '-createdAt',
};

/** Strict tool: the API guarantees arguments match this schema; Zod validates again anyway. */
async function filterTool() {
  const categories = await getCategories();
  return {
    name: TOOL_NAME,
    description: 'Apply structured catalog filters extracted from the shopper request.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        keywords: { type: 'string', description: 'Essential product words for text search' },
        category: { type: 'string', enum: categories.map((c) => c.slug) },
        minPrice: { type: 'number', description: 'Minimum price in US dollars' },
        maxPrice: { type: 'number', description: 'Maximum price in US dollars' },
        minRating: { type: 'number', description: 'Minimum average rating, 0 to 5' },
        inStockOnly: { type: 'boolean' },
        sort: { type: 'string', enum: SEARCH_SORTS },
      },
      additionalProperties: false,
    },
  };
}

/**
 * Asks the fast model to turn free text into filters. `tool_choice` stays `auto` (forced tool
 * choice is not supported on every current model), so a missing tool call counts as a failure.
 */
export async function interpretQuery(query, { userId } = {}) {
  const categories = await getCategories();
  const response = await createMessage(
    { feature: FEATURE, userId, timeoutMs: TIMEOUT_MS },
    {
      model: MODELS.fast,
      max_tokens: 512,
      system: searchParserSystemPrompt({ categories }),
      tools: [await filterTool()],
      tool_choice: { type: 'auto' },
      messages: [{ role: 'user', content: searchParserUserPrompt(query) }],
      output_config: { effort: 'low' },
    },
  );

  const call = response.content.find((b) => b.type === 'tool_use' && b.name === TOOL_NAME);
  if (!call) throw new AIUnavailableError(undefined, 'no_tool_call');

  const parsed = searchFiltersSchema.safeParse(call.input);
  if (!parsed.success) throw new AIUnavailableError(undefined, 'invalid_output');
  return normalizeFilters(parsed.data);
}

/** Repairs plausible model mistakes instead of failing: swapped price bounds, empty strings. */
export function normalizeFilters(filters) {
  const result = { ...filters };
  if (result.keywords !== undefined) result.keywords = result.keywords.trim() || undefined;
  if (
    result.minPrice !== undefined &&
    result.maxPrice !== undefined &&
    result.minPrice > result.maxPrice
  ) {
    [result.minPrice, result.maxPrice] = [result.maxPrice, result.minPrice];
  }
  return Object.fromEntries(Object.entries(result).filter(([, v]) => v !== undefined));
}

const dollars = (value) => `$${Number.isInteger(value) ? value : value.toFixed(2)}`;

/** Human-readable chips the UI shows as removable filters ("Under $100", "4+ stars"). */
export function describeFilters(filters) {
  const chips = [];
  if (filters.keywords) chips.push({ key: 'keywords', label: `“${filters.keywords}”` });
  if (filters.category) chips.push({ key: 'category', label: CATEGORY_LABELS[filters.category] });
  if (filters.minPrice !== undefined && filters.maxPrice !== undefined) {
    chips.push({
      key: 'price',
      label: `${dollars(filters.minPrice)}–${dollars(filters.maxPrice)}`,
    });
  } else if (filters.maxPrice !== undefined) {
    chips.push({ key: 'maxPrice', label: `Under ${dollars(filters.maxPrice)}` });
  } else if (filters.minPrice !== undefined) {
    chips.push({ key: 'minPrice', label: `Over ${dollars(filters.minPrice)}` });
  }
  if (filters.minRating !== undefined)
    chips.push({ key: 'minRating', label: `${filters.minRating}+ stars` });
  if (filters.inStockOnly) chips.push({ key: 'inStockOnly', label: 'In stock' });
  if (filters.sort && filters.sort !== 'relevance') {
    const sortLabels = {
      price_asc: 'Lowest price',
      price_desc: 'Highest price',
      rating: 'Top rated',
      newest: 'Newest',
    };
    chips.push({ key: 'sort', label: sortLabels[filters.sort] });
  }
  return chips;
}

/** Maps interpreted filters onto the same params the REST product listing accepts. */
export function toSearchParams(filters, { page, limit }) {
  return {
    q: filters.keywords,
    category: filters.category,
    minPriceCents: filters.minPrice !== undefined ? Math.round(filters.minPrice * 100) : undefined,
    maxPriceCents: filters.maxPrice !== undefined ? Math.round(filters.maxPrice * 100) : undefined,
    minRating: filters.minRating,
    inStock: filters.inStockOnly || undefined,
    sort: filters.sort ? SORT_MAP[filters.sort] : undefined,
    page,
    limit,
  };
}

/**
 * Natural-language search: AI extracts filters → ordinary database query.
 * If keywords plus filters find nothing, the keywords are dropped and the filters kept
 * (`relaxed: true`). If the AI fails for any reason, plain text search runs instead
 * (`fallback: true`).
 */
export async function naturalLanguageSearch(query, { page, limit, userId }) {
  let filters;
  try {
    filters = await interpretQuery(query, { userId });
  } catch (err) {
    if (!(err instanceof AIUnavailableError)) throw err;
    const { items, meta } = await searchProducts({ q: query, page, limit });
    return {
      products: items,
      meta,
      interpretedFilters: null,
      chips: [],
      fallback: true,
      relaxed: false,
    };
  }

  let { items, meta } = await searchProducts(toSearchParams(filters, { page, limit }));
  let relaxed = false;
  if (meta.total === 0 && filters.keywords && Object.keys(filters).length > 1) {
    ({ items, meta } = await searchProducts(
      toSearchParams({ ...filters, keywords: undefined }, { page, limit }),
    ));
    relaxed = true;
  }

  const chips = describeFilters(relaxed ? { ...filters, keywords: undefined } : filters);
  return {
    products: items,
    meta,
    interpretedFilters: filters,
    chips,
    summary: chips.length ? `Showing results for: ${chips.map((c) => c.label).join(', ')}` : null,
    fallback: false,
    relaxed,
  };
}
