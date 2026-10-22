import { getDashboardStats } from '../services/analytics.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

export async function getStats(req, res) {
  sendSuccess(res, { data: await getDashboardStats(req.validated.query) });
}
