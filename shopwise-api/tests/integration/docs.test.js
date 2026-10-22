import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

/**
 * Documentation coverage: every route registered in Express must appear in the OpenAPI spec,
 * and every documented operation must exist. Adding an endpoint without docs fails CI.
 *
 * Express 5 does not keep mount paths on router layers, so `Router.prototype.use` is wrapped
 * (before the app is built) to remember the prefix of each mounted layer.
 */
const { Router } = express; // Express 5 re-exports the `router` package's Router
const mountPrefixes = new WeakMap();
const originalUse = Router.prototype.use;
Router.prototype.use = function trackedUse(...args) {
  const result = originalUse.apply(this, args);
  const path = typeof args[0] === 'string' ? args[0] : '/';
  const handlerCount = args.flat(Infinity).filter((a) => typeof a === 'function').length;
  this.stack.slice(-handlerCount).forEach((layer) => mountPrefixes.set(layer, path));
  return result;
};

const { createApp } = await import('../../src/app.js');
const { openApiSpec } = await import('../../src/docs/openapi.js');
const app = createApp();

const join = (...parts) => `/${parts.join('/')}`.replace(/\/+/g, '/').replace(/(.)\/$/, '$1');
const toTemplate = (path) => path.replace(/:(\w+)/g, '{param}');

function collectRoutes(router, prefix = '') {
  const routes = [];
  for (const layer of router.stack) {
    if (layer.route) {
      for (const method of Object.keys(layer.route.methods)) {
        routes.push(`${method.toUpperCase()} ${toTemplate(join(prefix, layer.route.path))}`);
      }
    } else if (layer.handle?.stack) {
      routes.push(...collectRoutes(layer.handle, join(prefix, mountPrefixes.get(layer) ?? '')));
    }
  }
  return routes;
}

const documented = Object.entries(openApiSpec.paths).flatMap(([path, operations]) =>
  Object.keys(operations)
    .filter((key) => ['get', 'post', 'put', 'patch', 'delete'].includes(key))
    .map((method) => `${method.toUpperCase()} ${path.replace(/\{\w+\}/g, '{param}')}`),
);

describe('API documentation', () => {
  const implemented = [...new Set(collectRoutes(app.router))].filter(
    (r) => !r.includes('/api/docs'),
  );

  it('documents every implemented endpoint', () => {
    expect(implemented.length).toBeGreaterThan(50);
    const undocumented = implemented.filter((route) => !documented.includes(route));
    expect(undocumented).toEqual([]);
  });

  it('documents no endpoint that does not exist', () => {
    const phantom = documented.filter((route) => !implemented.includes(route));
    expect(phantom).toEqual([]);
  });

  it('serves the spec and Swagger UI', async () => {
    const json = await request(app).get('/api/docs.json');
    expect(json.status).toBe(200);
    expect(json.body.openapi).toBe('3.1.0');

    const ui = await request(app).get('/api/docs/');
    expect(ui.status).toBe(200);
    expect(ui.text).toContain('swagger-ui');
  });
});
