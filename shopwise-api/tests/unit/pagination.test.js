import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  MAX_PAGE_SIZE,
  buildPaginationMeta,
  getSkip,
  paginationQuery,
  toMongoSort,
} from '../../src/utils/pagination.js';

describe('pagination utils', () => {
  const schema = z.object(paginationQuery);

  it('coerces query strings and applies defaults', () => {
    expect(schema.parse({})).toEqual({ page: 1, limit: 20 });
    expect(schema.parse({ page: '3', limit: '50' })).toEqual({ page: 3, limit: 50 });
  });

  it(`rejects limit above ${MAX_PAGE_SIZE} and non-positive pages`, () => {
    expect(schema.safeParse({ limit: '500' }).success).toBe(false);
    expect(schema.safeParse({ page: '0' }).success).toBe(false);
  });

  it('computes skip', () => {
    expect(getSkip({ page: 3, limit: 20 })).toBe(40);
  });

  it('builds meta', () => {
    expect(buildPaginationMeta({ total: 45, page: 2, limit: 20 })).toEqual({
      page: 2,
      limit: 20,
      total: 45,
      totalPages: 3,
      hasNextPage: true,
      hasPrevPage: true,
    });
    expect(buildPaginationMeta({ total: 0, page: 1, limit: 20 })).toMatchObject({
      totalPages: 1,
      hasNextPage: false,
      hasPrevPage: false,
    });
  });

  it('converts sort strings with a stable tiebreaker', () => {
    expect(toMongoSort('-price')).toEqual({ price: -1, _id: 1 });
    expect(toMongoSort('createdAt')).toEqual({ createdAt: 1, _id: 1 });
  });
});
