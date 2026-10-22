import { z } from 'zod';
import { CATEGORIES } from '../config/catalog.js';
import { paginationQuery } from '../utils/pagination.js';
import { idParams, objectId } from './common.js';

// Input length limits keep prompts (and therefore cost) bounded.
export const MAX_CHAT_MESSAGE_CHARS = 1000;
export const MAX_SEARCH_QUERY_CHARS = 200;

export const chatSchema = {
  body: z.object({
    message: z.string().trim().min(1).max(MAX_CHAT_MESSAGE_CHARS),
    sessionId: objectId.optional(),
  }),
};

export const chatSessionSchema = { params: idParams('id') };

export const aiSearchSchema = {
  body: z.object({
    query: z.string().trim().min(2).max(MAX_SEARCH_QUERY_CHARS),
    page: paginationQuery.page,
    limit: paginationQuery.limit,
  }),
};

export const generateDescriptionSchema = {
  body: z.object({
    name: z.string().trim().min(2).max(140),
    category: z.enum(CATEGORIES),
    brand: z.string().trim().max(80).optional(),
    features: z.array(z.string().trim().min(2).max(160)).min(1).max(12),
    audience: z.string().trim().max(120).optional(),
  }),
};
