import axios from 'axios';

export const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:5000').replace(/\/$/, '');

/** Auth is cookie-based, so every request sends credentials (API.md §2). */
export const http = axios.create({
  baseURL: `${API_URL}/api/v1`,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

const NO_REFRESH_PATHS = ['/auth/login', '/auth/register', '/auth/refresh'];
const REFRESHABLE_CODES = new Set(['TOKEN_EXPIRED', 'INVALID_TOKEN']);

let refreshPromise = null;
let authHooks = { isLoggedIn: () => false, onSessionEnded: () => {} };

/** Lets the auth store plug into the interceptor without a circular import. */
export function configureAuthHooks(hooks) {
  authHooks = { ...authHooks, ...hooks };
}

/**
 * Refresh tokens rotate on every use and replaying one logs the user out everywhere,
 * so all requests that fail together share a single in-flight refresh.
 */
export function refreshSession() {
  refreshPromise ??= http
    .post('/auth/refresh', null, { _skipRefresh: true })
    .then((res) => res.data.data.user)
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

http.interceptors.response.use(undefined, async (error) => {
  const { config, response } = error;
  if (!config || !response || response.status !== 401) throw error;
  if (config._skipRefresh || config._retried) throw error;
  if (NO_REFRESH_PATHS.some((path) => config.url?.startsWith(path))) throw error;

  const code = response.data?.error?.code;
  const shouldRefresh =
    REFRESHABLE_CODES.has(code) || (code === 'UNAUTHORIZED' && authHooks.isLoggedIn());
  if (!shouldRefresh) throw error;

  try {
    await refreshSession();
  } catch {
    authHooks.onSessionEnded();
    throw error;
  }
  return http({ ...config, _retried: true });
});

/** Unwraps the `{ success, data }` envelope. */
export const unwrap = (res) => res.data.data;

/** Unwraps a paginated list into `{ items, meta }`. */
export const unwrapList = (res) => ({ items: res.data.data, meta: res.data.meta });

/** Normalizes axios / fetch errors into `{ status, code, message, details }`. */
export function toApiError(error) {
  if (error?.code && error?.status !== undefined && !error.isAxiosError) return error;
  const body = error?.response?.data?.error;
  if (body) {
    return {
      status: error.response.status,
      code: body.code,
      message: body.message,
      details: body.details,
    };
  }
  if (error?.response) {
    return { status: error.response.status, code: 'HTTP_ERROR', message: 'Request failed' };
  }
  return {
    status: 0,
    code: 'NETWORK_ERROR',
    message: 'Cannot reach the ShopWise API. Is the server running?',
  };
}

export const errorMessage = (error) => toApiError(error).message;

/** Maps `VALIDATION_ERROR` details to `{ fieldName: message }` (strips the `body.` prefix). */
export function fieldErrors(error) {
  const { code, details } = toApiError(error);
  if (code !== 'VALIDATION_ERROR' || !Array.isArray(details)) return {};
  const out = {};
  for (const { path, message } of details) {
    const key = String(path).replace(/^(body|query|params)\./, '');
    out[key] ??= message;
  }
  return out;
}
