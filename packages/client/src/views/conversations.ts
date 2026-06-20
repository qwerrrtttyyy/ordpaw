import { API } from '../api';
import { Store } from '../store';

export class ConversationsView {
  private api: API;

  constructor(api: API, _store: Store) {
    this.api = api;
  }

  async render() {
    const content = document.getElementById('view-content');
    if (!content) return;

    const conversations = await this.api.getConversations();
    const agents = await this.api.getAgents();

    content.innerHTML = `
      <div class="slide-up">
        <div class="section-header">
          <div>
            <div class="section-title">${conversations.length} 个会话</div>
            <div class="text-sm text-muted mt-2">管理所有对话，支持检查点回滚</div>
          </div>
          <button class="btn btn-primary" id="createConvBtn">
            <span>＋</span>
            <span>新建会话</span>
          </button>
        </div>

        ${conversations.length === 0 ? `
          <div class="card">
            <div class="empty-state">
              <div class="empty-state-icon">◈</div>
              <div class="empty-state-title">还没有会话</div>
              <div class="text-sm text-muted mb-4">选择一个 Agent 开始对话</div>
              ${agents.length > 0 ? `
                <button class="btn btn-primary" id="emptyCreateBtn">新建会话</button>
              ` : `
                <p class="text-sm text-muted">先创建 Agent 后才能新建会话</p>
              `}
            </div>
          </div>
        ` : `
          <div class="grid grid-2">
            ${conversations.map((conv: any) => {
              const agent = agents.find(a => a.id === conv.agentId);
              return `
                <div class="list-item accent">
                  <div class="list-item-icon">◈</div>
                  <div class="list-item-body">
                    <div class="list-item-title">${conv.title}</div>
                    <div class="list-item-meta">
                      <span class="badge badge-accent badge-dot">${agent?.name || '未关联'}</span>
                      <span>${this.formatTime(conv.updatedAt)}</span>
                    </div>
                  </div>
                  <div class="list-item-actions">
                    <button class="btn btn-ghost btn-sm delete-btn" data-id="${conv.id}">删除</button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `}
      </div>
    `;

    const createHandler = () => this.showCreateModal(agents);
    document.getElementById('createConvBtn')?.addEventListener('click', createHandler);
    document.getElementById('emptyCreateBtn')?.addEventListener('click', createHandler);

    content.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = (e.currentTarget as HTMLElement).getAttribute('data-id');
        if (id && confirm('确定删除此会话？所有消息和检查点都将丢失。')) {
          await this.api.deleteConversation(id);
          this.render();
        }
      });
    });
  }

  private formatTime(ts: number): string {
    const date = new Date(ts);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    if (diff < 60_000) return '刚刚';
    if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
    if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} 小时前`;
    if (diff < 7 * 86400_000) return `${Math.floor(diff / 86400_000)} 天前`;
    return date.toLocaleDateString('zh-CN');
  }

  private showCreateModal(agents: any[]) {
    if (agents.length === 0) {
      alert('请先创建 Agent');
      return;
    }
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <div class="modal-title">新建会话</div>
          <button class="modal-close" id="closeBtn">×</button>
        </div>
        <div class="form-group">
          <label class="form-label">选择 Agent</label>
          <select class="select" id="agentSelect">
            ${agents.map(a => `<option value="${a.id}">${a.name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">会话标题（可选）</label>
          <input type="text" class="input" id="convTitle" placeholder="新会话">
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="cancelBtn">取消</button>
          <button class="btn btn-primary" id="confirmBtn">创建</button>
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
      const agentId = (overlay.querySelector('#agentSelect') as HTMLSelectElement)?.value;
      const title = (overlay.querySelector('#convTitle') as HTMLInputElement)?.value || '新会话';
      if (agentId) {
        await this.api.createConversation(agentId, title);
        close();
        this.render();
      }
    });
  }
}
