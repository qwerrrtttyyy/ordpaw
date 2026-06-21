import { API } from '../api';
import { Store } from '../store';
import { t } from '../i18n';
import type { Provider } from '@ordpaw/shared';

export class AgentsView {
  private api: API;
  private store: Store;
  private onStatsChange: () => Promise<void>;
  private providers: Provider[] = [];

  constructor(api: API, store: Store, onStatsChange: () => Promise<void>) {
    this.api = api;
    this.store = store;
    this.onStatsChange = onStatsChange;
  }

  async render() {
    const content = document.getElementById('view-content');
    if (!content) return;

    const locale = this.store.getLocale();
    const [agents, providers] = await Promise.all([this.api.getAgents(), this.api.getProviders()]);
    this.providers = providers;

    content.innerHTML = `
      <div class="slide-up">
        <div class="section-header">
          <div>
            <div class="section-title">${agents.length} ${t('nav.agents')}</div>
            <div class="text-sm text-muted mt-2">${locale === 'en-US' ? 'Manage and configure your agents' : '管理和配置你的智能体'}</div>
          </div>
          <button class="btn btn-primary" id="createAgentBtn">
            <span>＋</span>
            <span>${t('agent.create')}</span>
          </button>
        </div>

        ${agents.length === 0 ? `
          <div class="card">
            <div class="empty-state">
              <div class="empty-state-icon">◉</div>
              <div class="empty-state-title">${locale === 'en-US' ? 'No agents yet' : '还没有 Agent'}</div>
              <div class="text-sm text-muted mb-4">${locale === 'en-US' ? 'Create your first agent' : '创建你的第一个智能体开始构建'}</div>
              <button class="btn btn-primary" id="emptyCreateBtn">${t('agent.create')}</button>
            </div>
          </div>
        ` : `
          <div class="grid grid-2">
            ${agents.map((a: any) => `
              <div class="card">
                <div class="flex items-start gap-3 mb-4">
                  <div class="list-item-icon accent" style="width: 44px; height: 44px;">◉</div>
                  <div style="flex: 1; min-width: 0;">
                    <div class="list-item-title" style="font-size: 15px;">${a.name}</div>
                    <div class="text-sm text-muted mt-1">${a.description || (locale === 'en-US' ? 'No description' : '暂无描述')}</div>
                  </div>
                </div>
                <div class="flex gap-2 mb-4 flex-wrap">
                  <span class="badge badge-accent badge-dot">${a.model}</span>
                  <span class="badge badge-dot">${(a.skills || []).length} ${locale === 'en-US' ? 'skills' : '技能'}</span>
                  <span class="badge badge-dot">${(a.mcpServers || []).length} MCP</span>
                </div>
                <div class="flex gap-2">
                  <button class="btn btn-secondary btn-sm edit-btn" data-id="${a.id}">${t('common.edit')}</button>
                  <button class="btn btn-ghost btn-sm delete-btn" data-id="${a.id}">${t('common.delete')}</button>
                </div>
              </div>
            `).join('')}
          </div>
        `}
      </div>
    `;

    const createHandler = () => this.showCreateModal();
    document.getElementById('createAgentBtn')?.addEventListener('click', createHandler);
    document.getElementById('emptyCreateBtn')?.addEventListener('click', createHandler);

    content.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = (e.currentTarget as HTMLElement).getAttribute('data-id');
        if (id) {
          const agent = await this.api.getAgent(id);
          this.showEditModal(agent);
        }
      });
    });

    content.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = (e.currentTarget as HTMLElement).getAttribute('data-id');
        if (id && confirm(t('agent.deleteConfirm'))) {
          await this.api.deleteAgent(id);
          await this.onStatsChange();
          this.render();
        }
      });
    });
  }

  private showCreateModal() {
    const defaultProvider = this.providers[0];
    this.createModal(t('agent.create'), `
      <div class="form-group">
        <label class="form-label">${t('agent.name')} *</label>
        <input type="text" class="input" id="agentName" placeholder="${t('agent.name')}">
      </div>
      <div class="form-group">
        <label class="form-label">${t('agent.description')}</label>
        <input type="text" class="input" id="agentDesc" placeholder="${t('agent.description')}">
      </div>
      <div class="form-group">
        <label class="form-label">${t('agent.systemPrompt')}</label>
        <textarea class="textarea" id="agentPrompt" placeholder="${t('agent.systemPrompt')}"></textarea>
      </div>
      <div class="form-group">
        <label class="form-label">${t('agent.provider')}</label>
        <select class="select" id="agentProvider">
          ${this.renderProviderOptions(defaultProvider?.id)}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">${t('agent.model')}</label>
        <select class="select" id="agentModel">
          ${this.renderModelOptions(defaultProvider?.id, defaultProvider?.models[0]?.id)}
        </select>
      </div>
    `, async (modal) => {
      const name = (modal.querySelector('#agentName') as HTMLInputElement)?.value;
      const description = (modal.querySelector('#agentDesc') as HTMLInputElement)?.value;
      const systemPrompt = (modal.querySelector('#agentPrompt') as HTMLTextAreaElement)?.value;
      const providerId = (modal.querySelector('#agentProvider') as HTMLSelectElement)?.value;
      const model = (modal.querySelector('#agentModel') as HTMLSelectElement)?.value;
      if (!name) {
        alert(this.store.getLocale() === 'en-US' ? 'Name is required' : '请填写名称');
        return false;
      }
      await this.api.createAgent({ name, description, systemPrompt, providerId, model });
      await this.onStatsChange();
      return true;
    }, () => this.bindProviderModelSync());
  }

  private showEditModal(agent: any) {
    const providerId = this.resolveProviderId(agent.providerId);
    this.createModal(t('common.edit'), `
      <div class="form-group">
        <label class="form-label">${t('agent.name')} *</label>
        <input type="text" class="input" id="agentName" value="${agent.name}">
      </div>
      <div class="form-group">
        <label class="form-label">${t('agent.description')}</label>
        <input type="text" class="input" id="agentDesc" value="${agent.description || ''}">
      </div>
      <div class="form-group">
        <label class="form-label">${t('agent.systemPrompt')}</label>
        <textarea class="textarea" id="agentPrompt">${agent.systemPrompt || ''}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label">${t('agent.provider')}</label>
        <select class="select" id="agentProvider">
          ${this.renderProviderOptions(providerId)}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">${t('agent.model')}</label>
        <select class="select" id="agentModel">
          ${this.renderModelOptions(providerId, agent.model)}
        </select>
      </div>
    `, async (modal) => {
      const name = (modal.querySelector('#agentName') as HTMLInputElement)?.value;
      const description = (modal.querySelector('#agentDesc') as HTMLInputElement)?.value;
      const systemPrompt = (modal.querySelector('#agentPrompt') as HTMLTextAreaElement)?.value;
      const newProviderId = (modal.querySelector('#agentProvider') as HTMLSelectElement)?.value;
      const model = (modal.querySelector('#agentModel') as HTMLSelectElement)?.value;
      if (!name) {
        alert(this.store.getLocale() === 'en-US' ? 'Name is required' : '请填写名称');
        return false;
      }
      await this.api.updateAgent(agent.id, { name, description, systemPrompt, providerId: newProviderId, model });
      return true;
    }, () => this.bindProviderModelSync());
  }

  private createModal(title: string, body: string, onSubmit: (modal: HTMLElement) => Promise<boolean>, onMount?: () => void) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <div class="modal-title">${title}</div>
          <button class="modal-close" id="closeBtn">×</button>
        </div>
        <div class="modal-body">${body}</div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="cancelBtn">${t('common.cancel')}</button>
          <button class="btn btn-primary" id="confirmBtn">${t('common.save')}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    onMount?.();

    const close = () => overlay.remove();
    overlay.querySelector('#closeBtn')?.addEventListener('click', close);
    overlay.querySelector('#cancelBtn')?.addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
    overlay.querySelector('#confirmBtn')?.addEventListener('click', async () => {
      const ok = await onSubmit(overlay);
      if (ok) {
        close();
        this.render();
      }
    });
    return overlay;
  }

  private renderProviderOptions(selectedId?: string) {
    if (this.providers.length === 0) {
      return `<option value="">${t('common.empty')}</option>`;
    }
    return this.providers.map(p =>
      `<option value="${p.id}" ${p.id === selectedId ? 'selected' : ''}>${p.name} (${p.type})</option>`
    ).join('');
  }

  private renderModelOptions(providerId?: string, selectedModel?: string) {
    const provider = this.providers.find(p => p.id === providerId) || this.providers[0];
    if (!provider || provider.models.length === 0) {
      return `<option value="">${t('common.empty')}</option>`;
    }
    return provider.models.map(m =>
      `<option value="${m.id}" ${m.id === selectedModel ? 'selected' : ''}>${m.name}</option>`
    ).join('');
  }

  private bindProviderModelSync() {
    const providerSelect = document.getElementById('agentProvider') as HTMLSelectElement | null;
    const modelSelect = document.getElementById('agentModel') as HTMLSelectElement | null;
    if (!providerSelect || !modelSelect) return;

    providerSelect.addEventListener('change', () => {
      const provider = this.providers.find(p => p.id === providerSelect.value);
      modelSelect.innerHTML = this.renderModelOptions(provider?.id, provider?.models[0]?.id);
    });
  }

  private resolveProviderId(providerId?: string): string | undefined {
    if (!providerId) return this.providers[0]?.id;
    const byId = this.providers.find(p => p.id === providerId);
    if (byId) return byId.id;
    const byType = this.providers.find(p => p.type === providerId);
    if (byType) return byType.id;
    return this.providers[0]?.id;
  }
}
