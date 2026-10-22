import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { validate } from '../../src/middleware/validate.js';
import { AppError } from '../../src/utils/AppError.js';

/** Minimal app that throws a given error, to exercise the error handler in isolation. */
function appThrowing(errorFactory) {
  const app = express();
  app.get('/boom', async () => {
    throw errorFactory();
  });
  app.use(errorHandler);
  return app;
}

describe('errorHandler', () => {
  it('formats AppError with details', async () => {
    const res = await request(
      appThrowing(() => new AppError('Out of stock', 409, 'OUT_OF_STOCK', { productId: 'p1' })),
    ).get('/boom');

    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      success: false,
      error: { code: 'OUT_OF_STOCK', message: 'Out of stock', details: { productId: 'p1' } },
    });
  });

  it('maps Mongoose CastError to 400 INVALID_ID', async () => {
    const res = await request(
      appThrowing(() => new mongoose.Error.CastError('ObjectId', 'nope', '_id')),
    ).get('/boom');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_ID');
  });

  it('maps duplicate key errors to 409 CONFLICT', async () => {
    const res = await request(
      appThrowing(() =>
        Object.assign(new Error('E11000'), { code: 11000, keyValue: { email: 'a@b.c' } }),
      ),
    ).get('/boom');

    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: 'CONFLICT', details: { fields: ['email'] } });
  });

  it('maps JWT expiry to 401 TOKEN_EXPIRED', async () => {
    const res = await request(
      appThrowing(() => Object.assign(new Error('jwt expired'), { name: 'TokenExpiredError' })),
    ).get('/boom');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_EXPIRED');
  });

  it('hides internal error messages outside development', async () => {
    const res = await request(appThrowing(() => new Error('db password is hunter2'))).get('/boom');

    expect(res.status).toBe(500);
    expect(res.body.error).toEqual({ code: 'INTERNAL_ERROR', message: 'Something went wrong' });
  });
});

describe('validate middleware', () => {
  const app = express();
  app.use(express.json());
  app.post(
    '/items/:id',
    validate({
      params: z.object({ id: z.string().length(4) }),
      query: z.object({ dryRun: z.enum(['true', 'false']).default('false') }),
      body: z.object({ name: z.string().min(2), qty: z.coerce.number().int().positive() }),
    }),
    (req, res) => res.json({ validated: req.validated, body: req.body }),
  );
  app.use(errorHandler);

  it('passes parsed, coerced, stripped values to the handler', async () => {
    const res = await request(app)
      .post('/items/abcd')
      .send({ name: 'Shoe', qty: '2', isAdmin: true });

    expect(res.status).toBe(200);
    expect(res.body.validated).toEqual({
      params: { id: 'abcd' },
      query: { dryRun: 'false' },
      body: { name: 'Shoe', qty: 2 },
    });
    expect(res.body.body).toEqual({ name: 'Shoe', qty: 2 });
  });

  it('collects issues from every request part', async () => {
    const res = await request(app).post('/items/x?dryRun=maybe').send({ name: 'S' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    const paths = res.body.error.details.map((d) => d.path);
    expect(paths).toEqual(
      expect.arrayContaining(['params.id', 'query.dryRun', 'body.name', 'body.qty']),
    );
  });
});
