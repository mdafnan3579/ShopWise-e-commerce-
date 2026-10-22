import * as reviewService from '../services/review.service.js';
import { sendCreated, sendSuccess } from '../utils/apiResponse.js';

export async function listReviews(req, res) {
  const { items, meta } = await reviewService.listReviews(
    req.validated.params.id,
    req.validated.query,
  );
  sendSuccess(res, { data: items, meta });
}

export async function createReview(req, res) {
  const review = await reviewService.createReview(
    req.user.id,
    req.validated.params.id,
    req.validated.body,
  );
  sendCreated(res, { data: review, message: 'Review posted' });
}

export async function updateReview(req, res) {
  const review = await reviewService.updateReview(
    req.user,
    req.validated.params.id,
    req.validated.body,
  );
  sendSuccess(res, { data: review, message: 'Review updated' });
}

export async function deleteReview(req, res) {
  await reviewService.deleteReview(req.user, req.validated.params.id);
  sendSuccess(res, { message: 'Review deleted' });
}
