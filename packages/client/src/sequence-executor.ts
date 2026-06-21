/**
 * 前端自动操作序列执行器
 * 接收后端通过 WebSocket 推送的操作序列并执行
 */

import type { Operation, OperationSequence, OperationResult, OperationType } from '@ordpaw/shared';
import { animationManager } from './animation-manager';

interface ExecutionState {
  sequenceId: string;
  currentIndex: number;
  operations: Operation[];
  results: Map<string, OperationResult>;
  status: 'idle' | 'running' | 'paused' | 'waiting_confirmation';
}

export class SequenceExecutor {
  private ws: WebSocket | null = null;
  private executionStates = new Map<string, ExecutionState>();
  private actionHandlers: Map<OperationType, (params: any) => Promise<any>>;
  private router: { navigate: (route: string) => void };
  private store: { getSettings: () => any; setSettings: (settings: any) => void };

  constructor(
    router: { navigate: (route: string) => void },
    store: { getSettings: () => any; setSettings: (settings: any) => void }
  ) {
    this.router = router;
    this.store = store;
    this.actionHandlers = this.initActionHandlers();
  }

  /** 连接 WebSocket */
  connect(ws: WebSocket) {
    this.ws = ws;
    this.setupMessageHandlers();
  }

  /** 设置消息处理器 */
  private setupMessageHandlers() {
    if (!this.ws) return;

    this.ws.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(event.data);

        switch (message.type) {
          case 'sequence:start':
            this.handleSequenceStart(message.payload);
            break;
          case 'sequence:execute':
            this.handleOperationExecute(message.payload);
            break;
          case 'sequence:complete':
            this.handleSequenceComplete(message.payload);
            break;
          case 'sequence:progress':
            this.handleSequenceProgress(message.payload);
            break;
        }
      } catch (error) {
        console.error('[SequenceExecutor] 消息解析失败:', error);
      }
    });
  }

  /** 处理序列开始 */
  private handleSequenceStart(payload: { sequence: OperationSequence; estimatedDuration?: number }) {
    const { sequence } = payload;

    console.log(`[SequenceExecutor] 开始执行序列: ${sequence.id}`);

    this.executionStates.set(sequence.id, {
      sequenceId: sequence.id,
      currentIndex: 0,
      operations: sequence.operations,
      results: new Map(),
      status: 'running',
    });

    this.sendProgress(sequence.id, 0, sequence.operations.length, 'running');
  }

  /** 处理操作执行 */
  private async handleOperationExecute(payload: {
    operation: Operation;
    sequenceId: string;
    operationIndex: number;
    totalOperations: number;
  }) {
    const { operation, sequenceId, operationIndex, totalOperations } = payload;

    const state = this.executionStates.get(sequenceId);
    if (!state) {
      console.warn(`[SequenceExecutor] 未找到序列状态: ${sequenceId}`);
      return;
    }

    console.log(`[SequenceExecutor] 执行操作 ${operationIndex + 1}/${totalOperations}: ${operation.type}`);

    try {
      const startTime = performance.now();
      const handler = this.actionHandlers.get(operation.type);

      if (!handler) {
        throw new Error(`不支持的操作类型: ${operation.type}`);
      }

      const result = await this.executeWithRetry(operation, handler);
      const duration = performance.now() - startTime;

      this.sendOperationResult(sequenceId, operation.id, 'success', duration, result);

      state.results.set(operation.id, {
        operationId: operation.id,
        sequenceId,
        status: 'success',
        duration,
        result,
      });
    } catch (error) {
      console.error(`[SequenceExecutor] 操作执行失败: ${operation.id}`, error);

      this.sendOperationResult(sequenceId, operation.id, 'failed', 0, undefined, (error as Error).message);

      state.results.set(operation.id, {
        operationId: operation.id,
        sequenceId,
        status: 'failed',
        duration: 0,
        error: (error as Error).message,
      });
    }

    state.currentIndex = operationIndex + 1;
  }

  /** 带重试执行 */
  private async executeWithRetry(
    operation: Operation,
    handler: (params: any) => Promise<any>
  ): Promise<any> {
    const maxRetries = operation.retryPolicy?.maxRetries || 0;
    const backoffMs = operation.retryPolicy?.backoffMs || 1000;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.executeWithTimeout(operation, handler);
      } catch (error) {
        if (attempt === maxRetries) throw error;
        console.log(`[SequenceExecutor] 操作重试 ${attempt + 1}/${maxRetries}`);
        await this.sleep(backoffMs * Math.pow(2, attempt));
      }
    }
  }

  /** 带超时执行 */
  private async executeWithTimeout(
    operation: Operation,
    handler: (params: any) => Promise<any>
  ): Promise<any> {
    const timeout = operation.timeout || 5000;

    return Promise.race([
      handler(operation.params),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('操作超时')), timeout)
      ),
    ]);
  }

  /** 初始化操作处理器 */
  private initActionHandlers(): Map<OperationType, (params: any) => Promise<any>> {
    const handlers = new Map<OperationType, (params: any) => Promise<any>>();

    // UI 点击
    handlers.set('ui:click', async (params: { selector: string; waitFor?: number; simulateHover?: boolean }) => {
      const element = await this.waitForElement(params.selector, params.waitFor);
      if (!element) throw new Error(`未找到元素: ${params.selector}`);

      if (params.simulateHover) {
        element.classList.add('hover-simulation');
        await this.sleep(300);
        element.classList.remove('hover-simulation');
      }

      (element as HTMLElement).click();
      return { clicked: true };
    });

    // 路由导航
    handlers.set('ui:navigate', async (params: { route: string; transition?: 'fade' | 'slide' | 'none' }) => {
      this.router.navigate(params.route);
      if (params.transition && params.transition !== 'none') {
        const app = document.getElementById('app');
        if (app) {
          app.classList.add(`transition-${params.transition}`);
          await this.sleep(300);
          app.classList.remove(`transition-${params.transition}`);
        }
      }
      return { navigated: params.route };
    });

    // 主题切换
    handlers.set('ui:theme', async (params: { theme: string; animate?: boolean }) => {
      const currentTheme = this.store.getSettings().theme;
      const settings = this.store.getSettings();
      this.store.setSettings({ ...settings, theme: params.theme });

      if (params.animate) {
        const app = document.getElementById('app');
        if (app) {
          app.style.transition = 'opacity 0.3s ease';
          app.style.opacity = '0.5';
          await this.sleep(300);
          app.style.opacity = '1';
          await this.sleep(300);
          app.style.transition = '';
        }
      }

      return { from: currentTheme, to: params.theme };
    });

    // 输入填充
    handlers.set('ui:input', async (params: {
      selector: string;
      value: string;
      clearFirst?: boolean;
      simulateTyping?: boolean;
      typingSpeed?: number;
    }) => {
      const element = await this.waitForElement(params.selector) as HTMLInputElement;
      if (!element) throw new Error(`未找到元素: ${params.selector}`);

      if (params.clearFirst) {
        element.value = '';
      }

      if (params.simulateTyping) {
        const speed = params.typingSpeed || 50;
        for (const char of params.value) {
          element.value += char;
          element.dispatchEvent(new Event('input', { bubbles: true }));
          await this.sleep(speed);
        }
      } else {
        element.value = params.value;
        element.dispatchEvent(new Event('input', { bubbles: true }));
      }

      return { input: params.value };
    });

    // 滚动
    handlers.set('ui:scroll', async (params: {
      selector?: string;
      position: 'top' | 'bottom' | number;
      smooth?: boolean;
    }) => {
      const target = params.selector
        ? document.querySelector(params.selector)
        : window;

      const position = params.position === 'top' ? 0
        : params.position === 'bottom' ? document.body.scrollHeight
        : params.position;

      if (target === window) {
        window.scrollTo({
          top: position,
          behavior: params.smooth ? 'smooth' : 'auto',
        });
      } else {
        (target as HTMLElement).scrollTop = position;
      }

      return { scrolled: position };
    });

    // 高亮显示
    handlers.set('ui:highlight', async (params: {
      selector: string;
      duration?: number;
      style?: 'pulse' | 'glow' | 'border';
      color?: string;
    }) => {
      const element = await this.waitForElement(params.selector) as HTMLElement;
      if (!element) throw new Error(`未找到元素: ${params.selector}`);

      const duration = params.duration || 2000;
      const className = `highlight-${params.style || 'pulse'}`;

      element.classList.add(className);
      if (params.color) {
        element.style.setProperty('--highlight-color', params.color);
      }

      await this.sleep(duration);
      element.classList.remove(className);

      return { highlighted: params.selector };
    });

    // 发送聊天消息
    handlers.set('chat:send', async (params: {
      conversationId: string;
      content: string;
      waitForResponse?: boolean;
    }) => {
      if (!this.ws) throw new Error('WebSocket 未连接');

      this.ws.send(JSON.stringify({
        type: 'chat:message',
        payload: {
          conversationId: params.conversationId,
          content: params.content,
        },
      }));

      if (params.waitForResponse) {
        await this.sleep(1000);
      }

      return { sent: true };
    });

    // 播放动画
    handlers.set('animation:play', async (params: {
      animation: 'fadeIn' | 'fadeOut' | 'slideIn';
      target?: string;
      duration?: number;
    }) => {
      const target = params.target
        ? document.querySelector(params.target) as HTMLElement
        : document.getElementById('app');

      if (!target) throw new Error(`未找到目标: ${params.target}`);

      const duration = params.duration || 300;

      switch (params.animation) {
        case 'fadeIn':
          await animationManager.fadeIn(target, duration);
          break;
        case 'fadeOut':
          await animationManager.fadeOut(target, duration);
          break;
        case 'slideIn':
          await animationManager.slideIn(target, 'up', duration);
          break;
      }

      return { played: params.animation };
    });

    // 显示通知
    handlers.set('notification:show', async (params: {
      type: 'info' | 'success' | 'warning' | 'error';
      title: string;
      message: string;
      duration?: number;
      dismissible?: boolean;
    }) => {
      const notification = document.createElement('div');
      notification.className = `notification notification-${params.type}`;
      notification.innerHTML = `
        <div class="notification-title">${params.title}</div>
        <div class="notification-message">${params.message}</div>
      `;

      if (params.dismissible) {
        const closeBtn = document.createElement('button');
        closeBtn.className = 'notification-close';
        closeBtn.innerHTML = '×';
        closeBtn.onclick = () => notification.remove();
        notification.appendChild(closeBtn);
      }

      document.body.appendChild(notification);
      await animationManager.fadeIn(notification, 300);

      if (params.duration) {
        await this.sleep(params.duration);
        await animationManager.fadeOut(notification, 300);
        notification.remove();
      }

      return { shown: true };
    });

    return handlers;
  }

  /** 等待元素出现 */
  private async waitForElement(selector: string, timeout = 1000): Promise<Element | null> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const element = document.querySelector(selector);
      if (element) return element;
      await this.sleep(100);
    }

    return document.querySelector(selector);
  }

  /** 发送操作结果 */
  private sendOperationResult(
    sequenceId: string,
    operationId: string,
    status: 'success' | 'failed' | 'skipped' | 'timeout',
    duration: number,
    result?: any,
    error?: string
  ) {
    if (!this.ws) return;

    this.ws.send(JSON.stringify({
      type: 'operation:result',
      payload: {
        operationId,
        sequenceId,
        status,
        duration,
        result,
        error,
      },
      sequenceId,
      operationId,
      timestamp: Date.now(),
    }));
  }

  /** 发送进度 */
  private sendProgress(
    sequenceId: string,
    current: number,
    total: number,
    status: string
  ) {
    if (!this.ws) return;

    const state = this.executionStates.get(sequenceId);
    this.ws.send(JSON.stringify({
      type: 'sequence:progress',
      payload: {
        sequenceId,
        current,
        total,
        currentOperationId: state?.operations[current]?.id,
        status,
      },
      sequenceId,
      timestamp: Date.now(),
    }));
  }

  /** 处理序列完成 */
  private handleSequenceComplete(payload: { sequenceId: string; summary: any }) {
    const { sequenceId, summary } = payload;
    console.log(`[SequenceExecutor] 序列完成: ${sequenceId}`, summary);
    this.executionStates.delete(sequenceId);
  }

  /** 处理序列进度 */
  private handleSequenceProgress(payload: { sequenceId: string; status: string }) {
    const { sequenceId, status } = payload;
    const state = this.executionStates.get(sequenceId);
    if (state) {
      state.status = status as any;
    }
  }

  /** 休眠 */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
