import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock DOM globally for API tests
global.document = {
  createElement: vi.fn(() => ({
    textContent: '',
    innerHTML: ''
  }))
} as any;

global.fetch = vi.fn();
global.window = {
  matchMedia: vi.fn(() => ({ matches: false, addEventListener: vi.fn() }))
} as any;

function makeResponse<T>(data: T, ok = true, status = 200): any {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    headers: { get: (h: string) => h === 'content-type' ? 'application/json' : '' },
    json: async () => data,
    text: async () => JSON.stringify(data)
  };
}

describe('API Cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should cache API responses with TTL', async () => {
    const { API } = await import('../api');
    const api = new API();

    const mockData = [{ id: '1', name: 'test' }];
    (global.fetch as any).mockResolvedValue(makeResponse(mockData));

    const result1 = await api.getAgents();
    const result2 = await api.getAgents();

    expect(result1).toEqual(mockData);
    expect(result2).toEqual(mockData);
    // Should only call fetch once due to cache
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('should invalidate cache after mutations', async () => {
    const { API } = await import('../api');
    const api = new API();

    (global.fetch as any).mockResolvedValue(makeResponse([]));

    await api.getAgents();
    api.invalidateCache('agents');
    await api.getAgents();

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('should deduplicate concurrent requests', async () => {
    const { API } = await import('../api');
    const api = new API();

    let resolveFn: (value: any) => void;
    (global.fetch as any).mockReturnValue(new Promise((resolve) => {
      resolveFn = resolve;
    }));

    const p1 = api.getAgents();
    const p2 = api.getAgents();

    resolveFn!(makeResponse([]));

    await Promise.all([p1, p2]);

    // Both calls should resolve, but only one network request
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('should clear entire cache', async () => {
    const { API } = await import('../api');
    const api = new API();

    (global.fetch as any).mockResolvedValue(makeResponse([]));

    await api.getAgents();
    await api.getPrompts();
    api.invalidateCache();
    await api.getAgents();
    await api.getPrompts();

    expect(global.fetch).toHaveBeenCalledTimes(4);
  });
});

describe('Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should throw typed errors on 4xx', async () => {
    const { API } = await import('../api');
    const api = new API();

    (global.fetch as any).mockResolvedValue(
      makeResponse({ error: 'Resource not found' }, false, 404)
    );

    await expect(api.getAgent('invalid')).rejects.toThrow('Resource not found');
  });

  it('should include error details', async () => {
    const { API } = await import('../api');
    const api = new API();

    (global.fetch as any).mockResolvedValue(
      makeResponse({ error: 'Validation failed', details: { field: 'name' } }, false, 400)
    );

    try {
      await api.createAgent({});
    } catch (e: any) {
      expect(e.status).toBe(400);
      expect(e.details).toEqual({ field: 'name' });
    }
  });

  it('should have a code property for error classification', async () => {
    const { API } = await import('../api');
    const api = new API();

    (global.fetch as any).mockResolvedValue(
      makeResponse({ error: 'Not found' }, false, 404)
    );

    try {
      await api.getAgent('invalid');
    } catch (e: any) {
      expect(e.code).toBe('not_found');
    }
  });
});
