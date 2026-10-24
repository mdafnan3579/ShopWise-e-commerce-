import { Order } from '../models/Order.js';
import { SupportTicket } from '../models/SupportTicket.js';
import { AppError } from '../utils/AppError.js';
import { paginate, toMongoSort } from '../utils/pagination.js';
import { escapeRegex } from '../utils/regex.js';

/** Bounds what a confused or manipulated assistant can file on one customer's behalf. */
export const MAX_TICKETS_PER_DAY = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Opens a ticket for the support team. `orderNumber` must be one of the customer's own orders.
 * @param {{ userId: string, orderNumber?: string, category: string, priority: string, summary: string }} input
 */
export async function createTicket({ userId, orderNumber, category, priority, summary }) {
  const recent = await SupportTicket.countDocuments({
    user: userId,
    createdAt: { $gte: new Date(Date.now() - DAY_MS) },
  });
  if (recent >= MAX_TICKETS_PER_DAY) {
    throw new AppError(
      'Too many support tickets today. The team will reply to the existing ones.',
      429,
      'TICKET_LIMIT_REACHED',
    );
  }

  let order;
  if (orderNumber) {
    order = await Order.findOne({ orderNumber, user: userId }).select('_id orderNumber').lean();
    if (!order) throw AppError.notFound('Order');
  }

  return SupportTicket.create({
    user: userId,
    order: order?._id,
    orderNumber: order?.orderNumber,
    category,
    priority,
    summary,
  });
}

// --- Admin ---

export function listTickets({ page, limit, status, priority, category, q, sort }) {
  const filter = {};
  if (status) filter.status = status;
  if (priority) filter.priority = priority;
  if (category) filter.category = category;
  if (q) {
    const pattern = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ ticketNumber: pattern }, { orderNumber: pattern }, { summary: pattern }];
  }

  return paginate(SupportTicket, {
    filter,
    sort: toMongoSort(sort),
    page,
    limit,
    populate: { path: 'user', select: 'name email' },
  });
}

export async function updateTicketStatus(ticketId, status) {
  const ticket = await SupportTicket.findByIdAndUpdate(
    ticketId,
    { status, resolvedAt: status === 'resolved' ? new Date() : null },
    { returnDocument: 'after', runValidators: true },
  )
    .populate('user', 'name email')
    .lean();
  if (!ticket) throw AppError.notFound('Support ticket');
  return ticket;
}
