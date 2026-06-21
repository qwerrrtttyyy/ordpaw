import { API } from '../api';
import { Store } from '../store';
import { t } from '../i18n';
import { formatRelativeTime } from '../utils';
import type { Agent, Conversation } from '@ordpaw/shared';

export class ConversationsView {
  private api: API;
  private store: Store;

  constructor(api: API, store: Store) {
    this.api = api;
    this.store = store;
  }

  async render() {
    const content = document.getElementById('view-content');
    if (!content) return;

    const conversations = await this.api.getConversations();
    const agents = await this.api.getAgents();
    const locale = this.store.getLocale();

    const navigateToChat = (id: string, trigger?: HTMLElement) => {
      const card = trigger?.closest('.conv-item') as HTMLElement | null;
      if (card) {
        card.classList.add('chat-opening');
        setTimeout(() => {
          window.location.hash = `#/chat/${encodeURIComponent(id)}`;
        }, 260);
      } else {
        window.location.hash = `#/chat/${encodeURIComponent(id)}`;
      }
    };

    content.innerHTML = `
      <div class="slide-up">
        <div class="section-header">
          <div>
            <div class="section-title">${conversations.length} ${t('conversation.title')}</div>
            <div class="text-sm text-muted mt-2">${t('conversation.subtitle') || '管理所有对话，支持检查点回滚'}</div>
          </div>
          <button class="btn btn-primary" id="createConvBtn">
            <span>＋</span>
            <span>${t('app.welcome.newConversation')}</span>
          </button>
        </div>

        ${
          conversations.length === 0
            ? `
          <div class="card">
            <div class="empty-state">
              <div class="empty-state-icon">◈</div>
              <div class="empty-state-title">${t('conversation.empty')}</div>
              <div class="text-sm text-muted mb-4">${t('conversation.emptyHint') || '选择一个 Agent 开始对话'}</div>
              ${
                agents.length > 0
                  ? `
                <button class="btn btn-primary" id="emptyCreateBtn">${t('app.welcome.newConversation')}</button>
              `
                  : `
                <p class="text-sm text-muted">${t('conversation.createAgentFirst') || '先创建 Agent 后才能新建会话'}</p>
              `
              }
            </div>
          </div>
        `
            : `
          <div class="grid grid-2">
            ${conversations
              .map((conv: Conversation) => {
                const agent = agents.find((a) => a.id === conv.agentId);
                return `
                <div class="list-item accent conv-item" data-id="${conv.id}">
                  <div class="list-item-icon">◈</div>
                  <div class="list-item-body">
                    <div class="list-item-title">${conv.title}</div>
                    <div class="list-item-meta">
                      <span class="badge badge-accent badge-dot">${agent?.name || t('conversation.unlinked') || '未关联'}</span>
                      <span>${formatRelativeTime(conv.updatedAt, locale)}</span>
                    </div>
                  </div>
                  <div class="list-item-actions">
                    <button class="btn btn-ghost btn-sm open-btn" data-id="${conv.id}">打开</button>
                    <button class="btn btn-ghost btn-sm delete-btn" data-id="${conv.id}">${t('common.delete')}</button>
                  </div>
                </div>
              `;
              })
              .join('')}
          </div>
        `
        }
      </div>
    `;

    const createHandler = () => this.showCreateModal(agents);
    document.getElementById('createConvBtn')?.addEventListener('click', createHandler);
    document.getElementById('emptyCreateBtn')?.addEventListener('click', createHandler);

    // Click on conversation item to open chat
    content.querySelectorAll('.conv-item').forEach((item) => {
      item.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (
          target.closest('.list-item-actions') ||
          target.closest('.delete-btn') ||
          target.closest('.open-btn')
        )
          return;
        const id = (item as HTMLElement).getAttribute('data-id');
        if (id) navigateToChat(id, target);
      });
    });

    content.querySelectorAll('.open-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const target = e.currentTarget as HTMLElement;
        const id = target.getAttribute('data-id');
        if (id) navigateToChat(id, target);
      });
    });

    content.querySelectorAll('.delete-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = (e.currentTarget as HTMLElement).getAttribute('data-id');
        if (
          id &&
          confirm(t('conversation.deleteConfirm') || '确定删除此会话？所有消息和检查点都将丢失。')
        ) {
          await this.api.deleteConversation(id);
          this.render();
        }
      });
    });
  }

  private showCreateModal(agents: Agent[]) {
    if (agents.length === 0) {
      alert(t('conversation.createAgentFirst') || '请先创建 Agent');
      return;
    }
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <div class="modal-title">${t('app.welcome.newConversation')}</div>
          <button class="modal-close" id="closeBtn">×</button>
        </div>
        <div class="form-group">
          <label class="form-label">${t('conversation.selectAgent')}</label>
          <select class="select" id="agentSelect">
            ${agents.map((a) => `<option value="${a.id}">${a.name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">${t('conversation.titleOptional') || '会话标题（可选）'}</label>
          <input type="text" class="input" id="convTitle" placeholder="${t('conversation.newSession') || '新会话'}">
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="cancelBtn">${t('common.cancel')}</button>
          <button class="btn btn-primary" id="confirmBtn">${t('common.create')}</button>
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
      const title =
        (overlay.querySelector('#convTitle') as HTMLInputElement)?.value ||
        t('conversation.newSession') ||
        '新会话';
      if (agentId) {
        await this.api.createConversation(agentId, title);
        close();
        this.render();
      }
    });
  }
}
