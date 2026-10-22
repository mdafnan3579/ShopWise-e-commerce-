import { randomUUID } from 'node:crypto';
import { pinoHttp } from 'pino-http';
import { logger } from '../config/logger.js';

const REQUEST_ID_PATTERN = /^[\w-]{8,64}$/;

/**
 * Per-request structured logging. Every request gets an id (reusing a well-formed incoming
 * `X-Request-Id` from a proxy, otherwise a UUID). The id is echoed back in the response header
 * and attached to every log line written via `req.log`, so one request can be traced end to end.
 */
export const requestLogger = pinoHttp({
  logger,
  genReqId(req, res) {
    const incoming = req.headers['x-request-id'];
    const id =
      typeof incoming === 'string' && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID();
    res.setHeader('X-Request-Id', id);
    return id;
  },
  customLogLevel(_req, res, err) {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  autoLogging: { ignore: (req) => req.url === '/health' },
  // Lean serializers with no headers, so cookies and tokens can never end up in logs.
  serializers: {
    req: (req) => ({ id: req.id, method: req.method, url: req.url }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
});
