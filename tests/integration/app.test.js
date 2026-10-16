import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';

const app = createApp();
const ALLOWED_ORIGIN = 'http://localhost:5173';

describe('app-level behavior', () => {
  it('returns 404 in the error envelope for unknown routes', async () => {
    const res = await request(app).get('/api/v1/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Route GET /api/v1/does-not-exist not found' },
    });
  });

  it('returns 400 INVALID_JSON for malformed JSON bodies', async () => {
    const res = await request(app)
      .post('/api/v1/anything')
      .set('Content-Type', 'application/json')
      .send('{"broken": ');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });

  it('returns 413 for bodies over the size limit', async () => {
    const res = await request(app)
      .post('/api/v1/anything')
      .send({ blob: 'x'.repeat(200 * 1024) });

    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('rejects Mongo operator keys in the body', async () => {
    const res = await request(app)
      .post('/api/v1/anything')
      .send({ email: { $ne: null } });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('rejects Mongo operator keys in the query string', async () => {
    const res = await request(app).get('/api/v1/health?$where=1');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_INPUT');
  });

  describe('CORS', () => {
    it('allows the configured client origin with credentials', async () => {
      const res = await request(app).get('/health').set('Origin', ALLOWED_ORIGIN);

      expect(res.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });

    it('does not grant CORS to other origins', async () => {
      const res = await request(app).get('/health').set('Origin', 'https://evil.example.com');
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('answers preflight requests for the allowed origin', async () => {
      const res = await request(app)
        .options('/api/v1/health')
        .set('Origin', ALLOWED_ORIGIN)
        .set('Access-Control-Request-Method', 'POST');

      expect(res.status).toBe(204);
      expect(res.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
    });
  });

  it('exposes rate limit headers on API routes', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.headers['ratelimit-policy']).toBeDefined();
  });
});
