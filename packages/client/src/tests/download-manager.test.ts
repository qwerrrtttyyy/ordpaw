import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DownloadManager, sanitizeFileName, generateId } from '../download-manager';
import { API } from '../api';

describe('DownloadManager', () => {
  let api: API;
  let manager: DownloadManager;
  let store: Record<string, string> = {};

  beforeEach(() => {
    store = {};
    global.localStorage = {
      getItem: vi.fn((key: string) => store[key] || null),
      setItem: vi.fn((key: string, value: string) => {
        store[key] = value;
      }),
      removeItem: vi.fn((key: string) => {
        delete store[key];
      }),
      clear: vi.fn(() => {
        store = {};
      }),
      length: 0,
      key: vi.fn(),
    } as any;

    global.indexedDB = undefined as any;

    api = new API();
    // maxConcurrent=0 prevents automatic queue processing in these unit tests
    manager = new DownloadManager(api, 0);
  });

  it('initializes empty and loads from storage', () => {
    expect(manager.getTasks()).toEqual([]);
  });

  it('adds a task', () => {
    const task = manager.addTask([{ id: 'item-1', type: 'source', size: 100 }], {
      storage: 'browser',
    });
    expect(task.status).toBe('pending');
    expect(task.items.length).toBe(1);
    expect(manager.getTasks().length).toBe(1);
    expect(manager.getTask(task.id)).toBeDefined();
  });

  it('removes a task', () => {
    const task = manager.addTask([{ id: 'item-1', type: 'source' }], { storage: 'browser' });
    manager.removeTask(task.id);
    expect(manager.getTask(task.id)).toBeUndefined();
  });

  it('removes running task by cancelling first', () => {
    const task = manager.addTask([{ id: 'item-1', type: 'source' }], { storage: 'browser' });
    const mutable = (manager as any).tasks.find((t: any) => t.id === task.id);
    mutable.status = 'running';
    manager.removeTask(task.id);
    expect(manager.getTask(task.id)?.status).toBe('cancelled');
  });

  it('clears completed tasks', () => {
    const task = manager.addTask([{ id: 'item-1', type: 'source' }], { storage: 'browser' });
    const mutable = (manager as any).tasks.find((t: any) => t.id === task.id);
    mutable.status = 'completed';
    manager.clearCompleted();
    expect(manager.getTasks().length).toBe(0);
  });

  it('cancels a running task', async () => {
    const task = manager.addTask([{ id: 'item-1', type: 'source' }], { storage: 'browser' });
    const mutable = (manager as any).tasks.find((t: any) => t.id === task.id);
    mutable.status = 'running';
    (manager as any).runtimeStates.set(task.id, { abortController: { abort: vi.fn() } });
    await manager.cancelTask(task.id);
    expect(manager.getTask(task.id)?.status).toBe('cancelled');
  });

  it('pauses a running task', async () => {
    const task = manager.addTask([{ id: 'item-1', type: 'source' }], { storage: 'browser' });
    const mutable = (manager as any).tasks.find((t: any) => t.id === task.id);
    mutable.status = 'running';
    (manager as any).runtimeStates.set(task.id, { abortController: { abort: vi.fn() } });
    await manager.pauseTask(task.id);
    expect(manager.getTask(task.id)?.status).toBe('paused');
  });

  it('resumes a paused task', async () => {
    const task = manager.addTask([{ id: 'item-1', type: 'source' }], { storage: 'browser' });
    const mutable = (manager as any).tasks.find((t: any) => t.id === task.id);
    mutable.status = 'paused';
    await manager.resumeTask(task.id);
    expect(['pending', 'running']).toContain(manager.getTask(task.id)?.status);
  });

  it('pauses a pending task', async () => {
    const task = manager.addTask([{ id: 'item-1', type: 'source' }], { storage: 'browser' });
    await manager.pauseTask(task.id);
    expect(manager.getTask(task.id)?.status).toBe('paused');
  });

  it('returns early when resuming non-paused task', async () => {
    const task = manager.addTask([{ id: 'item-1', type: 'source' }], { storage: 'browser' });
    await manager.resumeTask(task.id);
    expect(manager.getTask(task.id)?.status).toBe('pending');
  });

  it('sets browser backend', () => {
    manager.setBrowserBackend('localstorage');
    expect((manager as any).backend).toBe('localstorage');
  });

  it('returns early when cancelling missing task', async () => {
    await manager.cancelTask('missing');
    expect(manager.getTask('missing')).toBeUndefined();
  });

  it('returns early when pausing missing task', async () => {
    await manager.pauseTask('missing');
    expect(manager.getTask('missing')).toBeUndefined();
  });
});

describe('download helpers', () => {
  it('sanitizes file names', () => {
    expect(sanitizeFileName('hello/world.txt')).toBe('hello_world.txt');
    expect(sanitizeFileName('file@name')).toBe('file_name');
  });

  it('generates unique ids', () => {
    const id1 = generateId();
    const id2 = generateId();
    expect(id1).not.toBe(id2);
    expect(id1).toContain('-');
  });
});
