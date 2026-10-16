import { Router } from 'express';
import * as products from '../controllers/product.controller.js';
import * as reviews from '../controllers/review.controller.js';
import { optionalAuth, requireAuth, requireRole } from '../middleware/auth.js';
import { createRateLimiter, userOrIpKey } from '../middleware/rateLimit.js';
import { productImagesUpload } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import {
  createProductSchema,
  deleteImageSchema,
  listProductsSchema,
  productIdSchema,
  productLookupSchema,
  updateProductSchema,
} from '../validators/product.validators.js';
import { createReviewSchema, listReviewsSchema } from '../validators/review.validators.js';

const adminOnly = [requireAuth, requireRole('admin')];

export function createProductRouter(limits) {
  const router = Router();
  const reviewLimiter = createRateLimiter({ ...limits.review, keyGenerator: userOrIpKey });

  // Public catalog. Static paths come before `/:idOrSlug`.
  router.get('/', validate(listProductsSchema), products.listProducts);
  router.get('/categories', products.getCategories);
  router.get('/:idOrSlug', optionalAuth, validate(productLookupSchema), products.getProduct);
  router.get('/:id/related', validate(productIdSchema), products.getRelated);

  // Reviews
  router.get('/:id/reviews', validate(listReviewsSchema), reviews.listReviews);
  router.post(
    '/:id/reviews',
    requireAuth,
    reviewLimiter,
    validate(createReviewSchema),
    reviews.createReview,
  );

  // Admin writes
  router.post('/', ...adminOnly, validate(createProductSchema), products.createProduct);
  router.patch('/:id', ...adminOnly, validate(updateProductSchema), products.updateProduct);
  router.delete('/:id', ...adminOnly, validate(productIdSchema), products.deleteProduct);
  router.post(
    '/:id/images',
    ...adminOnly,
    validate(productIdSchema),
    productImagesUpload,
    products.uploadImages,
  );
  router.delete(
    '/:id/images/:imageId',
    ...adminOnly,
    validate(deleteImageSchema),
    products.deleteImage,
  );

  return router;
}
