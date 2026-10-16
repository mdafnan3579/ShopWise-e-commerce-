import { z } from 'zod';

const DAY_MS = 24 * 60 * 60 * 1000;
// Upper bound on buckets per granularity keeps the response (and chart) a sensible size.
const MAX_RANGE_DAYS = { day: 366, week: 366 * 2, month: 366 * 5 };

export const statsSchema = {
  query: z
    .object({
      from: z.coerce.date().optional(),
      to: z.coerce.date().optional(),
      granularity: z.enum(['day', 'week', 'month']).default('day'),
    })
    .refine((q) => !q.from || !q.to || q.from < q.to, {
      error: 'from must be before to',
      path: ['from'],
    })
    .refine(
      (q) => {
        const to = q.to ?? new Date();
        const from = q.from ?? new Date(to.getTime() - 30 * DAY_MS);
        return to.getTime() - from.getTime() <= MAX_RANGE_DAYS[q.granularity] * DAY_MS;
      },
      { error: 'Date range is too large for this granularity', path: ['from'] },
    ),
};
