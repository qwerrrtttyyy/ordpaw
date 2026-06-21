import { API } from '../api';
import { Store } from '../store';
import { t } from '../i18n';
import { DownloadManager } from '../download-manager';
import type {
  DownloadItem,
  StorageLocation,
  BrowserStorageBackend,
  Agent,
  Conversation,
  Script,
  InstalledSkill,
} from '@ordpaw/shared';

interface ResourceGroup {
  type: DownloadItem['type'];
  label: string;
  items: DownloadItem[];
}

export class DownloadManagerView {
  private api: API;
  private store: Store;
  private downloadManager: DownloadManager;
  private selectedIds = new Set<string>();
  private resources: ResourceGroup[] = [];
  private currentFilter: DownloadItem['type'] | 'all' = 'all';

  constructor(api: API, store: Store, downloadManager: DownloadManager) {
    this.api = api;
    this.store = store;
    this.downloadManager = downloadManager;
  }

  async render() {
    const content = document.getElementById('view-content');
    if (!content) return;

    const settings = this.store.getSettings();
    this.downloadManager.setBrowserBackend(settings.browserStorageBackend || 'indexeddb');

    await this.loadResources();

    content.innerHTML = `
      <div class="slide-up">
        <div class="section-header">
          <div>
            <div class="section-title">${t('download.title')}</div>
            <div class="text-sm text-muted mt-2">${t('download.subtitle')}</div>
          </div>
        </div>

        <div class="grid-2" style="gap: 24px; align-items: start;">
          <div class="card">
            <div class="card-header">
              <div>
                <div class="card-title">${t('download.resources')}</div>
                <div class="text-sm text-muted">${this.resources.reduce((sum, g) => sum + g.items.length, 0)} ${t('common.empty')}</div>
              </div>
            </div>

            <div class="flex gap-2 flex-wrap mb-4">
              <button class="btn btn-ghost btn-sm ${this.currentFilter === 'all' ? 'active' : ''}" data-filter="all">${t('common.empty') === '暂无数据' ? '全部' : 'All'}</button>
              <button class="btn btn-ghost btn-sm ${this.currentFilter === 'conversation' ? 'active' : ''}" data-filter="conversation">${t('nav.conversations')}</button>
              <button class="btn btn-ghost btn-sm ${this.currentFilter === 'code' ? 'active' : ''}" data-filter="code">${t('common.empty') === '暂无数据' ? '代码' : 'Code'}</button>
              <button class="btn btn-ghost btn-sm ${this.currentFilter === 'skill' ? 'active' : ''}" data-filter="skill">Skills</button>
              <button class="btn btn-ghost btn-sm ${this.currentFilter === 'mcp' ? 'active' : ''}" data-filter="mcp">MCP</button>
              <button class="btn btn-ghost btn-sm ${this.currentFilter === 'source' ? 'active' : ''}" data-filter="source">${t('download.sourceCode')}</button>
            </div>

            <div class="flex gap-2 mb-4">
              <button class="btn btn-secondary btn-sm" id="selectAllBtn">${t('download.selectAll')}</button>
              <button class="btn btn-ghost btn-sm" id="clearSelectionBtn">${t('download.clearSelection')}</button>
            </div>

            <div id="resource-list" style="max-height: 420px; overflow-y: auto;">
              ${this.renderResourceList()}
            </div>

            <div class="form-group mt-4">
              <label class="form-label">${t('download.storageLocation')}</label>
              <select class="select" id="storageLocation">
                <option value="browser" ${settings.downloadStorage === 'browser' ? 'selected' : ''}>${t('download.browserStorage')}</option>
                <option value="server" ${settings.downloadStorage === 'server' ? 'selected' : ''}>${t('download.serverStorage')}</option>
              </select>
            </div>

            <div class="form-group" id="backendGroup" style="${settings.downloadStorage === 'browser' ? '' : 'display:none'}">
              <label class="form-label">${t('download.browserBackend')}</label>
              <select class="select" id="browserBackendSelect">
                <option value="indexeddb" ${settings.browserStorageBackend === 'indexeddb' ? 'selected' : ''}>IndexedDB</option>
                <option value="fsa" ${settings.browserStorageBackend === 'fsa' ? 'selected' : ''}>File System Access</option>
                <option value="localstorage" ${settings.browserStorageBackend === 'localstorage' ? 'selected' : ''}>localStorage</option>
              </select>
            </div>

            <div class="form-group" id="serverPathInputGroup" style="${settings.downloadStorage === 'server' ? '' : 'display:none'}">
              <label class="form-label">${settings.locale === 'en-US' ? 'Server Directory' : '服务端目录'}</label>
              <input type="text" class="input" id="serverPathInput" value="${settings.storageQuota?.serverPath || './downloads'}">
            </div>

            <div class="flex justify-end mt-4">
              <button class="btn btn-primary" id="startDownloadBtn">${t('download.startDownload')}</button>
            </div>
          </div>

          <div class="card">
            <div class="card-header">
              <div>
                <div class="card-title">${t('download.tasks')}</div>
                <div class="text-sm text-muted">${this.downloadManager.getTasks().length} ${t('download.tasks')}</div>
              </div>
            </div>
            <div id="task-list">
              ${this.renderTaskList()}
            </div>
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
    this.renderTaskListInto(content.querySelector('#task-list') as HTMLElement);
  }

  private async loadResources() {
    const [conversations, scripts, skills, agents] = await Promise.all([
      this.api.getConversations(),
      this.api.getScripts(),
      this.api.getSkills(),
      this.api.getAgents(),
    ]);

    const groups: ResourceGroup[] = [
      {
        type: 'conversation',
        label: t('nav.conversations'),
        items: (conversations || []).map((c: Conversation) => ({
          id: c.id,
          type: 'conversation' as const,
          name: c.title || `Conversation ${c.id.slice(0, 8)}`,
        })),
      },
      {
        type: 'code',
        label: t('common.empty') === '暂无数据' ? '代码 / 脚本' : 'Code / Scripts',
        items: (scripts || []).map((s: Script) => ({
          id: s.id,
          type: 'code' as const,
          name: s.name || `Script ${s.id.slice(0, 8)}`,
        })),
      },
      {
        type: 'skill',
        label: 'Skills',
        items: (skills || []).map((s: InstalledSkill) => ({
          id: s.id,
          type: 'skill' as const,
          name: s.name || `Skill ${s.id.slice(0, 8)}`,
        })),
      },
      {
        type: 'mcp',
        label: 'MCP',
        items: (agents || [])
          .filter((a: Agent) => a.mcpServers && a.mcpServers.length > 0)
          .map((a: Agent) => ({
            id: a.id,
            type: 'mcp' as const,
            name: `${a.name} MCP`,
          })),
      },
      {
        type: 'source',
        label: t('download.sourceCode'),
        items: [{ id: 'source', type: 'source' as const, name: t('download.sourceCode') }],
      },
    ];

    this.resources = groups;
  }

  private renderResourceList(): string {
    const groups =
      this.currentFilter === 'all'
        ? this.resources
        : this.resources.filter((g) => g.type === this.currentFilter);

    if (groups.every((g) => g.items.length === 0)) {
      return `<div class="empty-state"><div class="empty-state-title">${t('common.empty')}</div></div>`;
    }

    return groups
      .map(
        (g) => `
      <div style="margin-bottom: 16px;">
        <div class="text-sm fw-500 mb-2" style="color: var(--ord-text-secondary);">${g.label}</div>
        ${g.items
          .map(
            (item) => `
          <label class="flex items-center gap-2" style="padding: 8px 0; border-bottom: 1px solid var(--ord-divider); cursor: pointer;">
            <input type="checkbox" class="resource-checkbox" value="${item.id}" data-type="${item.type}" data-name="${escapeHtml(item.name || item.id)}" ${this.selectedIds.has(item.id) ? 'checked' : ''}>
            <span class="text-sm">${escapeHtml(item.name || item.id)}</span>
          </label>
        `
          )
          .join('')}
      </div>
    `
      )
      .join('');
  }

  private renderTaskList(): string {
    const tasks = this.downloadManager.getTasks();
    if (tasks.length === 0) {
      return `<div class="empty-state"><div class="empty-state-title">${t('download.noTasks')}</div></div>`;
    }

    return (
      tasks
        .map(
          (task) => `
      <div class="task-row" style="padding: 12px 0; border-bottom: 1px solid var(--ord-divider);">
        <div class="flex items-center justify-between mb-2">
          <div>
            <div class="text-sm fw-500">${task.items.length} ${t('download.resources')}</div>
            <div class="text-xs text-muted">${formatBytes(task.downloadedBytes)} / ${formatBytes(task.totalBytes)} · ${this.statusLabel(task.status)}</div>
          </div>
          <div class="flex gap-2">
            ${task.status === 'running' ? `<button class="btn btn-ghost btn-sm" data-action="pause" data-task="${task.id}">${t('download.pause')}</button>` : ''}
            ${task.status === 'paused' ? `<button class="btn btn-ghost btn-sm" data-action="resume" data-task="${task.id}">${t('download.resume')}</button>` : ''}
            ${task.status === 'running' || task.status === 'paused' || task.status === 'pending' ? `<button class="btn btn-ghost btn-sm" data-action="cancel" data-task="${task.id}">${t('download.cancel')}</button>` : ''}
            ${task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled' ? `<button class="btn btn-ghost btn-sm" data-action="remove" data-task="${task.id}">${t('download.remove')}</button>` : ''}
          </div>
        </div>
        <div class="progress-bar" style="height: 6px; background: var(--ord-surface-2); border-radius: 3px; overflow: hidden;">
          <div class="progress-fill" style="width: ${task.progress}%; height: 100%; background: var(--ord-primary); transition: width 0.2s;"></div>
        </div>
        ${task.error ? `<div class="text-xs text-danger mt-1">${escapeHtml(task.error)}</div>` : ''}
      </div>
    `
        )
        .join('') +
      `
      <div class="flex justify-end mt-3">
        <button class="btn btn-ghost btn-sm" id="clearCompletedBtn">${t('common.clear')}</button>
      </div>
    `
    );
  }

  private renderTaskListInto(container: HTMLElement | null) {
    if (!container) return;
    container.innerHTML = this.renderTaskList();
    container.querySelectorAll<HTMLElement>('[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = btn.getAttribute('data-action');
        const taskId = btn.getAttribute('data-task');
        if (!taskId) return;
        if (action === 'pause') this.downloadManager.pauseTask(taskId);
        if (action === 'resume') this.downloadManager.resumeTask(taskId);
        if (action === 'cancel') this.downloadManager.cancelTask(taskId);
        if (action === 'remove') this.downloadManager.removeTask(taskId);
      });
    });
    container.querySelector('#clearCompletedBtn')?.addEventListener('click', () => {
      this.downloadManager.clearCompleted();
    });
  }

  private statusLabel(status: DownloadItem['type'] | string): string {
    switch (status) {
      case 'completed':
        return t('download.completed');
      case 'failed':
        return t('download.failed');
      case 'cancelled':
        return t('download.cancelled');
      case 'paused':
        return t('download.paused');
      case 'running':
        return t('download.running');
      default:
        return t('common.loading');
    }
  }

  private bindEvents() {
    const content = document.getElementById('view-content');
    if (!content) return;

    this.downloadManager.addEventListener('tasksChanged', () => {
      this.renderTaskListInto(content.querySelector('#task-list') as HTMLElement);
    });

    content.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.currentFilter = btn.getAttribute('data-filter') as DownloadItem['type'] | 'all';
        const list = content.querySelector('#resource-list') as HTMLElement;
        if (list) list.innerHTML = this.renderResourceList();
        this.bindCheckboxEvents();
        // refresh active class
        content.querySelectorAll('[data-filter]').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    this.bindCheckboxEvents();

    document.getElementById('selectAllBtn')?.addEventListener('click', () => {
      const visible = this.getVisibleItems();
      visible.forEach((i) => this.selectedIds.add(i.id));
      this.refreshCheckboxes();
    });

    document.getElementById('clearSelectionBtn')?.addEventListener('click', () => {
      this.selectedIds.clear();
      this.refreshCheckboxes();
    });

    const storageSelect = document.getElementById('storageLocation') as HTMLSelectElement;
    storageSelect?.addEventListener('change', () => {
      const isBrowser = storageSelect.value === 'browser';
      const backendGroup = document.getElementById('backendGroup');
      const serverGroup = document.getElementById('serverPathInputGroup');
      if (backendGroup) backendGroup.style.display = isBrowser ? '' : 'none';
      if (serverGroup) serverGroup.style.display = isBrowser ? 'none' : '';
    });

    document.getElementById('startDownloadBtn')?.addEventListener('click', async () => {
      await this.startDownload();
    });
  }

  private bindCheckboxEvents() {
    const content = document.getElementById('view-content');
    if (!content) return;
    content.querySelectorAll<HTMLInputElement>('.resource-checkbox').forEach((cb) => {
      cb.addEventListener('change', () => {
        const id = cb.value;
        if (cb.checked) {
          this.selectedIds.add(id);
        } else {
          this.selectedIds.delete(id);
        }
      });
    });
  }

  private refreshCheckboxes() {
    const content = document.getElementById('view-content');
    if (!content) return;
    content.querySelectorAll<HTMLInputElement>('.resource-checkbox').forEach((cb) => {
      cb.checked = this.selectedIds.has(cb.value);
    });
  }

  private getVisibleItems(): DownloadItem[] {
    const groups =
      this.currentFilter === 'all'
        ? this.resources
        : this.resources.filter((g) => g.type === this.currentFilter);
    return groups.flatMap((g) => g.items);
  }

  private async startDownload() {
    const visible = this.getVisibleItems();
    const selected = visible.filter((i) => this.selectedIds.has(i.id));
    if (selected.length === 0) {
      this.toast(t('common.empty'));
      return;
    }

    const storage = (document.getElementById('storageLocation') as HTMLSelectElement)
      ?.value as StorageLocation;
    const backend = (document.getElementById('browserBackendSelect') as HTMLSelectElement)
      ?.value as BrowserStorageBackend;
    this.downloadManager.setBrowserBackend(backend);

    if (storage === 'browser' && backend === 'fsa') {
      const ok = await this.downloadManager.chooseFileSystemDirectory();
      if (!ok) {
        this.toast('File System Access 需要用户选择目录');
        return;
      }
    }

    const serverPath =
      storage === 'server'
        ? (document.getElementById('serverPathInput') as HTMLInputElement)?.value || './downloads'
        : undefined;

    this.downloadManager.addTask(selected, { storage, serverPath });
    this.toast(t('download.startDownload'));
  }

  private toast(message: string) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2400);
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}
