import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ComponentContribution } from '@ordpaw/shared';

// Mock fetch
global.fetch = vi.fn();

// jsdom does not provide WeakRef
if (typeof global.WeakRef === 'undefined') {
  (global as any).WeakRef = class WeakRef<T extends object> {
    private _target: T;
    constructor(target: T) { this._target = target; }
    deref(): T | undefined { return this._target; }
  };
}

describe('ComponentLoader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear registry between tests via re-import
  });

  it('should register runtime components', async () => {
    const loader = await import('./component-loader');
    const id = 'runtime:test-comp';
    loader.registerRuntimeComponent({
      name: 'test-comp',
      type: 'component',
      src: 'test.js',
      metadata: { __plugin: 'runtime' }
    } as ComponentContribution);
    const comp = loader.getComponentById(id);
    expect(comp).toBeDefined();
    expect(comp?.name).toBe('test-comp');
  });

  it('should call mount hook on mount', async () => {
    const loader = await import('./component-loader');
    const id = 'runtime:hook-comp';
    const mountHook = vi.fn();
    const unmountHook = vi.fn();
    loader.registerLifecycle(id, { mount: mountHook, unmount: unmountHook });
    loader.registerRuntimeComponent({
      name: 'hook-comp',
      type: 'component',
      src: 'hook.js',
      metadata: { __plugin: 'runtime' }
    } as ComponentContribution);
    const el = document.createElement('div');
    await loader.mountComponent(id, el);
    expect(mountHook).toHaveBeenCalledWith(el);
    expect(el.getAttribute('data-component-id')).toBe(id);
  });

  it('should call unmount hook on unmount', async () => {
    const loader = await import('./component-loader');
    const id = 'runtime:unmount-comp';
    const mountHook = vi.fn();
    const unmountHook = vi.fn();
    loader.registerLifecycle(id, { mount: mountHook, unmount: unmountHook });
    loader.registerRuntimeComponent({
      name: 'unmount-comp',
      type: 'component',
      src: 'unmount.js',
      metadata: { __plugin: 'runtime' }
    } as ComponentContribution);
    const el = document.createElement('div');
    await loader.mountComponent(id, el);
    await loader.unmountComponent(id, el);
    expect(unmountHook).toHaveBeenCalledWith(el);
    expect(el.getAttribute('data-component-id')).toBeNull();
  });

  it('should handle async mount hooks', async () => {
    const loader = await import('./component-loader');
    const id = 'runtime:async-comp';
    let resolved = false;
    loader.registerLifecycle(id, {
      mount: async (el) => {
        await new Promise(r => setTimeout(r, 10));
        el.textContent = 'mounted';
        resolved = true;
      }
    });
    loader.registerRuntimeComponent({
      name: 'async-comp',
      type: 'component',
      src: 'async.js',
      metadata: { __plugin: 'runtime' }
    } as ComponentContribution);
    const el = document.createElement('div');
    await loader.mountComponent(id, el);
    expect(resolved).toBe(true);
    expect(el.textContent).toBe('mounted');
  });

  it('should warn when mounting unknown component', async () => {
    const loader = await import('./component-loader');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const el = document.createElement('div');
    await loader.mountComponent('unknown:id', el);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('should filter components by plugin', async () => {
    const loader = await import('./component-loader');
    loader.registerRuntimeComponent({
      name: 'a',
      type: 'component',
      src: 'a.js',
      metadata: { __plugin: 'plugin-a' }
    } as ComponentContribution);
    loader.registerRuntimeComponent({
      name: 'b',
      type: 'component',
      src: 'b.js',
      metadata: { __plugin: 'plugin-b' }
    } as ComponentContribution);
    const pluginA = loader.getComponentsByPlugin('plugin-a');
    expect(pluginA.length).toBe(1);
    expect(pluginA[0].name).toBe('a');
  });

  it('should load component tree from API', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ root: [], relationships: [] })
    });
    const loader = await import('./component-loader');
    const tree = await loader.loadComponentTree();
    expect(tree).toEqual({ root: [], relationships: [] });
  });

  it('should return null when tree API fails', async () => {
    (global.fetch as any).mockResolvedValue({ ok: false });
    const loader = await import('./component-loader');
    const tree = await loader.loadComponentTree();
    expect(tree).toBeNull();
  });
});
