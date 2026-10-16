import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // One in-memory MongoDB replica set for the whole run; each test file gets its own database.
    globalSetup: ['./tests/globalSetup.js'],
    setupFiles: ['./tests/setup.js'],
    env: {
      NODE_ENV: 'test',
      // Placeholder to satisfy env validation — tests connect to the in-memory server instead.
      MONGODB_URI: 'mongodb://127.0.0.1:27017/shopwise-test',
      CLIENT_URL: 'http://localhost:5173',
      LOG_LEVEL: 'silent',
    },
    testTimeout: 15_000,
    hookTimeout: 120_000, // first run downloads the mongod binary
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js'],
      exclude: ['src/server.js', 'src/scripts/**'],
    },
  },
});
