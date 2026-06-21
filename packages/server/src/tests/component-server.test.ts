import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ComponentContribution } from '@ordpaw/shared';

// Mock dependencies
vi.mock('fs');
vi.mock('sql.js', () => ({
  default: vi.fn(() => Promise.resolve({})),
}));

describe('ComponentServer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should build component tree from contributions', async () => {
    const mod = await import('../core/component-server.js');
    const server = new mod.ComponentServer();

    const contributions: ComponentContribution[] = [
      { name: 'root', type: 'component', src: 'root.js' },
      { name: 'header', type: 'component', src: 'header.js' },
      { name: 'footer', type: 'component', src: 'footer.js' },
    ];

    server.register('test-plugin', contributions, '/fake/path');

    const tree = server.getComponentTree();
    expect(tree).toBeDefined();
  });

  it('should deduplicate by plugin name', async () => {
    const mod = await import('../core/component-server.js');
    const server = new mod.ComponentServer();

    const contributions: ComponentContribution[] = [
      { name: 'comp1', type: 'component', src: 'comp1.js' },
    ];

    server.register('test-plugin', contributions, '/fake/path');
    server.register('test-plugin', contributions, '/fake/path');

    const manifest = server.getManifest();
    const pluginContributions = manifest.filter((c: any) => c.metadata?.__plugin === 'test-plugin');
    expect(pluginContributions.length).toBe(1);
  });

  it('should normalize relative src paths', async () => {
    const mod = await import('../core/component-server.js');
    const server = new mod.ComponentServer();

    const contributions: ComponentContribution[] = [
      { name: 'comp', type: 'component', src: './comp.js' },
    ];

    server.register('my-plugin', contributions, '/fake/path');
    const manifest = server.getManifest();
    const comp = manifest[0];
    expect(comp.src).toContain('/components/my-plugin/');
  });

  it('should preserve absolute URLs', async () => {
    const mod = await import('../core/component-server.js');
    const server = new mod.ComponentServer();

    const contributions: ComponentContribution[] = [
      { name: 'cdn-comp', type: 'component', src: 'https://cdn.example.com/comp.js' },
    ];

    server.register('my-plugin', contributions, '/fake/path');
    const manifest = server.getManifest();
    expect(manifest[0].src).toBe('https://cdn.example.com/comp.js');
  });
});
