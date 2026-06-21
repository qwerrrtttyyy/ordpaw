import type {
  DownloadItem,
  DownloadResourceType,
  DownloadTask,
  StorageLocation,
  StorageQuota,
  BrowserStorageBackend,
} from '@ordpaw/shared';
import { API } from './api';
import { logger } from './logger';

const TASKS_STORAGE_KEY = 'ordpaw_download_tasks_v1';
const DEFAULT_BROWSER_MAX_BYTES = 500 * 1024 * 1024;
const DEFAULT_SERVER_MAX_BYTES = 2 * 1024 * 1024 * 1024;

export type DownloadManagerEventType = 'tasksChanged';

interface RuntimeTaskState {
  abortController?: AbortController;
  serverTaskId?: string;
}

interface StoredFile {
  id: string;
  type: DownloadResourceType;
  name?: string;
  blob: Blob;
  updatedAt: number;
}

interface DownloadStorageBackend {
  estimateUsage(): Promise<number>;
  save(item: DownloadItem, blob: Blob): Promise<void>;
  delete?(id: string): Promise<void>;
}

class IndexedDBStorage implements DownloadStorageBackend {
  private readonly dbName = 'OrdPawDownloads';
  private readonly storeName = 'files';
  private db: IDBDatabase | null = null;

  private async openDB(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => {
        this.db = request.result;
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async estimateUsage(): Promise<number> {
    const db = await this.openDB();
    const tx = db.transaction(this.storeName, 'readonly');
    const store = tx.objectStore(this.storeName);
    return new Promise((resolve, reject) => {
      const request = store.openCursor();
      let total = 0;
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          const file = cursor.value as StoredFile;
          total += file.blob.size;
          cursor.continue();
        } else {
          resolve(total);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  async save(item: DownloadItem, blob: Blob): Promise<void> {
    const db = await this.openDB();
    const tx = db.transaction(this.storeName, 'readwrite');
    const store = tx.objectStore(this.storeName);
    const record: StoredFile = {
      id: item.id,
      type: item.type,
      name: item.name,
      blob,
      updatedAt: Date.now(),
    };
    return new Promise((resolve, reject) => {
      const request = store.put(record);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async delete(id: string): Promise<void> {
    const db = await this.openDB();
    const tx = db.transaction(this.storeName, 'readwrite');
    const store = tx.objectStore(this.storeName);
    return new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

class LocalStorageStorage implements DownloadStorageBackend {
  private readonly prefix = 'ordpaw_dl_';

  private key(id: string): string {
    return `${this.prefix}${id}`;
  }

  async estimateUsage(): Promise<number> {
    let total = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(this.prefix)) {
        total += localStorage.getItem(key)?.length || 0;
      }
    }
    return total;
  }

  async save(item: DownloadItem, blob: Blob): Promise<void> {
    const base64 = await blobToBase64(blob);
    const payload = JSON.stringify({
      id: item.id,
      type: item.type,
      name: item.name,
      base64,
      updatedAt: Date.now(),
    });
    localStorage.setItem(this.key(item.id), payload);
  }

  async delete(id: string): Promise<void> {
    localStorage.removeItem(this.key(id));
  }
}

class FileSystemAccessStorage implements DownloadStorageBackend {
  private directoryHandle: FileSystemDirectoryHandle | null = null;

  setDirectory(handle: FileSystemDirectoryHandle) {
    this.directoryHandle = handle;
  }

  hasDirectory(): boolean {
    return this.directoryHandle !== null;
  }

  async estimateUsage(): Promise<number> {
    return 0;
  }

  async save(item: DownloadItem, blob: Blob): Promise<void> {
    if (!this.directoryHandle) {
      throw new Error('未选择下载目录');
    }
    const fileName = this.makeFileName(item);
    const handle = await this.directoryHandle.getFileHandle(fileName, { create: true });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
  }

  private makeFileName(item: DownloadItem): string {
    const safe = (item.name || item.id).replace(/[^a-zA-Z0-9_.\u4e00-\u9fa5-]/g, '_');
    if (item.type === 'source') return `${safe}.tar.gz`;
    if (item.type === 'script' || item.type === 'code') return `${safe}.json`;
    return `${safe}.json`;
  }
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_.\u4e00-\u9fa5-]/g, '_');
}

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export class DownloadManager extends EventTarget {
  private api: API;
  private tasks: DownloadTask[] = [];
  private runtimeStates = new Map<string, RuntimeTaskState>();
  private maxConcurrent: number;
  private backend: BrowserStorageBackend = 'indexeddb';
  private fsaStorage = new FileSystemAccessStorage();
  private idbStorage = new IndexedDBStorage();
  private localStorageStorage = new LocalStorageStorage();
  private serverTaskMap = new Map<string, string>();
  private pollingTimers = new Map<string, number>();

  constructor(api: API, maxConcurrent = 2) {
    super();
    this.api = api;
    this.maxConcurrent = maxConcurrent;
    this.loadTasks();
  }

  setBrowserBackend(backend: BrowserStorageBackend) {
    this.backend = backend;
  }

  async chooseFileSystemDirectory(): Promise<boolean> {
    try {
      const picker = (
        window as unknown as { showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle> }
      ).showDirectoryPicker;
      if (!picker) return false;
      const handle = await picker();
      this.fsaStorage.setDirectory(handle);
      return true;
    } catch {
      return false;
    }
  }

  getTasks(): DownloadTask[] {
    return this.tasks.map((t) => ({ ...t }));
  }

  getTask(id: string): DownloadTask | undefined {
    return this.tasks.find((t) => t.id === id);
  }

  addTask(
    items: DownloadItem[],
    options: { storage: StorageLocation; serverPath?: string; quota?: StorageQuota }
  ): DownloadTask {
    const task: DownloadTask = {
      id: generateId(),
      status: 'pending',
      items: items.map((i) => ({ ...i })),
      storage: options.storage,
      serverPath: options.serverPath,
      progress: 0,
      downloadedBytes: 0,
      totalBytes: items.reduce((sum, i) => sum + (i.size || 0), 0),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.tasks.unshift(task);
    this.persistTasks();
    this.emitTasksChanged();
    this.processQueue();
    return task;
  }

  async pauseTask(id: string): Promise<void> {
    const task = this.getMutableTask(id);
    if (!task || (task.status !== 'pending' && task.status !== 'running')) return;

    if (task.storage === 'server') {
      const serverTaskId = this.serverTaskMap.get(id);
      if (serverTaskId) {
        await this.api.controlServerDownload(serverTaskId, 'pause');
      }
    }

    const state = this.runtimeStates.get(id);
    if (state?.abortController) {
      try {
        state.abortController.abort();
      } catch {
        /* abort may throw if already aborted */
      }
    }
    task.status = 'paused';
    this.stopPolling(id);
    task.updatedAt = Date.now();
    this.persistTasks();
    this.emitTasksChanged();
  }

  async resumeTask(id: string): Promise<void> {
    const task = this.getMutableTask(id);
    if (!task || task.status !== 'paused') return;

    if (task.storage === 'server') {
      const serverTaskId = this.serverTaskMap.get(id);
      if (serverTaskId) {
        await this.api.controlServerDownload(serverTaskId, 'resume');
      }
    }

    task.status = 'pending';
    task.updatedAt = Date.now();
    this.persistTasks();
    this.emitTasksChanged();
    this.processQueue();
  }

  async cancelTask(id: string): Promise<void> {
    const task = this.getMutableTask(id);
    if (!task) return;

    if (task.storage === 'server') {
      const serverTaskId = this.serverTaskMap.get(id);
      if (serverTaskId) {
        await this.api.controlServerDownload(serverTaskId, 'cancel').catch(() => {});
      }
    }

    const state = this.runtimeStates.get(id);
    if (state?.abortController) {
      try {
        state.abortController.abort();
      } catch {
        /* abort may throw if already aborted */
      }
    }
    task.status = 'cancelled';
    this.stopPolling(id);
    task.updatedAt = Date.now();
    this.persistTasks();
    this.emitTasksChanged();
  }

  removeTask(id: string): void {
    const task = this.getMutableTask(id);
    if (!task) return;
    if (task.status === 'running') {
      this.cancelTask(id);
      return;
    }
    this.tasks = this.tasks.filter((t) => t.id !== id);
    this.runtimeStates.delete(id);
    this.serverTaskMap.delete(id);
    this.stopPolling(id);
    this.persistTasks();
    this.emitTasksChanged();
  }

  clearCompleted(): void {
    this.tasks = this.tasks.filter(
      (t) => t.status !== 'completed' && t.status !== 'cancelled' && t.status !== 'failed'
    );
    this.persistTasks();
    this.emitTasksChanged();
  }

  private getMutableTask(id: string): DownloadTask | undefined {
    return this.tasks.find((t) => t.id === id);
  }

  private loadTasks(): void {
    try {
      const raw = localStorage.getItem(TASKS_STORAGE_KEY);
      if (raw) {
        this.tasks = JSON.parse(raw);
      }
    } catch {
      this.tasks = [];
    }
  }

  private persistTasks(): void {
    try {
      localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(this.tasks));
    } catch {
      // 存储失败时忽略，避免崩溃
    }
  }

  private emitTasksChanged(): void {
    this.dispatchEvent(new CustomEvent('tasksChanged', { detail: this.getTasks() }));
  }

  private async processQueue(): Promise<void> {
    const runningCount = this.tasks.filter((t) => t.status === 'running').length;
    if (runningCount >= this.maxConcurrent) return;

    const pending = this.tasks.find((t) => t.status === 'pending');
    if (!pending) return;

    pending.status = 'running';
    pending.updatedAt = Date.now();
    this.persistTasks();
    this.emitTasksChanged();

    this.runTask(pending.id).catch((err) => {
      logger.error(err, '下载任务执行失败');
    });

    // 继续调度其他 pending 任务
    this.processQueue();
  }

  private async runTask(id: string): Promise<void> {
    const task = this.getMutableTask(id);
    if (!task) return;

    const state: RuntimeTaskState = {};
    this.runtimeStates.set(id, state);

    try {
      if (task.storage === 'server') {
        await this.runServerTask(task, state);
      } else {
        await this.runBrowserTask(task, state);
      }
      if (task.status !== 'cancelled' && task.status !== 'paused' && task.status !== 'failed') {
        task.status = 'completed';
        task.progress = 100;
      }
    } catch (err: unknown) {
      if (task.status !== 'cancelled' && task.status !== 'paused') {
        task.status = 'failed';
        task.error = err instanceof Error ? err.message : '下载失败';
      }
    } finally {
      state.abortController = undefined;
      task.updatedAt = Date.now();
      this.persistTasks();
      this.emitTasksChanged();
      this.runtimeStates.delete(id);
      this.processQueue();
    }
  }

  private async runBrowserTask(task: DownloadTask, state: RuntimeTaskState): Promise<void> {
    const completedIds = new Set<string>(task.completedItemIds || []);
    const storage = this.getBrowserStorage();

    for (const item of task.items) {
      if (completedIds.has(item.id)) continue;
      let shouldStop = task.status === 'cancelled' || task.status === 'paused';
      if (shouldStop) return;

      const controller = new AbortController();
      state.abortController = controller;

      const url = this.buildItemUrl(item);
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`下载失败: ${item.type}/${item.id} (${response.status})`);

      const contentLength = parseInt(response.headers.get('Content-Length') || '0', 10);
      if (contentLength > 0) {
        task.totalBytes = Math.max(task.totalBytes, task.downloadedBytes + contentLength);
      }

      const blob = await this.readResponseWithProgress(response, task, item, controller);
      shouldStop = task.status === 'cancelled' || task.status === 'paused';
      if (shouldStop) return;

      await this.checkBrowserQuota(storage, blob.size, task.storageQuota || this.getDefaultQuota());
      await storage.save(item, blob);

      completedIds.add(item.id);
      task.completedItemIds = Array.from(completedIds);
      task.updatedAt = Date.now();
      this.persistTasks();
      this.emitTasksChanged();
    }
  }

  private async runServerTask(task: DownloadTask, state: RuntimeTaskState): Promise<void> {
    const serverPath = task.serverPath || './downloads';
    const result = await this.api.prepareServerDownload({
      items: task.items,
      serverPath,
      quota: task.storageQuota || this.getDefaultQuota(),
    });
    this.serverTaskMap.set(task.id, result.taskId);
    state.serverTaskId = result.taskId;

    await this.pollServerTask(task, result.taskId);
  }

  private async pollServerTask(task: DownloadTask, serverTaskId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const tick = async () => {
        try {
          const status = await this.api.getServerDownloadStatus(serverTaskId);
          this.updateTaskFromServer(task, status);
          if (
            task.status === 'completed' ||
            task.status === 'failed' ||
            task.status === 'cancelled'
          ) {
            this.stopPolling(task.id);
            resolve();
            return;
          }
          const timer = window.setTimeout(tick, 800);
          this.pollingTimers.set(task.id, timer);
        } catch (err) {
          this.stopPolling(task.id);
          reject(err);
        }
      };
      tick();
    });
  }

  private updateTaskFromServer(task: DownloadTask, serverTask: DownloadTask): void {
    task.status = serverTask.status;
    task.progress = serverTask.progress;
    task.downloadedBytes = serverTask.downloadedBytes;
    task.totalBytes = serverTask.totalBytes;
    task.error = serverTask.error;
    task.fileName = serverTask.fileName;
    task.updatedAt = Date.now();
    this.persistTasks();
    this.emitTasksChanged();
  }

  private stopPolling(id: string): void {
    const timer = this.pollingTimers.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      this.pollingTimers.delete(id);
    }
  }

  private async readResponseWithProgress(
    response: Response,
    task: DownloadTask,
    item: DownloadItem,
    controller: AbortController
  ): Promise<Blob> {
    const reader = response.body?.getReader();
    if (!reader) {
      return await response.blob();
    }

    const chunks: Uint8Array[] = [];
    let itemReceived = 0;

    let done = false;
    while (!done) {
      if (task.status === 'cancelled' || task.status === 'paused') {
        controller.abort();
        reader.releaseLock();
        throw new Error(task.status === 'paused' ? '已暂停' : '已取消');
      }
      const result = await reader.read();
      done = result.done;
      if (done) break;
      const value = result.value;
      if (!value) continue;
      chunks.push(value);
      itemReceived += value.length;
      task.downloadedBytes += value.length;
      if (task.totalBytes > 0) {
        task.progress = Math.min(100, Math.floor((task.downloadedBytes / task.totalBytes) * 100));
      } else if (item.size && item.size > 0) {
        task.totalBytes = Math.max(task.totalBytes, item.size);
        task.progress = Math.min(100, Math.floor((itemReceived / item.size) * 100));
      }
      task.updatedAt = Date.now();
      this.persistTasks();
      this.emitTasksChanged();
    }

    return new Blob(chunks as BlobPart[]);
  }

  private buildItemUrl(item: DownloadItem): string {
    const id = encodeURIComponent(item.id);
    switch (item.type) {
      case 'conversation':
        return `/api/export/conversations/${id}`;
      case 'script':
      case 'code':
        return `/api/scripts/${id}`;
      case 'source':
        return '/api/download/source';
      case 'skill':
      case 'mcp':
      case 'file':
      default:
        return `/api/download/resource?type=${item.type}&id=${id}`;
    }
  }

  private getBrowserStorage(): DownloadStorageBackend {
    switch (this.backend) {
      case 'fsa':
        return this.fsaStorage;
      case 'localstorage':
        return this.localStorageStorage;
      case 'indexeddb':
      default:
        return this.idbStorage;
    }
  }

  private async checkBrowserQuota(
    storage: DownloadStorageBackend,
    addBytes: number,
    quota: StorageQuota
  ): Promise<void> {
    if (!quota.enforce) return;
    const max = quota.browserMaxBytes ?? DEFAULT_BROWSER_MAX_BYTES;
    const current = await storage.estimateUsage();
    if (current + addBytes > max) {
      throw new Error(`浏览器存储配额不足（当前 ${current}，需 ${addBytes}，上限 ${max}）`);
    }
  }

  private getDefaultQuota(): StorageQuota {
    return {
      browserMaxBytes: DEFAULT_BROWSER_MAX_BYTES,
      serverMaxBytes: DEFAULT_SERVER_MAX_BYTES,
      enforce: true,
      serverPath: './downloads',
    };
  }
}

export { sanitizeFileName, generateId };
