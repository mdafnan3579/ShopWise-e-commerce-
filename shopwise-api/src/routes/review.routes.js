import { Router } from 'express';
import * as reviews from '../controllers/review.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { reviewIdSchema, updateReviewSchema } from '../validators/review.validators.js';

export function createReviewRouter() {
  const router = Router();
  router.use(requireAuth);

  router.patch('/:id', validate(updateReviewSchema), reviews.updateReview);
  router.delete('/:id', validate(reviewIdSchema), reviews.deleteReview);

  return router;
}
