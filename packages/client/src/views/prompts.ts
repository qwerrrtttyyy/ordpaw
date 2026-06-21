import { API } from '../api';
import { Store } from '../store';
import type { PromptTemplate } from '@ordpaw/shared';

export class PromptsView {
  private api: API;

  constructor(api: API, _store: Store) {
    this.api = api;
  }

  async render() {
    const content = document.getElementById('view-content');
    if (!content) return;

    const prompts = await this.api.getPrompts();

    content.innerHTML = `
      <div class="slide-up">
        <div class="section-header">
          <div>
            <div class="section-title">${prompts.length} 个提示词</div>
            <div class="text-sm text-muted mt-2">模板化管理你的提示词，支持变量插值</div>
          </div>
          <button class="btn btn-primary" id="createPromptBtn">
            <span>＋</span>
            <span>新建提示词</span>
          </button>
        </div>

        ${
          prompts.length === 0
            ? `
          <div class="card">
            <div class="empty-state">
              <div class="empty-state-icon">◍</div>
              <div class="empty-state-title">还没有提示词</div>
              <div class="text-sm text-muted">创建可复用的提示词模板</div>
            </div>
          </div>
        `
            : `
          <div class="grid grid-2">
            ${prompts
              .map(
                (p: PromptTemplate) => `
              <div class="card">
                <div class="flex items-start gap-3 mb-4">
                  <div class="list-item-icon violet" style="width: 44px; height: 44px;">◍</div>
                  <div style="flex: 1; min-width: 0;">
                    <div class="list-item-title" style="font-size: 15px;">${p.name}</div>
                    <div class="text-sm text-muted mt-1">${p.category || '通用'}</div>
                  </div>
                </div>
                <div class="card mb-4" style="background: var(--ord-bg-sunken); padding: 12px 14px; border-radius: var(--ord-radius-md);">
                  <div class="font-mono text-sm" style="white-space: pre-wrap; max-height: 100px; overflow: hidden; color: var(--ord-text-secondary);">${this.escapeHtml(p.content)}</div>
                </div>
                <div class="flex gap-2 mb-4">
                  <span class="badge badge-violet badge-dot">v${p.version}</span>
                  <span class="badge badge-dot">${(p.variables || []).length} 变量</span>
                </div>
                <div class="flex gap-2">
                  <button class="btn btn-secondary btn-sm edit-btn" data-id="${p.id}">编辑</button>
                  <button class="btn btn-ghost btn-sm delete-btn" data-id="${p.id}">删除</button>
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

    document.getElementById('createPromptBtn')?.addEventListener('click', () => {
      this.showPromptModal();
    });

    content.querySelectorAll('.edit-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = (e.currentTarget as HTMLElement).getAttribute('data-id');
        const prompt = prompts.find((p: PromptTemplate) => p.id === id);
        if (prompt) this.showPromptModal(prompt);
      });
    });

    content.querySelectorAll('.delete-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = (e.currentTarget as HTMLElement).getAttribute('data-id');
        if (id && confirm('确定删除此提示词？')) {
          await this.api.deletePrompt(id);
          this.render();
        }
      });
    });
  }

  private escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  private showPromptModal(prompt?: PromptTemplate) {
    const isEdit = !!prompt;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <div class="modal-title">${isEdit ? '编辑提示词' : '新建提示词'}</div>
          <button class="modal-close" id="closeBtn">×</button>
        </div>
        <div class="form-group">
          <label class="form-label">名称 *</label>
          <input type="text" class="input" id="promptName" value="${isEdit ? prompt.name : ''}" placeholder="我的提示词">
        </div>
        <div class="form-group">
          <label class="form-label">分类</label>
          <input type="text" class="input" id="promptCategory" value="${isEdit ? prompt.category || '' : '通用'}">
        </div>
        <div class="form-group">
          <label class="form-label">内容（支持 <code>{{变量}}</code> 插值）</label>
          <textarea class="textarea" id="promptContent" style="min-height: 160px;">${isEdit ? this.escapeHtml(prompt.content) : ''}</textarea>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="cancelBtn">取消</button>
          <button class="btn btn-primary" id="confirmBtn">保存</button>
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
      const name = (overlay.querySelector('#promptName') as HTMLInputElement)?.value;
      const category =
        (overlay.querySelector('#promptCategory') as HTMLInputElement)?.value || '通用';
      const content = (overlay.querySelector('#promptContent') as HTMLTextAreaElement)?.value;
      if (!name || !content) {
        alert('请填写名称和内容');
        return;
      }
      if (isEdit) {
        await this.api.updatePrompt(prompt.id, { name, category, content });
      } else {
        await this.api.createPrompt({ name, category, content, variables: [] });
      }
      close();
      this.render();
    });
  }
}
