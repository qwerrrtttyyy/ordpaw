import type { Conversation, Message } from '@ordpaw/shared';
import { API } from '../api.js';
import { escapeHtml, formatRelativeTime } from '../utils.js';
import { t } from '../i18n';
import { MarkdownRenderer } from '../components/markdown.js';

export class ChatView {
  private shell: HTMLDivElement;
  private messagesEl: HTMLElement | null = null;
  private inputEl: HTMLTextAreaElement | null = null;
  private sendBtn: HTMLElement | null = null;
  private statusEl: HTMLElement | null = null;
  private conversation!: Conversation;
  private api: API;
  private conversationId: string;
  private streaming = false;
  private assistantRenderers = new Map<string, { render: (text: string) => void }>();
  private assistantContents = new Map<string, string>();

  constructor(api: API, conversationId: string) {
    this.api = api;
    this.conversationId = conversationId;
    this.shell = document.createElement('div');
  }

  async init(container: HTMLElement): Promise<void> {
    this.conversation = await this.api.getConversation(this.conversationId);

    this.shell.className = 'chat-shell slide-up';
    this.shell.innerHTML = `
      <div class="chat-header">
        <button class="chat-back-btn" id="chatBackBtn">← ${t('chat.back')}</button>
        <div class="chat-header-title">
          <div class="chat-title">${escapeHtml(this.conversation.title || t('chat.title'))}</div>
          <div class="chat-status" id="chatStatus">${t('chat.empty')}</div>
        </div>
        <div class="chat-header-spacer"></div>
      </div>
      <div class="chat-messages" id="chatMessages"></div>
      <div class="chat-composer">
        <textarea class="chat-input" id="chatInput" rows="1" placeholder="${t('chat.cutePlaceholder') || t('chat.placeholder')}"></textarea>
        <button class="chat-send-btn" id="chatSendBtn">${t('chat.send')}</button>
      </div>
    `;

    container.appendChild(this.shell);
    this.messagesEl = this.shell.querySelector('#chatMessages');
    this.inputEl = this.shell.querySelector('#chatInput');
    this.sendBtn = this.shell.querySelector('#chatSendBtn');
    this.statusEl = this.shell.querySelector('#chatStatus');

    // Back button
    this.shell.querySelector('#chatBackBtn')?.addEventListener('click', () => {
      window.history.back();
    });

    // Auto-resize textarea
    this.inputEl?.addEventListener('input', () => this.autoResizeInput());
    this.inputEl?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.handleSend();
      }
    });

    this.sendBtn?.addEventListener('click', () => this.handleSend());

    // Load messages
    this.renderMessages(this.conversation.messages || []);
    this.setupWebSocket();
  }

  private setupWebSocket(): void {
    const ws = window.__ordpaw?.ws;
    if (!ws) return;

    const messageHandler = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'chat:stream' && msg.payload?.conversationId === this.conversationId) {
          this.handleStreamChunk(msg.payload);
        } else if (msg.type === 'chat:done' && msg.payload?.conversationId === this.conversationId) {
          this.handleStreamDone(msg.payload);
        } else if (msg.type === 'error' && msg.payload?.conversationId === this.conversationId) {
          this.handleStreamError(msg.payload);
        }
      } catch { /* ignore */ }
    };

    ws.addEventListener('message', messageHandler);

    // Store cleanup reference
    (this.shell as any)._wsCleanup = () => {
      ws.removeEventListener('message', messageHandler);
    };
  }

  private handleStreamChunk(payload: any): void {
    const { messageId, chunk } = payload;
    const existing = this.assistantContents.get(messageId) || '';
    this.assistantContents.set(messageId, existing + chunk);

    const renderer = this.assistantRenderers.get(messageId);
    if (renderer) {
      renderer.render(this.assistantContents.get(messageId)! + '▍');
    }

    if (this.statusEl) {
      this.statusEl.textContent = t('chat.streaming');
    }
  }

  private handleStreamDone(payload: any): void {
    const { messageId } = payload;
    const renderer = this.assistantRenderers.get(messageId);
    if (renderer) {
      const fullText = this.assistantContents.get(messageId) || '';
      renderer.render(fullText);
    }
    this.assistantRenderers.delete(messageId);
    this.streaming = false;
    if (this.statusEl) {
      this.statusEl.textContent = `${this.conversation.messages?.length || 0} 条消息`;
    }
  }

  private handleStreamError(payload: any): void {
    const { messageId, error } = payload;
    const renderer = this.assistantRenderers.get(messageId);
    if (renderer) {
      renderer.render(`**错误:** ${escapeHtml(error || '未知错误')}`);
    }
    this.assistantRenderers.delete(messageId);
    this.streaming = false;
    if (this.statusEl) {
      this.statusEl.textContent = '发送失败';
    }
  }

  private renderMessages(messages: Message[]) {
    if (!this.messagesEl) return;
    this.messagesEl.innerHTML = '';
    this.assistantRenderers.clear();
    this.assistantContents.clear();

    if (!messages.length) {
      this.messagesEl.innerHTML = `
        <div class="chat-empty-state">
          <div class="chat-empty-paw">🐾</div>
          <div class="text-sm text-muted">${t('chat.cuteEmpty') || '喵~ 说点什么吧 ✨'}</div>
        </div>
      `;
      return;
    }

    messages.forEach((msg) => this.appendMessageBubble(msg));
    this.scrollToBottom();
  }

  private appendMessageBubble(msg: Message) {
    if (!this.messagesEl) return;
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble chat-bubble-${msg.role}`;

    const meta = document.createElement('div');
    meta.className = 'chat-bubble-meta';
    meta.textContent = `${msg.role === 'user' ? '你' : msg.role === 'assistant' ? 'AI' : msg.role} · ${formatRelativeTime(msg.timestamp)}`;
    bubble.appendChild(meta);

    const body = document.createElement('div');
    body.className = 'chat-bubble-body';
    bubble.appendChild(body);

    const text = document.createElement('div');
    text.className = 'chat-bubble-text';

    if (msg.role === 'assistant') {
      this.assistantContents.set(msg.id, msg.content);
      const renderContainer = document.createElement('div');
      renderContainer.className = 'chat-bubble-text';
      body.appendChild(renderContainer);
      const renderer = new MarkdownRenderer(renderContainer);
      renderer.render(msg.content);

      // Store for potential streaming updates
      this.assistantRenderers.set(msg.id, {
        render: (newText: string) => {
          renderer.render(newText);
        }
      });
    } else {
      text.innerHTML = `<p>${escapeHtml(msg.content)}</p>`;
      body.appendChild(text);
    }

    this.messagesEl.appendChild(bubble);
  }

  private async handleSend() {
    if (!this.inputEl || this.streaming) return;
    const content = this.inputEl.value.trim();
    if (!content) return;

    this.inputEl.value = '';
    this.autoResizeInput();

    if (this.sendBtn) {
      this.sendBtn.classList.add('sparkling');
      setTimeout(() => this.sendBtn?.classList.remove('sparkling'), 800);
    }

    // Optimistic render
    const userMsg: Message = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content,
      timestamp: Date.now(),
    };
    this.appendMessageBubble(userMsg);

    // Add empty assistant bubble
    const assistantId = `assistant-${Date.now()}`;
    const assistantMsg: Message = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    };
    this.appendMessageBubble(assistantMsg);
    this.streaming = true;

    if (this.statusEl) {
      this.statusEl.textContent = t('chat.streaming');
    }

    // Try WebSocket first
    const ws = window.__ordpaw?.ws;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'chat:message',
        payload: { conversationId: this.conversationId, content }
      }));
    } else {
      // REST fallback
      try {
        const result = await this.api.sendMessage(this.conversationId, content);
        const renderer = this.assistantRenderers.get(assistantId);
        if (renderer && result?.content) {
          renderer.render(result.content);
        }
      } catch (err: any) {
        const renderer = this.assistantRenderers.get(assistantId);
        if (renderer) {
          renderer.render(`**错误:** ${escapeHtml(err.message)}`);
        }
      }
      this.streaming = false;
      if (this.statusEl) {
        this.statusEl.textContent = `${this.conversation.messages?.length || 0} 条消息`;
      }
    }
  }

  private scrollToBottom() {
    if (this.messagesEl) {
      this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    }
  }

  private autoResizeInput() {
    if (this.inputEl) {
      this.inputEl.style.height = 'auto';
      this.inputEl.style.height = Math.min(this.inputEl.scrollHeight, 200) + 'px';
    }
  }

  destroy() {
    const cleanup = (this.shell as any)._wsCleanup;
    if (cleanup) cleanup();
    this.shell.remove();
  }
}