import { API } from '../api';
import { Store } from '../store';

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
            <div class="section-title">${plugins.length} 个插件</div>
            <div class="text-sm text-muted mt-2">通过事件服务扩展 Agent 能力</div>
          </div>
          <button class="btn btn-primary" id="installPluginBtn">
            <span>＋</span>
            <span>安装插件</span>
          </button>
        </div>

        <div class="card mb-6" style="background: var(--ord-bg-sunken); border-style: dashed;">
          <div class="flex items-start gap-3">
            <div class="stat-icon" style="background: var(--ord-amber-soft); color: var(--ord-amber);">i</div>
            <div>
              <div class="fw-600 mb-1">插件开发指南</div>
              <div class="text-sm text-muted">插件使用 JavaScript 编写，通过事件总线与系统交互。<br>
              放置于 <code class="font-mono">plugins/&lt;name&gt;/</code> 目录，包含 <code class="font-mono">plugin.json</code> 和入口文件。</div>
            </div>
          </div>
        </div>

        ${plugins.length === 0 ? `
          <div class="card">
            <div class="empty-state">
              <div class="empty-state-icon">◇</div>
              <div class="empty-state-title">还没有插件</div>
              <div class="text-sm text-muted">注册你的第一个插件扩展系统能力</div>
            </div>
          </div>
        ` : `
          <div class="grid grid-2">
            ${plugins.map((p: any) => `
              <div class="card">
                <div class="flex items-start gap-3 mb-4">
                  <div class="list-item-icon sage" style="width: 44px; height: 44px;">◇</div>
                  <div style="flex: 1; min-width: 0;">
                    <div class="list-item-title" style="font-size: 15px;">${p.name}</div>
                    <div class="text-sm text-muted mt-1">${p.description || '暂无描述'}</div>
                  </div>
                </div>
                <div class="flex gap-2 mb-4">
                  <span class="badge badge-sage badge-dot">v${p.version}</span>
                  <span class="badge ${p.enabled ? 'badge-accent' : ''} badge-dot">${p.enabled ? '已启用' : '已禁用'}</span>
                </div>
                <div class="flex gap-2">
                  <button class="btn btn-ghost btn-sm delete-btn" data-id="${p.id}">卸载</button>
                </div>
              </div>
            `).join('')}
          </div>
        `}
      </div>
    `;

    document.getElementById('installPluginBtn')?.addEventListener('click', () => {
      this.showInstallModal();
    });

    content.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = (e.currentTarget as HTMLElement).getAttribute('data-id');
        if (id && confirm('确定卸载此插件？')) {
          await this.api.deletePlugin(id);
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
          <div class="modal-title">注册插件</div>
          <button class="modal-close" id="closeBtn">×</button>
        </div>
        <div class="form-group">
          <label class="form-label">插件名称 *</label>
          <input type="text" class="input" id="pluginName" placeholder="my-plugin">
        </div>
        <div class="form-group">
          <label class="form-label">版本</label>
          <input type="text" class="input" id="pluginVersion" value="1.0.0">
        </div>
        <div class="form-group">
          <label class="form-label">描述</label>
          <textarea class="textarea" id="pluginDesc" placeholder="插件功能描述"></textarea>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="cancelBtn">取消</button>
          <button class="btn btn-primary" id="confirmBtn">注册</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('#closeBtn')?.addEventListener('click', close);
    overlay.querySelector('#cancelBtn')?.addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    overlay.querySelector('#confirmBtn')?.addEventListener('click', async () => {
      const name = (overlay.querySelector('#pluginName') as HTMLInputElement)?.value;
      const version = (overlay.querySelector('#pluginVersion') as HTMLInputElement)?.value || '1.0.0';
      const description = (overlay.querySelector('#pluginDesc') as HTMLTextAreaElement)?.value;
      if (!name) {
        alert('请填写插件名称');
        return;
      }
      await this.api.installPlugin({ name, version, description, manifest: {} });
      close();
      this.render();
    });
  }
}
