import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll, inject } from 'vitest';
import { connectDB, disconnectDB } from '../src/config/db.js';

// Each test file runs against its own database, so files can run in parallel safely.
beforeAll(async () => {
  await connectDB(inject('mongoUri'), { dbName: `shopwise_test_${randomUUID()}` });
});

afterEach(async () => {
  const collections = Object.values(mongoose.connection.collections);
  await Promise.all(collections.map((collection) => collection.deleteMany({})));
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await disconnectDB();
});
