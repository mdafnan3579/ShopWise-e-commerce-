import { Order } from '../../models/Order.js';
import { Product } from '../../models/Product.js';
import { RecommendationCache } from '../../models/RecommendationCache.js';
import { User } from '../../models/User.js';
import { PRODUCT_CARD_FIELDS } from '../../services/user.service.js';
import { formatMoney } from '../../utils/money.js';
import { AIUnavailableError, MODELS, createStructured } from '../client.js';
import {
  recommendationsSystemPrompt,
  recommendationsUserPrompt,
} from '../prompts/recommendations.js';
import { recommendationsSchema } from '../schemas.js';

const FEATURE = 'recommendations';
const RESULT_COUNT = 6;
const MAX_CANDIDATES = 30;
const CACHE_TTL_MS = 60 * 60 * 1000;

async function topRated(excludeIds = [], limit = RESULT_COUNT) {
  return Product.find({ isActive: true, stock: { $gt: 0 }, _id: { $nin: excludeIds } })
    .select(PRODUCT_CARD_FIELDS)
    .sort({ averageRating: -1, reviewCount: -1, _id: 1 })
    .limit(limit)
    .lean();
}

const withoutReasons = (products) => products.map((product) => ({ product, reason: null }));

/** What we know about the shopper: recent paid purchases and wishlist. */
async function gatherSignals(userId) {
  const [orders, user] = await Promise.all([
    Order.find({ user: userId, paymentStatus: 'paid' })
      .sort({ paidAt: -1 })
      .limit(20)
      .select('items.product items.name')
      .lean(),
    User.findById(userId)
      .select('wishlist')
      .populate({ path: 'wishlist', select: 'name category isActive' })
      .lean(),
  ]);

  const purchasedIds = [...new Set(orders.flatMap((o) => o.items.map((i) => String(i.product))))];
  const purchased = await Product.find({ _id: { $in: purchasedIds } })
    .select('name category')
    .lean();
  const wishlist = (user?.wishlist ?? []).filter((p) => p?.isActive);

  return { purchasedIds, purchased, wishlist };
}

/** Candidates: in-stock products from the shopper's categories plus wishlist items, minus purchases. */
async function gatherCandidates({ purchasedIds, purchased, wishlist }) {
  const categories = [...new Set([...purchased, ...wishlist].map((p) => p.category))];
  const fromCategories = await Product.find({
    isActive: true,
    stock: { $gt: 0 },
    category: { $in: categories },
    _id: { $nin: purchasedIds },
  })
    .select(PRODUCT_CARD_FIELDS)
    .sort({ averageRating: -1, reviewCount: -1 })
    .limit(MAX_CANDIDATES)
    .lean();

  const wishlistIds = wishlist.map((p) => String(p._id)).filter((id) => !purchasedIds.includes(id));
  const missingWishlist = wishlistIds.filter(
    (id) => !fromCategories.some((p) => String(p._id) === id),
  );
  const wishlistProducts = missingWishlist.length
    ? await Product.find({ _id: { $in: missingWishlist }, isActive: true, stock: { $gt: 0 } })
        .select(PRODUCT_CARD_FIELDS)
        .lean()
    : [];

  return [...wishlistProducts, ...fromCategories].slice(0, MAX_CANDIDATES);
}

async function rankWithAI(signals, candidates, userId) {
  const result = await createStructured(
    { feature: FEATURE, userId, timeoutMs: 12_000 },
    {
      model: MODELS.fast,
      max_tokens: 1000,
      system: recommendationsSystemPrompt(),
      messages: [
        {
          role: 'user',
          content: recommendationsUserPrompt({
            purchased: signals.purchased,
            wishlist: signals.wishlist,
            candidates: candidates.map((p) => ({
              id: String(p._id),
              name: p.name,
              category: p.category,
              brand: p.brand,
              priceUsd: formatMoney(p.priceCents),
              rating: p.averageRating,
            })),
          }),
        },
      ],
      output_config: { effort: 'low' },
    },
    recommendationsSchema,
  );

  // Grounding: keep only ids we offered, once each.
  const byId = new Map(candidates.map((p) => [String(p._id), p]));
  const seen = new Set();
  const ranked = [];
  for (const { productId, reason } of result.recommendations) {
    if (!byId.has(productId) || seen.has(productId)) continue;
    seen.add(productId);
    ranked.push({ product: byId.get(productId), reason: reason.trim().slice(0, 160) });
    if (ranked.length === RESULT_COUNT) break;
  }
  if (ranked.length === 0) throw new AIUnavailableError(undefined, 'invalid_output');
  return ranked;
}

async function fromCache(userId) {
  const cached = await RecommendationCache.findOne({ user: userId, expiresAt: { $gt: new Date() } })
    .populate({ path: 'items.product', select: PRODUCT_CARD_FIELDS })
    .lean();
  if (!cached) return null;

  // Products are re-read on every request, so price and stock changes show immediately.
  const items = cached.items.filter((i) => i.product?.isActive);
  return items.length
    ? { source: 'ai', cached: true, generatedAt: cached.generatedAt, items }
    : null;
}

/**
 * Guests: top-rated products, no AI. Logged-in users: candidates from their purchase and
 * wishlist categories, ranked by the fast model with a reason each, cached for 1 hour.
 * Any AI failure falls back to the candidates sorted by rating.
 *
 * @returns {Promise<{ source: 'ai' | 'fallback' | 'top_rated', cached: boolean, items: Array<{ product: object, reason: string | null }> }>}
 */
export async function getRecommendations(userId) {
  if (!userId) {
    return { source: 'top_rated', cached: false, items: withoutReasons(await topRated()) };
  }

  const cached = await fromCache(userId);
  if (cached) return cached;

  const signals = await gatherSignals(userId);
  if (signals.purchased.length === 0 && signals.wishlist.length === 0) {
    return { source: 'top_rated', cached: false, items: withoutReasons(await topRated()) };
  }

  let candidates = await gatherCandidates(signals);
  if (candidates.length < RESULT_COUNT) {
    const padding = await topRated(
      [...signals.purchasedIds, ...candidates.map((p) => p._id)],
      RESULT_COUNT - candidates.length,
    );
    candidates = [...candidates, ...padding];
  }

  try {
    const items = await rankWithAI(signals, candidates, userId);
    const generatedAt = new Date();
    await RecommendationCache.findOneAndUpdate(
      { user: userId },
      {
        items: items.map((i) => ({ product: i.product._id, reason: i.reason })),
        generatedAt,
        expiresAt: new Date(generatedAt.getTime() + CACHE_TTL_MS),
      },
      { upsert: true },
    );
    return { source: 'ai', cached: false, generatedAt, items };
  } catch (err) {
    if (!(err instanceof AIUnavailableError)) throw err;
    return {
      source: 'fallback',
      cached: false,
      items: withoutReasons(candidates.slice(0, RESULT_COUNT)),
    };
  }
}
