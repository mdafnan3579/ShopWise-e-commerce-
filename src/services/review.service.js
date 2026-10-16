import { Product } from '../models/Product.js';
import { Review } from '../models/Review.js';
import { AppError } from '../utils/AppError.js';
import { paginate, toMongoSort } from '../utils/pagination.js';
import { hasPaidOrderFor } from './order.service.js';

const REVIEWER_FIELDS = { path: 'user', select: 'name' };

async function ensureActiveProduct(productId) {
  if (!(await Product.exists({ _id: productId, isActive: true }))) {
    throw AppError.notFound('Product');
  }
}

export async function listReviews(productId, { page, limit, sort, rating }) {
  await ensureActiveProduct(productId);

  const filter = { product: productId };
  if (rating) filter.rating = rating;

  return paginate(Review, {
    filter,
    sort: toMongoSort(sort),
    page,
    limit,
    populate: REVIEWER_FIELDS,
  });
}

export async function createReview(userId, productId, { rating, title, comment }) {
  await ensureActiveProduct(productId);

  let review;
  try {
    review = await Review.create({
      user: userId,
      product: productId,
      rating,
      title,
      comment,
      verifiedPurchase: await hasPaidOrderFor(userId, productId),
    });
  } catch (err) {
    // The unique index catches double submissions, even concurrent ones.
    if (err?.code === 11000) {
      throw new AppError('You have already reviewed this product', 409, 'ALREADY_REVIEWED');
    }
    throw err;
  }

  await Review.recalculateProductRating(productId);
  return review.populate(REVIEWER_FIELDS);
}

async function findReviewOrThrow(reviewId) {
  const review = await Review.findById(reviewId);
  if (!review) throw AppError.notFound('Review');
  return review;
}

export async function updateReview(actor, reviewId, changes) {
  const review = await findReviewOrThrow(reviewId);
  if (String(review.user) !== actor.id)
    throw AppError.forbidden('You can only edit your own reviews');

  review.set(changes);
  await review.save();
  await Review.recalculateProductRating(review.product);
  return review.populate(REVIEWER_FIELDS);
}

/** Authors can delete their own reviews; admins can moderate any review. */
export async function deleteReview(actor, reviewId) {
  const review = await findReviewOrThrow(reviewId);
  const isOwner = String(review.user) === actor.id;
  if (!isOwner && actor.role !== 'admin') {
    throw AppError.forbidden('You can only delete your own reviews');
  }

  await review.deleteOne();
  await Review.recalculateProductRating(review.product);
}
