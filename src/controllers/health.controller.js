import mongoose from 'mongoose';
import pkg from '../../package.json' with { type: 'json' };
import { isDBConnected } from '../config/db.js';
import { sendSuccess } from '../utils/apiResponse.js';

const DB_STATES = ['disconnected', 'connected', 'connecting', 'disconnecting'];

/**
 * Liveness + readiness in one: 200 when the API can serve traffic, 503 when MongoDB is down,
 * so a load balancer or Render's health check stops routing to an unhealthy instance.
 */
export function getHealth(_req, res) {
  const healthy = isDBConnected();
  const report = {
    status: healthy ? 'ok' : 'degraded',
    version: pkg.version,
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    checks: {
      database: DB_STATES[mongoose.connection.readyState] ?? 'unknown',
    },
  };

  if (!healthy) {
    return res.status(503).json({
      success: false,
      error: { code: 'SERVICE_UNAVAILABLE', message: 'Database unavailable', details: report },
    });
  }
  return sendSuccess(res, { data: report });
}
