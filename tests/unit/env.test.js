import { describe, expect, it } from 'vitest';
import { loadEnv } from '../../src/config/env.js';

const valid = {
  MONGODB_URI: 'mongodb://localhost:27017/shopwise',
  CLIENT_URL: 'http://localhost:5173',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
};

describe('loadEnv', () => {
  it('applies defaults and derives flags', () => {
    const env = loadEnv(valid);

    expect(env).toMatchObject({
      NODE_ENV: 'development',
      PORT: 5000,
      TRUST_PROXY: 0,
      LOG_LEVEL: 'debug',
      isDevelopment: true,
      isProduction: false,
    });
    expect(Object.isFrozen(env)).toBe(true);
  });

  it('parses a comma-separated CLIENT_URL into normalized origins', () => {
    const env = loadEnv({
      ...valid,
      CLIENT_URL: 'http://localhost:5173/, https://shopwise.vercel.app ',
    });
    expect(env.CLIENT_URL).toEqual(['http://localhost:5173', 'https://shopwise.vercel.app']);
  });

  it('treats empty values as unset so defaults apply', () => {
    expect(loadEnv({ ...valid, PORT: '', LOG_LEVEL: '' })).toMatchObject({
      PORT: 5000,
      LOG_LEVEL: 'debug',
    });
  });

  it('fails fast listing every invalid variable', () => {
    expect(() => loadEnv({ CLIENT_URL: 'not-a-url', PORT: 'abc' })).toThrowError(
      /MONGODB_URI[\s\S]*CLIENT_URL|CLIENT_URL[\s\S]*MONGODB_URI/,
    );
  });

  it('requires a strong JWT secret and forces Secure cookies for SameSite=None', () => {
    expect(() => loadEnv({ ...valid, JWT_ACCESS_SECRET: 'short' })).toThrowError(
      /JWT_ACCESS_SECRET/,
    );
    expect(loadEnv({ ...valid, COOKIE_SAMESITE: 'none' }).COOKIE_SECURE).toBe(true);
    expect(loadEnv(valid).COOKIE_SECURE).toBe(false);
  });

  it('requires integration credentials in production only', () => {
    expect(() => loadEnv({ ...valid, NODE_ENV: 'production' })).toThrowError(
      /CLOUDINARY_CLOUD_NAME: required in production/,
    );
    expect(loadEnv(valid).CLOUDINARY_CLOUD_NAME).toBeUndefined();
  });

  it('rejects non-mongodb connection strings', () => {
    expect(() => loadEnv({ ...valid, MONGODB_URI: 'postgres://localhost/db' })).toThrowError(
      /MONGODB_URI/,
    );
  });
});
