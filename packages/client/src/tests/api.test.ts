import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock DOM globally for API tests
global.document = {
  createElement: vi.fn(() => ({
    textContent: '',
    innerHTML: '',
  })),
} as any;

global.fetch = vi.fn();
global.window = {
  matchMedia: vi.fn(() => ({ matches: false, addEventListener: vi.fn() })),
} as any;

function makeResponse<T>(data: T, ok = true, status = 200): any {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    headers: { get: (h: string) => (h === 'content-type' ? 'application/json' : '') },
    json: async () => data,
    text: async () => JSON.stringify(data),
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
    (global.fetch as any).mockReturnValue(
      new Promise((resolve) => {
        resolveFn = resolve;
      })
    );

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

    (global.fetch as any).mockResolvedValue(makeResponse({ error: 'Not found' }, false, 404));

    try {
      await api.getAgent('invalid');
    } catch (e: any) {
      expect(e.code).toBe('not_found');
    }
  });

  it('should handle network errors', async () => {
    const { API } = await import('../api');
    const api = new API();

    (global.fetch as any).mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(api.getAgents()).rejects.toThrow('网络错误');
  });

  it('should handle timeout errors', async () => {
    const { API, OrdPawApiError } = await import('../api');
    const api = new API();

    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    (global.fetch as any).mockRejectedValue(abortError);

    await expect(api.getAgents()).rejects.toThrow('请求超时');
  });

  it('should handle non-json responses', async () => {
    const { API } = await import('../api');
    const api = new API();

    (global.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: { get: () => 'text/plain' },
      json: async () => ({}),
      text: async () => 'plain text',
    });

    const result = await api.getStats();
    expect(result).toBeUndefined();
  });

  it('should handle non-json error responses', async () => {
    const { API } = await import('../api');
    const api = new API();

    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Server Error',
      headers: { get: () => 'text/plain' },
      json: async () => ({}),
      text: async () => 'server exploded',
    });

    await expect(api.getAgents()).rejects.toThrow('server exploded');
  });

  it('should call agent CRUD endpoints', async () => {
    const { API } = await import('../api');
    const api = new API();

    (global.fetch as any).mockResolvedValue(makeResponse({ id: 'a1', name: 'Agent' }));

    await api.createAgent({ name: 'Agent' });
    await api.updateAgent('a1', { name: 'Updated' });
    await api.deleteAgent('a1');

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/agents',
      expect.objectContaining({ method: 'POST' })
    );
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/agents/a1',
      expect.objectContaining({ method: 'PUT' })
    );
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/agents/a1',
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('should call conversation endpoints', async () => {
    const { API } = await import('../api');
    const api = new API();

    (global.fetch as any).mockResolvedValue(makeResponse({ id: 'c1', agentId: 'a1' }));

    await api.createConversation('a1', 'Title');
    await api.getConversation('c1');
    await api.deleteConversation('c1');
    await api.sendMessage('c1', 'hello');

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/conversations',
      expect.objectContaining({ method: 'POST' })
    );
    expect(global.fetch).toHaveBeenCalledWith('/api/conversations/c1', expect.anything());
  });

  it('should call provider endpoints', async () => {
    const { API } = await import('../api');
    const api = new API();

    (global.fetch as any).mockResolvedValue(makeResponse({ id: 'p1' }));

    await api.getProviders();
    await api.getProviderModels('p1');
    await api.createProvider({ name: 'P' });
    await api.updateProvider('p1', { name: 'U' });
    await api.deleteProvider('p1');

    expect(global.fetch).toHaveBeenCalledWith('/api/providers', expect.anything());
  });

  it('should call settings and stats endpoints', async () => {
    const { API } = await import('../api');
    const api = new API();

    (global.fetch as any).mockResolvedValue(makeResponse({ theme: 'light' }));

    await api.getSettings();
    await api.updateSettings({ theme: 'dark' });
    await api.getStats();

    expect(global.fetch).toHaveBeenCalledWith('/api/settings', expect.anything());
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/settings',
      expect.objectContaining({ method: 'PUT' })
    );
    expect(global.fetch).toHaveBeenCalledWith('/api/stats', expect.anything());
  });

  it('should call skill endpoints', async () => {
    const { API } = await import('../api');
    const api = new API();

    (global.fetch as any).mockResolvedValue(makeResponse({ id: 's1' }));

    await api.getSkills();
    await api.installSkill({ name: 'skill', code: 'return 1;' } as any);
    await api.executeSkill('s1', { a: 1 });
    await api.uninstallSkill('s1');

    expect(global.fetch).toHaveBeenCalledWith('/api/skills', expect.anything());
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/skills/install',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('should call component endpoints', async () => {
    const { API } = await import('../api');
    const api = new API();

    (global.fetch as any).mockResolvedValue(makeResponse({ version: '0.0.3', items: [] }));

    await api.getComponentManifest();
    await api.getComponentTree();
    await api.getComponentRelationships();
    await api.getComponentPlugins();
    await api.getPluginComponents('plugin');
    await api.registerComponents('plugin', []);
    await api.unregisterPluginComponents('plugin');

    expect(global.fetch).toHaveBeenCalledWith('/api/components/manifest', expect.anything());
  });

  it('should call export/import endpoints', async () => {
    const { API } = await import('../api');
    const api = new API();

    (global.fetch as any).mockResolvedValue(makeResponse({ success: true, imported: [] }));

    await api.exportData('agents');
    await api.exportConversation('c1');
    await api.importData({ version: 1 });

    expect(global.fetch).toHaveBeenCalledWith('/api/export?scope=agents', expect.anything());
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/import',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('should call clear-data and reset endpoints', async () => {
    const { API } = await import('../api');
    const api = new API();

    (global.fetch as any).mockResolvedValue(makeResponse({ success: true, cleared: [] }));

    await api.clearData(['conversations']);
    await api.resetSettings();

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/clear-data',
      expect.objectContaining({ method: 'POST' })
    );
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/reset/settings',
      expect.objectContaining({ method: 'POST' })
    );
  });
});
