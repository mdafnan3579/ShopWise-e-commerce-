import { Router } from 'express';
import * as ai from '../controllers/ai.controller.js';
import { optionalAuth, requireAuth, requireRole } from '../middleware/auth.js';
import { createRateLimiter, userOrIpKey } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import {
  aiSearchSchema,
  chatSchema,
  chatSessionSchema,
  generateDescriptionSchema,
} from '../validators/ai.validators.js';

const aiLimitMessage = 'You are sending AI requests too quickly. Please wait a moment.';

/**
 * AI endpoints. Each has its own, stricter rate limit (per user when logged in, per IP for
 * guests), on top of the global API limiter, because every call costs real money.
 */
export function createAIRouter(limits) {
  const router = Router();
  const limiter = (name) =>
    createRateLimiter({ ...limits[name], keyGenerator: userOrIpKey, message: aiLimitMessage });

  router.post('/chat', optionalAuth, limiter('aiChat'), validate(chatSchema), ai.chat);
  router.get('/chat/sessions/:id', optionalAuth, validate(chatSessionSchema), ai.getChatSession);
  router.delete(
    '/chat/sessions/:id',
    optionalAuth,
    validate(chatSessionSchema),
    ai.deleteChatSession,
  );

  router.post('/search', optionalAuth, limiter('aiSearch'), validate(aiSearchSchema), ai.search);

  router.get('/recommendations', optionalAuth, limiter('aiRecommendations'), ai.recommendations);

  router.post(
    '/admin/generate-description',
    requireAuth,
    requireRole('admin'),
    limiter('aiAdmin'),
    validate(generateDescriptionSchema),
    ai.generateDescription,
  );

  return router;
}

/** Review summaries live under /products/:id/review-summary but share the AI rate limits. */
export function createReviewSummaryLimiter(limits) {
  return createRateLimiter({
    ...limits.aiSummary,
    keyGenerator: userOrIpKey,
    message: aiLimitMessage,
  });
}
