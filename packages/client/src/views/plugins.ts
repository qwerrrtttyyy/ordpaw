import { API } from '../api';
import { Store } from '../store';
import { reloadPluginComponents } from '../component-loader';
import { t } from '../i18n';
import type { PluginInstance } from '@ordpaw/shared';

export class PluginsView {
  private api: API;

  constructor(api: API, _store: Store) {
    this.api = api;
  }

  async render() {
    const content = document.getElementById('view-content');
    if (!content) return;

    const plugins = await this.api.getPlugins();

    content.innerHTML = `
      <div class="slide-up">
        <div class="section-header">
          <div>
            <div class="section-title">${plugins.length} ${t('plugin.title')}</div>
            <div class="text-sm text-muted mt-2">${t('plugin.description') || '通过事件服务扩展 Agent 能力'}</div>
          </div>
          <button class="btn btn-primary" id="installPluginBtn">
            <span>＋</span>
            <span>${t('plugin.install')}</span>
          </button>
        </div>

        <div class="card mb-6" style="background: var(--ord-bg-sunken); border-style: dashed;">
          <div class="flex items-start gap-3">
            <div class="stat-icon" style="background: var(--ord-amber-soft); color: var(--ord-amber);">i</div>
            <div>
              <div class="fw-600 mb-1">${t('plugin.guide') || '插件开发指南'}</div>
              <div class="text-sm text-muted">${t('plugin.guideDesc') || '插件使用 JavaScript 编写，通过事件总线与系统交互。'}<br>
              ${t('plugin.guidePath') || '放置于'} <code class="font-mono">plugins/&lt;name&gt;/</code> ${t('plugin.guidePath2') || '目录，包含'} <code class="font-mono">plugin.json</code> ${t('plugin.guidePath3') || '和入口文件。'}</div>
            </div>
          </div>
        </div>

        ${
          plugins.length === 0
            ? `
          <div class="card">
            <div class="empty-state">
              <div class="empty-state-icon">◇</div>
              <div class="empty-state-title">${t('plugin.empty') || '还没有插件'}</div>
              <div class="text-sm text-muted">${t('plugin.emptyDesc') || '注册你的第一个插件扩展系统能力'}</div>
            </div>
          </div>
        `
            : `
          <div class="grid grid-2">
            ${plugins
              .map(
                (p: PluginInstance) => `
              <div class="card">
                <div class="flex items-start gap-3 mb-4">
                  <div class="list-item-icon sage" style="width: 44px; height: 44px;">◇</div>
                  <div style="flex: 1; min-width: 0;">
                    <div class="list-item-title" style="font-size: 15px;">${p.manifest.name}</div>
                    <div class="text-sm text-muted mt-1">${p.manifest.description || t('plugin.noDesc') || '暂无描述'}</div>
                  </div>
                </div>
                <div class="flex gap-2 mb-4">
                  <span class="badge badge-sage badge-dot">v${p.manifest.version}</span>
                  <span class="badge ${p.enabled ? 'badge-accent' : ''} badge-dot">${p.enabled ? t('plugin.enabled') || '已启用' : t('plugin.disabled') || '已禁用'}</span>
                </div>
                <div class="flex gap-2">
                  <button class="btn btn-ghost btn-sm delete-btn" data-id="${p.id}">${t('plugin.uninstall') || '卸载'}</button>
                </div>
              </div>
            `
              )
              .join('')}
          </div>
        `
        }
      </div>
    `;

    document.getElementById('installPluginBtn')?.addEventListener('click', () => {
      this.showInstallModal();
    });

    content.querySelectorAll('.delete-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = (e.currentTarget as HTMLElement).getAttribute('data-id');
        if (id && confirm(t('plugin.confirmUninstall') || '确定卸载此插件？')) {
          await this.api.deletePlugin(id);
          // Re-fetch the manifest so the uninstalled plugin's contributions
          // disappear without a full page reload.
          await reloadPluginComponents();
          this.render();
        }
      });
    });
  }

  private showInstallModal() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <div class="modal-title">${t('plugin.register') || '注册插件'}</div>
          <button class="modal-close" id="closeBtn">×</button>
        </div>
        <div class="form-group">
          <label class="form-label">${t('plugin.name') || '插件名称'} *</label>
          <input type="text" class="input" id="pluginName" placeholder="my-plugin">
        </div>
        <div class="form-group">
          <label class="form-label">${t('plugin.version') || '版本'}</label>
          <input type="text" class="input" id="pluginVersion" value="0.0.1">
        </div>
        <div class="form-group">
          <label class="form-label">${t('plugin.descriptionField') || '描述'}</label>
          <textarea class="textarea" id="pluginDesc" placeholder="${t('plugin.descriptionPlaceholder') || '插件功能描述'}"></textarea>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="cancelBtn">${t('common.cancel')}</button>
          <button class="btn btn-primary" id="confirmBtn">${t('plugin.register') || '注册'}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('#closeBtn')?.addEventListener('click', close);
    overlay.querySelector('#cancelBtn')?.addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });

    overlay.querySelector('#confirmBtn')?.addEventListener('click', async () => {
      const name = (overlay.querySelector('#pluginName') as HTMLInputElement)?.value;
      const version =
        (overlay.querySelector('#pluginVersion') as HTMLInputElement)?.value || '0.0.1';
      const description = (overlay.querySelector('#pluginDesc') as HTMLTextAreaElement)?.value;
      if (!name) {
        alert(t('plugin.nameRequired') || '请填写插件名称');
        return;
      }
      await this.api.installPlugin({ name, version, description, manifest: {} });
      // Reload manifest so the newly-installed plugin's CSS/scripts are
      // injected without requiring a page refresh.
      await reloadPluginComponents();
      close();
      this.render();
    });
  }
}
