import * as supportService from '../services/supportTicket.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

export async function listTickets(req, res) {
  const { items, meta } = await supportService.listTickets(req.validated.query);
  sendSuccess(res, { data: items, meta });
}

export async function updateTicketStatus(req, res) {
  const ticket = await supportService.updateTicketStatus(
    req.validated.params.id,
    req.validated.body.status,
  );
  sendSuccess(res, { data: ticket, message: 'Ticket updated' });
}
