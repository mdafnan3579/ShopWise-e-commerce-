import { z } from 'zod';
import { paginationQuery } from '../utils/pagination.js';
import { idParams } from './common.js';

const reviewFields = {
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().max(100).optional(),
  comment: z.string().trim().min(10, 'Please write at least 10 characters').max(2000),
};

export const listReviewsSchema = {
  params: idParams('id'),
  query: z.object({
    ...paginationQuery,
    sort: z.enum(['-createdAt', 'createdAt', '-rating', 'rating']).default('-createdAt'),
    rating: z.coerce.number().int().min(1).max(5).optional(),
  }),
};

export const createReviewSchema = {
  params: idParams('id'),
  body: z.object(reviewFields),
};

export const updateReviewSchema = {
  params: idParams('id'),
  body: z
    .object(reviewFields)
    .partial()
    .refine((b) => Object.keys(b).length > 0, { error: 'Provide at least one field to update' }),
};

export const reviewIdSchema = { params: idParams('id') };
