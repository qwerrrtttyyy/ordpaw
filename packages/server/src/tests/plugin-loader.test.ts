import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ComponentContribution } from '@ordpaw/shared';
import { existsSync, readdirSync, readFileSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';

const mockDb = { run: vi.fn() };
const mockGetDatabase = vi.fn(() => mockDb);
const mockSaveDatabase = vi.fn();
const mockQueryOne = vi.fn();
const mockQueryAll = vi.fn();
const mockGetConversation = vi.fn();
const mockRegisterSkill = vi.fn();
const mockEmit = vi.fn();
const mockRegisterComponent = vi.fn();
const mockOn = vi.fn();

vi.mock('../db/index.js', () => ({
  getDatabase: (...args: any[]) => mockGetDatabase(...args),
  saveDatabase: (...args: any[]) => mockSaveDatabase(...args),
  default: {
    getDatabase: (...args: any[]) => mockGetDatabase(...args),
    saveDatabase: (...args: any[]) => mockSaveDatabase(...args),
  },
}));

vi.mock('../db/utils.js', () => ({
  queryOne: (...args: any[]) => mockQueryOne(...args),
  queryAll: (...args: any[]) => mockQueryAll(...args),
}));

vi.mock('../core/session.js', () => ({
  sessionManager: { getConversation: (...args: any[]) => mockGetConversation(...args) },
}));

vi.mock('../core/skill-runner.js', () => ({
  skillRunner: { registerSkill: (...args: any[]) => mockRegisterSkill(...args) },
}));

vi.mock('../core/event-bus.js', () => ({
  eventBus: {
    emit: (...args: any[]) => mockEmit(...args),
    on: (...args: any[]) => mockOn(...args),
    off: vi.fn(),
  },
}));

vi.mock('../core/component-server.js', () => ({
  componentServer: { register: (...args: any[]) => mockRegisterComponent(...args) },
}));

describe('createPluginApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDatabase.mockReturnValue(mockDb);
  });

  it('returns sessionManager.getConversation result from getSession', async () => {
    const { createPluginApi } = await import('../plugin/loader.js');
    const session = { id: 'conv-1', title: 'Test' } as any;
    mockGetConversation.mockReturnValue(session);

    const api = createPluginApi('test-plugin', '/fake/path');
    expect(api.getSession('conv-1')).toBe(session);
    expect(mockGetConversation).toHaveBeenCalledWith('conv-1');
  });

  it('db.get reads and parses JSON from plugin_storage', async () => {
    const { createPluginApi } = await import('../plugin/loader.js');
    mockQueryOne.mockReturnValue({ value_json: JSON.stringify({ foo: 'bar' }) });

    const api = createPluginApi('test-plugin', '/fake/path');
    const value = api.db.get('k1');

    expect(value).toEqual({ foo: 'bar' });
    expect(mockGetDatabase).toHaveBeenCalled();
    expect(mockQueryOne).toHaveBeenCalledWith(
      mockDb,
      'SELECT value_json FROM plugin_storage WHERE plugin_name = ? AND key = ?',
      ['test-plugin', 'k1']
    );
  });

  it('db.get returns undefined when key not found', async () => {
    const { createPluginApi } = await import('../plugin/loader.js');
    mockQueryOne.mockReturnValue(null);

    const api = createPluginApi('test-plugin', '/fake/path');
    expect(api.db.get('missing')).toBeUndefined();
  });

  it('db.set inserts/updates plugin_storage and calls saveDatabase', async () => {
    const { createPluginApi } = await import('../plugin/loader.js');
    mockDb.run.mockReturnValue(undefined);

    const api = createPluginApi('test-plugin', '/fake/path');
    api.db.set('k1', { value: 42 });

    expect(mockDb.run).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO plugin_storage'), [
      'test-plugin',
      'k1',
      JSON.stringify({ value: 42 }),
      expect.any(Number),
    ]);
    expect(mockSaveDatabase).toHaveBeenCalled();
  });

  it('db.delete removes the specified key and calls saveDatabase', async () => {
    const { createPluginApi } = await import('../plugin/loader.js');

    const api = createPluginApi('test-plugin', '/fake/path');
    api.db.delete('k1');

    expect(mockDb.run).toHaveBeenCalledWith(
      'DELETE FROM plugin_storage WHERE plugin_name = ? AND key = ?',
      ['test-plugin', 'k1']
    );
    expect(mockSaveDatabase).toHaveBeenCalled();
  });

  it('db.list returns all keys for the plugin', async () => {
    const { createPluginApi } = await import('../plugin/loader.js');
    mockQueryAll.mockReturnValue([{ key: 'a' }, { key: 'b' }]);

    const api = createPluginApi('test-plugin', '/fake/path');
    const keys = api.db.list();

    expect(keys).toEqual(['a', 'b']);
    expect(mockQueryAll).toHaveBeenCalledWith(
      mockDb,
      'SELECT key FROM plugin_storage WHERE plugin_name = ? ORDER BY key ASC',
      ['test-plugin']
    );
  });

  it('db.clear removes all storage for the plugin and calls saveDatabase', async () => {
    const { createPluginApi } = await import('../plugin/loader.js');

    const api = createPluginApi('test-plugin', '/fake/path');
    api.db.clear();

    expect(mockDb.run).toHaveBeenCalledWith('DELETE FROM plugin_storage WHERE plugin_name = ?', [
      'test-plugin',
    ]);
    expect(mockSaveDatabase).toHaveBeenCalled();
  });

  it('registerSkill delegates to skillRunner', async () => {
    const { createPluginApi } = await import('../plugin/loader.js');
    const skill = {
      id: 's1',
      name: 'skill',
      description: '',
      parameters: {},
      execute: async () => ({}),
    };

    const api = createPluginApi('test-plugin', '/fake/path');
    api.registerSkill(skill);

    expect(mockRegisterSkill).toHaveBeenCalledWith(skill);
  });

  it('registerComponent delegates to componentServer', async () => {
    const { createPluginApi } = await import('../plugin/loader.js');
    const contribution: ComponentContribution = { name: 'comp', type: 'component', src: 'comp.js' };

    const api = createPluginApi('test-plugin', '/fake/path');
    api.registerComponent(contribution);

    expect(mockRegisterComponent).toHaveBeenCalledWith('test-plugin', [contribution], '/fake/path');
  });

  it('emit delegates to eventBus', async () => {
    const { createPluginApi } = await import('../plugin/loader.js');

    const api = createPluginApi('test-plugin', '/fake/path');
    api.emit('custom:event', { data: 1 });

    expect(mockEmit).toHaveBeenCalledWith('custom:event', { data: 1 });
  });
});

