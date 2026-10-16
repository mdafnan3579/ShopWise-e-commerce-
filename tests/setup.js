import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll, inject, vi } from 'vitest';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { fakeAnthropic } from './helpers/fakeAnthropic.js';

// Every test file gets the fake Anthropic client: the suite can never call the real API.
vi.mock('@anthropic-ai/sdk', async (importOriginal) => {
  const actual = await importOriginal();
  const { fakeAnthropic: fake } = await import('./helpers/fakeAnthropic.js');
  const Real = actual.default;

  class FakeAnthropic {
    constructor() {
      return fake;
    }
  }
  // Keep the real error classes so `instanceof Anthropic.APIError` checks still work.
  for (const name of [
    'APIError',
    'APIUserAbortError',
    'APIConnectionTimeoutError',
    'RateLimitError',
  ]) {
    FakeAnthropic[name] = Real[name];
  }
  return { ...actual, default: FakeAnthropic, Anthropic: FakeAnthropic };
});

// Each test file runs against its own database, so files can run in parallel safely.
beforeAll(async () => {
  await connectDB(inject('mongoUri'), { dbName: `shopwise_test_${randomUUID()}` });
  // Wait for index builds (unique, text, TTL) so tests that rely on them are deterministic.
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
});

afterEach(async () => {
  fakeAnthropic.reset();
  const collections = Object.values(mongoose.connection.collections);
  await Promise.all(collections.map((collection) => collection.deleteMany({})));
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await disconnectDB();
});
