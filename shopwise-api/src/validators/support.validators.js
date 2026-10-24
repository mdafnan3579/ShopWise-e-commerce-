import { z } from 'zod';
import { TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUSES } from '../models/SupportTicket.js';
import { paginationQuery, sortQuery } from '../utils/pagination.js';
import { idParams, searchTerm } from './common.js';

export const listTicketsSchema = {
  query: z.object({
    ...paginationQuery,
    status: z.enum(TICKET_STATUSES).optional(),
    priority: z.enum(TICKET_PRIORITIES).optional(),
    category: z.enum(TICKET_CATEGORIES).optional(),
    q: searchTerm.optional(),
    sort: sortQuery(['-createdAt', 'createdAt'], '-createdAt'),
  }),
};

export const updateTicketStatusSchema = {
  params: idParams('id'),
  body: z.object({ status: z.enum(TICKET_STATUSES) }),
};
