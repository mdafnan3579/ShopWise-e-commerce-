import * as orderService from '../services/order.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

export async function listMyOrders(req, res) {
  const { items, meta } = await orderService.listMyOrders(req.user.id, req.validated.query);
  sendSuccess(res, { data: items, meta });
}

export async function getMyOrder(req, res) {
  sendSuccess(res, { data: await orderService.getMyOrder(req.user.id, req.validated.params.id) });
}

export async function getMyOrderBySession(req, res) {
  const order = await orderService.getMyOrderBySession(req.user.id, req.validated.params.sessionId);
  sendSuccess(res, { data: order });
}

export async function cancelMyOrder(req, res) {
  const order = await orderService.cancelMyOrder(req.user.id, req.validated.params.id);
  sendSuccess(res, { data: order, message: 'Order cancelled' });
}

// --- Admin ---

export async function listOrders(req, res) {
  const { items, meta } = await orderService.listOrders(req.validated.query);
  sendSuccess(res, { data: items, meta });
}

export async function getOrder(req, res) {
  sendSuccess(res, { data: await orderService.getOrder(req.validated.params.id) });
}

export async function updateOrderStatus(req, res) {
  const { status, note } = req.validated.body;
  const order = await orderService.updateOrderStatus(req.validated.params.id, status, note);
  sendSuccess(res, { data: order, message: `Order marked ${status}` });
}
