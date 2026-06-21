import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMemoryDb } from './helpers.js';

let memoryDb: any;

vi.mock('../db/index.js', () => ({
  getDatabase: () => memoryDb,
  saveDatabase: vi.fn(),
  default: {
    getDatabase: () => memoryDb,
    saveDatabase: vi.fn()
  }
}));

describe('ProviderService', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    memoryDb = await createMemoryDb();
  });

  it('initializes with built-in providers', async () => {
    const { providerService } = await import('../core/provider-service.js');
    providerService.init();

    const providers = providerService.listProviders();
    expect(providers.some(p => p.name === 'OpenAI')).toBe(true);
    expect(providers.some(p => p.name === 'Anthropic')).toBe(true);
    expect(providers.some(p => p.name === 'Ollama')).toBe(true);
  });

  it('does not duplicate built-ins on repeated init', async () => {
    const { providerService } = await import('../core/provider-service.js');
    providerService.init();
    const firstCount = providerService.listProviders().length;

    vi.clearAllMocks();
    providerService.init();
    const secondCount = providerService.listProviders().length;

    expect(secondCount).toBe(firstCount);
  });

  it('gets provider by id, type, or name', async () => {
    const { providerService } = await import('../core/provider-service.js');
    providerService.init();

    const openai = providerService.listProviders().find(p => p.name === 'OpenAI')!;
    expect(providerService.getProvider(openai.id)?.name).toBe('OpenAI');
    expect(providerService.getProvider('openai')?.name).toBe('OpenAI');
    expect(providerService.getProviderByName('OpenAI')?.name).toBe('OpenAI');
    expect(providerService.getProvider('missing')).toBeNull();
  });

  it('creates a custom provider', async () => {
    const { providerService } = await import('../core/provider-service.js');
    providerService.init();

    const created = providerService.createProvider({
      name: 'Custom',
      type: 'custom',
      baseUrl: 'http://localhost:1234',
      apiKey: 'secret-key',
      apiKeyName: 'custom',
      models: [{ id: 'm1', name: 'Model 1' }],
      config: { timeout: 30 }
    });

    expect(created.name).toBe('Custom');
    expect(created.type).toBe('custom');
    expect(created.isBuiltIn).toBe(false);
    expect(created.apiKey).toBe('secret-key');
    expect(created.models).toEqual([{ id: 'm1', name: 'Model 1' }]);

    const stored = providerService.getProvider(created.id);
    expect(stored?.apiKey).toBe('secret-key');
  });

  it('obfuscates and deobfuscates api key roundtrip', async () => {
    const { providerService } = await import('../core/provider-service.js');
    providerService.init();

    const created = providerService.createProvider({
      name: 'KeyTest',
      type: 'custom',
      apiKey: 'my-key'
    });

    const stored = providerService.getProvider(created.id);
    expect(stored?.apiKey).toBe('my-key');
  });

  it('updates a provider', async () => {
    const { providerService } = await import('../core/provider-service.js');
    providerService.init();

    const created = providerService.createProvider({
      name: 'ToUpdate',
      type: 'custom'
    });

    const updated = providerService.updateProvider(created.id, {
      name: 'Updated',
      baseUrl: 'http://new',
      enabled: false
    });

    expect(updated?.name).toBe('Updated');
    expect(updated?.baseUrl).toBe('http://new');
    expect(updated?.enabled).toBe(false);
  });

  it('returns null when updating non-existent provider', async () => {
    const { providerService } = await import('../core/provider-service.js');
    expect(providerService.updateProvider('missing', { name: 'X' })).toBeNull();
  });

  it('deletes a custom provider but not built-in', async () => {
    const { providerService } = await import('../core/provider-service.js');
    providerService.init();

    const created = providerService.createProvider({
      name: 'ToDelete',
      type: 'custom'
    });

    expect(providerService.deleteProvider(created.id)).toBe(true);
    expect(providerService.getProvider(created.id)).toBeNull();

    const openai = providerService.listProviders().find(p => p.name === 'OpenAI')!;
    expect(providerService.deleteProvider(openai.id)).toBe(false);
  });

  it('lists models for a provider', async () => {
    const { providerService } = await import('../core/provider-service.js');
    providerService.init();

    const openai = providerService.listProviders().find(p => p.name === 'OpenAI')!;
    const models = providerService.getModels(openai.id);
    expect(models.length).toBeGreaterThan(0);
    expect(models[0]).toHaveProperty('id');
    expect(models[0]).toHaveProperty('name');
  });

  it('handles listProviders database errors gracefully', async () => {
    const { providerService } = await import('../core/provider-service.js');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    memoryDb = { exec: () => { throw new Error('db down'); } };

    const providers = providerService.listProviders();
    expect(providers).toEqual([]);
    errorSpy.mockRestore();
  });
});
