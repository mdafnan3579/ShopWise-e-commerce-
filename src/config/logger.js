import pino from 'pino';
import { env } from './env.js';

/**
 * Structured JSON logger. Pretty-printed in development only — production emits JSON lines
 * that log platforms (Render, Datadog, ...) can parse and index.
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: 'shopwise-api', env: env.NODE_ENV },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      '*.password',
      '*.passwordHash',
      '*.token',
      '*.refreshToken',
    ],
    censor: '[REDACTED]',
  },
  ...(env.isDevelopment && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:HH:MM:ss',
        ignore: 'pid,hostname,service,env',
      },
    },
  }),
});