describe('loadPlugins', () => {
  const pluginsDir = join(process.cwd(), 'plugins');

  function resetPluginsDir() {
    if (existsSync(pluginsDir)) {
      rmSync(pluginsDir, { recursive: true, force: true });
    }
  }

  function createPlugin(name: string, manifest: Record<string, unknown>, code: string) {
    const pluginDir = join(pluginsDir, name);
    mkdirSync(pluginDir, { recursive: true });
    writeFileSync(join(pluginDir, 'plugin.json'), JSON.stringify(manifest));
    writeFileSync(join(pluginDir, (manifest.main as string) || 'index.js'), code);
  }

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    resetPluginsDir();
  });

  afterEach(() => {
    resetPluginsDir();
  });

  it('does nothing when plugins directory does not exist', async () => {
    const { loadPlugins } = await import('../plugin/loader.js');
    await loadPlugins();
    expect(mockRegisterComponent).not.toHaveBeenCalled();
  });

  it('loads a plugin with onLoad, handlers and frontend contributions', async () => {
    createPlugin(
      'loaded-plugin',
      {
        main: 'index.js',
        frontend: [{ name: 'comp', type: 'component', src: 'comp.js' }],
      },
      `
      export default {
        onLoad: async (api) => { api.emit('plugin:loaded', { ok: true }); },
        handlers: { 'plugin:event': (data) => {} }
      };
    `
    );

    const { loadPlugins } = await import('../plugin/loader.js');
    await loadPlugins();

    expect(mockRegisterComponent).toHaveBeenCalledWith(
      'loaded-plugin',
      [expect.objectContaining({ name: 'comp', src: 'comp.js' })],
      join(pluginsDir, 'loaded-plugin')
    );
    expect(mockOn).toHaveBeenCalledWith('plugin:event', expect.any(Function));
  });

  it('skips directories without plugin.json', async () => {
    mkdirSync(join(pluginsDir, 'no-manifest'), { recursive: true });
    writeFileSync(join(pluginsDir, 'no-manifest', 'index.js'), 'export default {};');

    const { loadPlugins } = await import('../plugin/loader.js');
    await loadPlugins();

    expect(mockRegisterComponent).not.toHaveBeenCalled();
  });

  it('skips plugin when main file does not exist', async () => {
    createPlugin('missing-main', { main: 'missing.js' }, '');

    const { loadPlugins } = await import('../plugin/loader.js');
    await loadPlugins();

    expect(mockRegisterComponent).not.toHaveBeenCalled();
  });

  it('catches and logs plugin load errors', async () => {
    createPlugin('bad-plugin', { main: 'index.js' }, 'throw new Error("bad plugin");');

    const { loadPlugins } = await import('../plugin/loader.js');
    await expect(loadPlugins()).resolves.toBeUndefined();
    expect(mockRegisterComponent).not.toHaveBeenCalled();
  });
});
