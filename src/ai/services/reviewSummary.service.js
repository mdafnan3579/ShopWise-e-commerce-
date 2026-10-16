import { Product } from '../../models/Product.js';
import { Review } from '../../models/Review.js';
import { AppError } from '../../utils/AppError.js';
import { AIUnavailableError, MODELS, createStructured } from '../client.js';
import { reviewSummarySystemPrompt, reviewSummaryUserPrompt } from '../prompts/reviewSummary.js';
import { reviewSummarySchema } from '../schemas.js';

const FEATURE = 'review_summary';
export const MIN_REVIEWS_FOR_SUMMARY = 3;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_REVIEWS_IN_PROMPT = 50;
const MAX_COMMENT_CHARS = 600;

// Concurrent requests for the same product share one AI call instead of stampeding.
const inFlight = new Map();

/**
 * Regenerate only when the reviews changed since the summary was made AND the summary is older
 * than 24h. A popular product with frequent reviews costs at most one AI call per day.
 */
export function isSummaryStale(product, now = Date.now()) {
  const cached = product.aiReviewSummary;
  if (!cached?.generatedAt) return true;
  const reviewsChanged = product.reviewsUpdatedAt && product.reviewsUpdatedAt > cached.generatedAt;
  return Boolean(reviewsChanged) && now - cached.generatedAt.getTime() > CACHE_TTL_MS;
}

function clean(summary) {
  const trimList = (list, max) =>
    list
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, max)
      .map((item) => item.slice(0, 120));
  return {
    summary: summary.summary.trim().slice(0, 400),
    pros: trimList(summary.pros, 4),
    cons: trimList(summary.cons, 3),
  };
}

async function generateSummary(product) {
  const reviews = await Review.find({ product: product._id })
    .sort({ createdAt: -1 })
    .limit(MAX_REVIEWS_IN_PROMPT)
    .select('rating title comment')
    .lean();

  const result = await createStructured(
    { feature: FEATURE, timeoutMs: 15_000 },
    {
      model: MODELS.fast,
      max_tokens: 800,
      system: reviewSummarySystemPrompt(),
      messages: [
        {
          role: 'user',
          content: reviewSummaryUserPrompt({
            productName: product.name,
            averageRating: product.averageRating,
            reviews: reviews.map((r) => ({ ...r, comment: r.comment.slice(0, MAX_COMMENT_CHARS) })),
          }),
        },
      ],
      output_config: { effort: 'low' },
    },
    reviewSummarySchema,
  );

  const aiReviewSummary = {
    ...clean(result),
    generatedAt: new Date(),
    reviewCountAtGeneration: product.reviewCount,
  };
  await Product.updateOne({ _id: product._id }, { aiReviewSummary });
  return aiReviewSummary;
}

function present(summary, { cached, stale = false }) {
  return {
    status: 'ready',
    aiGenerated: true,
    cached,
    stale,
    summary: summary.summary,
    pros: summary.pros,
    cons: summary.cons,
    generatedAt: summary.generatedAt,
    basedOnReviews: summary.reviewCountAtGeneration,
  };
}

/**
 * Always resolves (never 5xx) so the product page can simply hide the card when
 * `status !== 'ready'`. Statuses: ready · insufficient_reviews · unavailable.
 */
export async function getReviewSummary(productId) {
  const product = await Product.findOne({ _id: productId, isActive: true })
    .select('name averageRating reviewCount reviewsUpdatedAt aiReviewSummary')
    .lean();
  if (!product) throw AppError.notFound('Product');

  if (product.reviewCount < MIN_REVIEWS_FOR_SUMMARY) {
    return {
      status: 'insufficient_reviews',
      reviewCount: product.reviewCount,
      minReviews: MIN_REVIEWS_FOR_SUMMARY,
    };
  }

  const cached = product.aiReviewSummary;
  if (cached?.generatedAt && !isSummaryStale(product)) return present(cached, { cached: true });

  const key = String(product._id);
  if (!inFlight.has(key)) {
    inFlight.set(
      key,
      generateSummary(product).finally(() => inFlight.delete(key)),
    );
  }

  try {
    return present(await inFlight.get(key), { cached: false });
  } catch (err) {
    if (!(err instanceof AIUnavailableError)) throw err;
    // Serve the old summary rather than nothing.
    return cached?.generatedAt
      ? present(cached, { cached: true, stale: true })
      : { status: 'unavailable' };
  }
}
