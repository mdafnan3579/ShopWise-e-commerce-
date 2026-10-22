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
      JWT_ACCESS_SECRET: 'test-only-secret-that-is-at-least-32-characters-long',
      BCRYPT_ROUNDS: '4', // fast hashing in tests; production uses 12
      // Fake credentials: Stripe API calls are mocked; webhook signatures are generated locally.
      STRIPE_SECRET_KEY: 'sk_test_fake_key_for_tests',
      STRIPE_WEBHOOK_SECRET: 'whsec_test_secret',
      // The Anthropic SDK is mocked in tests (tests/helpers/fakeAnthropic.js); no real calls.
      ANTHROPIC_API_KEY: 'sk-ant-test-key',
    },
    testTimeout: 15_000,
    hookTimeout: 120_000, // first run downloads the mongod binary
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js'],
      exclude: ['src/server.js', 'src/scripts/**', 'src/docs/paths/**'],
      // CI fails if coverage drops below these (current: ~90% statements, ~77% branches).
      thresholds: { statements: 85, branches: 70, functions: 85, lines: 85 },
    },
  },
});
