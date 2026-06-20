import { WebSocketServer, WebSocket } from 'ws';
import { agentRuntime } from '../core/agent-runtime.js';
import { eventBus } from '../core/event-bus.js';

const clientDebugHandlers = new WeakMap<WebSocket, Set<(payload: any) => void>>();

export function setupWebSocket(wss: WebSocketServer) {
  wss.on('connection', (ws: WebSocket) => {
    console.log('🔌 WebSocket 客户端已连接');

    const debugHandlers = new Set<(payload: any) => void>();
    const eventHandlers = new Set<(payload: any) => void>();
    const checkpointHandlers = new Set<(payload: any) => void>();
    clientDebugHandlers.set(ws, debugHandlers);

    ws.on('message', async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());

        if (message.type === 'chat:message') {
          const { conversationId, content } = message.payload || {};

          if (!conversationId || !content) {
            sendError(ws, '缺少 conversationId 或 content');
            return;
          }

          // 发送开始事件
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'chat:start',
              payload: { conversationId }
            }));
          }

          // 处理消息
          const response = await agentRuntime.processMessage(conversationId, content);

          if (!response) {
            sendError(ws, '会话不存在');
            return;
          }

          // 流式响应（模拟）
          try {
            const words = response.content.split(' ');
            for (let i = 0; i < words.length; i++) {
              if (ws.readyState !== WebSocket.OPEN) break;
              await new Promise(resolve => setTimeout(resolve, 50));
              ws.send(JSON.stringify({
                type: 'chat:stream',
                payload: {
                  conversationId,
                  chunk: words[i] + ' ',
                  done: i === words.length - 1
                }
              }));
            }
          } catch (streamErr: any) {
            console.error('流式发送错误:', streamErr);
          }

          // 发送完成事件
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'chat:done',
              payload: { conversationId, message: response }
            }));
          }
        } else if (message.type === 'ping') {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'pong', payload: { timestamp: Date.now() } }));
          }
        }
      } catch (error: any) {
        console.error('WebSocket 消息处理错误:', error);
        sendError(ws, error.message || '消息处理失败');
      }
    });

    ws.on('close', () => {
      console.log('🔌 WebSocket 客户端已断开');
      // 清理 handler 引用
      debugHandlers.clear();
      eventHandlers.clear();
      checkpointHandlers.clear();
    });

    ws.on('error', (err) => {
      console.error('WebSocket 错误:', err);
    });

    // 监听事件总线并推送给客户端
    const debugHandler = (payload: any) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'debug:log', payload }));
      }
    };
    debugHandlers.add(debugHandler);
    eventBus.on('debug:log', debugHandler);

    const eventHandler = (payload: any) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'debug:event', payload }));
      }
    };
    eventHandlers.add(eventHandler);
    eventBus.on('debug:event', eventHandler);

    const checkpointHandler = (payload: any) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'checkpoint:created', payload }));
      }
    };
    checkpointHandlers.add(checkpointHandler);
    eventBus.on('checkpoint:created', checkpointHandler);
  });

  wss.on('error', (err) => {
    console.error('WebSocketServer 错误:', err);
  });
}

function sendError(ws: WebSocket, message: string) {
  try {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'error',
        payload: { message }
      }));
    }
  } catch (err) {
    console.error('发送错误消息失败:', err);
  }
}
