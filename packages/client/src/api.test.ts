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

describe('API Cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should cache API responses with TTL', async () => {
    const { API } = await import('./api');
    const api = new API();

    const mockData = [{ id: '1', name: 'test' }];
    (global.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify(mockData)
    });

    const result1 = await api.getAgents();
    const result2 = await api.getAgents();

    expect(result1).toEqual(mockData);
    expect(result2).toEqual(mockData);
    // Should only call fetch once due to cache
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('should invalidate cache after mutations', async () => {
    const { API } = await import('./api');
    const api = new API();

    (global.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      text: async () => '[]'
    });

    await api.getAgents();
    await api.invalidateCache('agents');
    await api.getAgents();

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('should deduplicate concurrent requests', async () => {
    const { API } = await import('./api');
    const api = new API();

    let resolveFn: (value: any) => void;
    (global.fetch as any).mockReturnValue(new Promise((resolve) => {
      resolveFn = resolve;
    }));

    const p1 = api.getAgents();
    const p2 = api.getAgents();

    resolveFn!({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      text: async () => '[]'
    });

    await Promise.all([p1, p2]);

    // Both calls should resolve, but only one network request
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('should clear entire cache', async () => {
    const { API } = await import('./api');
    const api = new API();

    (global.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      text: async () => '[]'
    });

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
    const { API } = await import('./api');
    const api = new API();

    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      headers: { get: () => 'application/json' },
      json: async () => ({ error: 'Resource not found' })
    });

    await expect(api.getAgent('invalid')).rejects.toThrow('[API 404]');
  });

  it('should include error details', async () => {
    const { API } = await import('./api');
    const api = new API();

    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      headers: { get: () => 'application/json' },
      json: async () => ({ error: 'Validation failed', details: { field: 'name' } })
    });

    try {
      await api.createAgent({});
    } catch (e: any) {
      expect(e.status).toBe(400);
      expect(e.details).toEqual({ field: 'name' });
    }
  });
});
