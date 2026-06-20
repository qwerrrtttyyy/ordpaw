import { API } from '../api';
import { t } from '../i18n';
import type { Script, ScriptExecutionResult } from '@ordpaw/shared';

export class ScriptsView {
  private api: API;

  constructor(api: API) {
    this.api = api;
  }

  async render() {
    const content = document.getElementById('view-content');
    if (!content) return;

    const scripts = await this.api.getScripts();

    content.innerHTML = `
      <div class="section-header">
        <div>
          <div class="section-title">${t('script.title')}</div>
          <div class="card-subtitle">ScriptMCP · ${scripts.length} ${t('common.empty') === 'No data' ? 'items' : '项'}</div>
        </div>
        <button class="btn btn-primary" id="createScriptBtn">
          <span>+</span>
          <span>${t('script.create')}</span>
        </button>
      </div>

      <div class="card mb-6">
        <div class="card-header">
          <div class="card-title">${t('script.tools.title')}</div>
        </div>
        <div class="text-sm text-secondary mb-2">
          AI 可以通过 ScriptMCP 调用以下工具管理脚本：
          <code>script_create</code>、<code>script_write</code>、<code>script_save</code>、
          <code>script_delete</code>、<code>script_remove</code>、<code>script_list</code>、<code>script_use</code>
        </div>
      </div>

      ${scripts.length === 0 ? `
        <div class="empty-state">
          <div class="empty-state-icon">▣</div>
          <div class="empty-state-title">${t('common.empty')}</div>
          <div class="text-sm text-muted">${t('script.create')}</div>
        </div>
      ` : `
        <div class="grid grid-2" id="scripts-list">
          ${scripts.map(s => this.renderScriptCard(s)).join('')}
        </div>
      `}
    `;

    document.getElementById('createScriptBtn')?.addEventListener('click', () => this.showCreateModal());
    content.querySelectorAll('.script-edit').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).getAttribute('data-id');
        if (id) this.showEditModal(id);
      });
    });
    content.querySelectorAll('.script-delete').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).getAttribute('data-id');
        if (id && confirm(t('script.deleteConfirm'))) this.deleteScript(id);
      });
    });
    content.querySelectorAll('.script-run').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).getAttribute('data-id');
        if (id) this.runScript(id);
      });
    });
  }

  private renderScriptCard(s: Script) {
    return `
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">${this.escapeHtml(s.name)}</div>
            <div class="card-subtitle">${this.escapeHtml(s.description || '')}</div>
          </div>
          <span class="badge badge-sage">${s.language}</span>
        </div>
        <pre class="code-body" style="margin-bottom:16px"><code>${this.escapeHtml(s.code.slice(0, 200))}${s.code.length > 200 ? '...' : ''}</code></pre>
        <div class="flex gap-2" style="justify-content:flex-end">
          <button class="btn btn-sm btn-secondary script-run" data-id="${s.id}">▶ ${t('script.execute')}</button>
          <button class="btn btn-sm btn-ghost script-edit" data-id="${s.id}">${t('common.edit')}</button>
          <button class="btn btn-sm btn-ghost script-delete" data-id="${s.id}">${t('common.delete')}</button>
        </div>
        <div class="script-result mt-3" id="result-${s.id}" style="display:none"></div>
      </div>
    `;
  }

  private showCreateModal() {
    this.showModal('');
  }

  private async showEditModal(id: string) {
    const script = await this.api.getScript(id);
    this.showModal(script);
  }

  private showModal(script: Script | '') {
    const isEdit = typeof script === 'object';
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width:680px">
        <div class="modal-header">
          <div class="modal-title">${isEdit ? t('common.edit') : t('script.create')}</div>
          <button class="modal-close" id="closeModal">×</button>
        </div>
        <div class="form-group">
          <label class="form-label">${t('script.name')}</label>
          <input type="text" class="input" id="scriptName" value="${isEdit ? this.escapeHtml(script.name) : ''}" ${isEdit ? 'disabled' : ''}>
        </div>
        <div class="form-group">
          <label class="form-label">${t('script.description')}</label>
          <input type="text" class="input" id="scriptDesc" value="${isEdit ? this.escapeHtml(script.description) : ''}">
        </div>
        <div class="form-group">
          <label class="form-label">${t('script.language')}</label>
          <select class="select" id="scriptLang">
            <option value="javascript" ${isEdit && script.language === 'javascript' ? 'selected' : ''}>JavaScript</option>
            <option value="typescript" ${isEdit && script.language === 'typescript' ? 'selected' : ''}>TypeScript</option>
            <option value="python" ${isEdit && script.language === 'python' ? 'selected' : ''}>Python</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">${t('script.code')}</label>
          <textarea class="textarea" id="scriptCode" rows="12">${isEdit ? this.escapeHtml(script.code) : ''}</textarea>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="cancelModal">${t('common.cancel')}</button>
          <button class="btn btn-primary" id="saveScript">${t('common.save')}</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    document.getElementById('closeModal')?.addEventListener('click', close);
    document.getElementById('cancelModal')?.addEventListener('click', close);

    document.getElementById('saveScript')?.addEventListener('click', async () => {
      const name = (document.getElementById('scriptName') as HTMLInputElement).value;
      const description = (document.getElementById('scriptDesc') as HTMLInputElement).value;
      const language = (document.getElementById('scriptLang') as HTMLSelectElement).value as any;
      const code = (document.getElementById('scriptCode') as HTMLTextAreaElement).value;

      try {
        if (isEdit) {
          await this.api.updateScript(script.id, { description, language, code });
        } else {
          await this.api.createScript({ name, description, language, code });
        }
        close();
        await this.render();
      } catch (err: any) {
        alert(err.message || '保存失败');
      }
    });
  }

  private async deleteScript(id: string) {
    await this.api.deleteScript(id);
    await this.render();
  }

  private async runScript(id: string) {
    const resultEl = document.getElementById(`result-${id}`);
    if (!resultEl) return;
    resultEl.style.display = 'block';
    resultEl.innerHTML = `<div class="text-sm text-muted">${t('common.loading')}...</div>`;

    const result = await this.api.executeScript(id, { example: true });
    resultEl.innerHTML = this.renderResult(result);
  }

  private renderResult(result: ScriptExecutionResult): string {
    const status = result.success
      ? `<span class="badge badge-sage">OK</span>`
      : `<span class="badge badge-rose">Error</span>`;
    return `
      <div class="card" style="background:var(--ord-bg-sunken);padding:12px">
        <div class="flex justify-between items-center mb-2">
          <span class="text-sm fw-600">${t('script.execute')} ${status}</span>
          <span class="text-xs text-muted">${result.duration}ms</span>
        </div>
        ${result.error ? `<pre class="code-body" style="background:var(--ord-rose-soft);color:var(--ord-rose)"><code>${this.escapeHtml(result.error)}</code></pre>` : ''}
        ${result.output !== undefined ? `<pre class="code-body"><code>${this.escapeHtml(typeof result.output === 'string' ? result.output : JSON.stringify(result.output, null, 2))}</code></pre>` : ''}
        ${result.logs.length > 0 ? `<div class="text-xs text-muted mt-2">${result.logs.map(l => `<div>${this.escapeHtml(l)}</div>`).join('')}</div>` : ''}
      </div>
    `;
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
