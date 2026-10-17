import { describe, expect, it } from 'vitest';
import { http, refreshSession } from '../src/lib/api.js';

describe('refreshSession', () => {
  it('posts without a body or JSON content type (API rejects a "null" JSON body)', async () => {
    const seen = [];
    http.defaults.adapter = async (config) => {
      seen.push(config);
      return {
        data: { success: true, data: { user: { _id: 'u1' } } },
        status: 200,
        headers: {},
        config,
      };
    };
    const [a, b] = await Promise.all([refreshSession(), refreshSession()]);

    expect(a).toEqual({ _id: 'u1' });
    expect(b).toBe(a);
    expect(seen).toHaveLength(1); // concurrent callers share one in-flight refresh
    expect(seen[0].data).toBeUndefined();
    expect(String(seen[0].headers['Content-Type'] ?? '')).not.toContain('json');
  });
});
