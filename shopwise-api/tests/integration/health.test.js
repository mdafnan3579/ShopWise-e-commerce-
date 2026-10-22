import mongoose from 'mongoose';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';

const app = createApp();

describe('GET /health', () => {
  it.each(['/health', '/api/v1/health'])('%s reports ok when the database is up', async (path) => {
    const res = await request(app).get(path);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      data: { status: 'ok', checks: { database: 'connected' } },
    });
    expect(res.body.data.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('returns 503 with the error envelope when the database is down', async () => {
    // readyState is a getter on Connection.prototype — spy there so restore is clean.
    const spy = vi
      .spyOn(Object.getPrototypeOf(mongoose.connection), 'readyState', 'get')
      .mockReturnValue(0);

    try {
      const res = await request(app).get('/health');

      expect(res.status).toBe(503);
      expect(res.body).toMatchObject({
        success: false,
        error: { code: 'SERVICE_UNAVAILABLE', details: { status: 'degraded' } },
      });
    } finally {
      spy.mockRestore();
    }
  });

  it('sets security headers and a request id', async () => {
    const res = await request(app).get('/health');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-request-id']).toMatch(/^[\w-]{8,64}$/);
  });

  it('reuses a well-formed incoming X-Request-Id', async () => {
    const res = await request(app).get('/health').set('X-Request-Id', 'trace-abc-12345');
    expect(res.headers['x-request-id']).toBe('trace-abc-12345');
  });
});
