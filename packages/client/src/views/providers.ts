import { API } from '../api';
import { t } from '../i18n';
import type { Provider } from '@ordpaw/shared';

export class ProvidersView {
  private api: API;

  constructor(api: API) {
    this.api = api;
  }

  async render() {
    const content = document.getElementById('view-content');
    if (!content) return;

    const providers = await this.api.getProviders();

    content.innerHTML = `
      <div class="section-header">
        <div>
          <div class="section-title">${t('provider.title')}</div>
          <div class="card-subtitle">${providers.length} ${t('provider.items')}</div>
        </div>
        <button class="btn btn-primary" id="createProviderBtn">
          <span>+</span>
          <span>${t('provider.create')}</span>
        </button>
      </div>

      <div class="card mb-6">
        <div class="card-header">
          <div class="card-title">${t('provider.builtIn')}</div>
        </div>
        <div class="text-sm text-secondary">
          ${t('provider.description')}
        </div>
      </div>

      ${
        providers.length === 0
          ? `
        <div class="empty-state">
          <div class="empty-state-icon">▣</div>
          <div class="empty-state-title">${t('common.empty')}</div>
        </div>
      `
          : `
        <div class="grid grid-2" id="providers-list">
          ${providers.map((p) => this.renderCard(p)).join('')}
        </div>
      `
      }
    `;

    document.getElementById('createProviderBtn')?.addEventListener('click', () => this.showModal());
    content.querySelectorAll('.provider-edit').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).getAttribute('data-id');
        if (id) this.showModal(id);
      });
    });
    content.querySelectorAll('.provider-delete').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).getAttribute('data-id');
        if (id && confirm(t('provider.deleteConfirm'))) this.deleteProvider(id);
      });
    });
    content.querySelectorAll('.provider-toggle').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).getAttribute('data-id');
        const enabled = (btn as HTMLElement).getAttribute('data-enabled') === 'true';
        if (id) this.api.updateProvider(id, { enabled: !enabled }).then(() => this.render());
      });
    });
  }

  private renderCard(p: Provider) {
    const models = p.models.map((m) => m.name).join(', ') || '-';
    return `
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">${this.escapeHtml(p.name)}</div>
            <div class="card-subtitle">${this.escapeHtml(p.baseUrl || '')}</div>
          </div>
          <span class="badge ${p.isBuiltIn ? 'badge-sage' : 'badge-amber'}">${p.isBuiltIn ? t('provider.builtIn') : t('provider.custom')}</span>
        </div>
        <div class="text-sm text-secondary mb-2">${t('provider.type')}: ${p.type}</div>
        <div class="text-sm text-secondary mb-2">${t('provider.models')}: ${this.escapeHtml(models)}</div>
        <div class="flex gap-2" style="justify-content:flex-end">
          <button class="btn btn-sm ${p.enabled ? 'btn-secondary' : 'btn-ghost'} provider-toggle" data-id="${p.id}" data-enabled="${p.enabled}">${p.enabled ? t('common.enabled') : t('common.disabled')}</button>
          <button class="btn btn-sm btn-ghost provider-edit" data-id="${p.id}">${t('common.edit')}</button>
          ${p.isBuiltIn ? '' : `<button class="btn btn-sm btn-ghost provider-delete" data-id="${p.id}">${t('common.delete')}</button>`}
        </div>
      </div>
    `;
  }

  private async showModal(id?: string) {
    const provider = id
      ? await this.api.getProviderModels(id).then(async () => {
          const list = await this.api.getProviders();
          return list.find((p) => p.id === id);
        })
      : undefined;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width:560px">
        <div class="modal-header">
          <div class="modal-title">${id ? t('common.edit') : t('provider.create')}</div>
          <button class="modal-close" id="closeModal">×</button>
        </div>
        <div class="form-group">
          <label class="form-label">${t('provider.name')}</label>
          <input type="text" class="input" id="pName" value="${provider ? this.escapeHtml(provider.name) : ''}">
        </div>
        <div class="form-group">
          <label class="form-label">${t('provider.type')}</label>
          <select class="input" id="pType">
            <option value="openai" ${provider?.type === 'openai' ? 'selected' : ''}>OpenAI</option>
            <option value="anthropic" ${provider?.type === 'anthropic' ? 'selected' : ''}>Anthropic</option>
            <option value="ollama" ${provider?.type === 'ollama' ? 'selected' : ''}>Ollama</option>
            <option value="custom" ${provider?.type === 'custom' ? 'selected' : ''}>Custom</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Base URL</label>
          <input type="text" class="input" id="pBaseUrl" value="${provider ? this.escapeHtml(provider.baseUrl || '') : ''}">
        </div>
        <div class="form-group">
          <label class="form-label">API Key</label>
          <input type="password" class="input" id="pApiKey" value="${provider ? this.escapeHtml(provider.apiKey || '') : ''}">
        </div>
        <div class="form-group">
          <label class="form-label">${t('provider.models')}</label>
          <input type="text" class="input" id="pModels" value="${provider ? this.escapeHtml(provider.models.map((m) => m.id).join(', ')) : ''}" placeholder="gpt-4o, claude-3-5-sonnet">
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" id="cancelModal">${t('common.cancel')}</button>
          <button class="btn btn-primary" id="saveProvider">${t('common.save')}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    document.getElementById('closeModal')?.addEventListener('click', close);
    document.getElementById('cancelModal')?.addEventListener('click', close);

    document.getElementById('saveProvider')?.addEventListener('click', async () => {
      const name = (document.getElementById('pName') as HTMLInputElement).value.trim();
      const type = (document.getElementById('pType') as HTMLSelectElement)
        .value as Provider['type'];
      const baseUrl = (document.getElementById('pBaseUrl') as HTMLInputElement).value.trim();
      const apiKey = (document.getElementById('pApiKey') as HTMLInputElement).value.trim();
      const modelsRaw = (document.getElementById('pModels') as HTMLInputElement).value.trim();
      const models = modelsRaw
        ? modelsRaw
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
            .map((id) => ({ id, name: id }))
        : [];
      const data = { name, type, baseUrl, apiKey, models };

      if (id) {
        await this.api.updateProvider(id, data);
      } else {
        await this.api.createProvider(data);
      }
      close();
      await this.render();
    });
  }

  private async deleteProvider(id: string) {
    await this.api.deleteProvider(id);
    await this.render();
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
