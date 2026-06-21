import { WebSocketServer, WebSocket } from 'ws';
import { agentRuntime } from '../core/agent-runtime.js';
import { eventBus } from '../core/event-bus.js';

/**
 * Split a string into stream chunks that respect both ASCII word boundaries
 * and CJK character boundaries. CJK characters are streamed one at a time
 * (since they have no spaces), while ASCII words are streamed word-by-word.
 */
function chunkResponse(text: string): string[] {
  const chunks: string[] = [];
  let buffer = '';
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    const isCJK =
      (code >= 0x3000 && code <= 0x30ff) ||  // CJK + Japanese punctuation
      (code >= 0x3400 && code <= 0x9fff) ||  // CJK Unified Ideographs
      (code >= 0xff00 && code <= 0xffef) ||  // Fullwidth
      (code >= 0x4e00 && code <= 0x9fff);    // CJK Unified
    if (isCJK) {
      if (buffer) { chunks.push(buffer); buffer = ''; }
      chunks.push(ch);
    } else if (ch === ' ' || ch === '\n' || ch === '\t') {
      if (buffer) { chunks.push(buffer); buffer = ''; }
      chunks.push(ch);
    } else {
      buffer += ch;
    }
  }
  if (buffer) chunks.push(buffer);
  return chunks.length > 0 ? chunks : [text];
}

/**
 * Group small chunks into batches up to `maxBytes` to reduce the number of
 * WebSocket frames without losing CJK/whitespace boundaries.
 */
function batchChunks(chunks: string[], maxBytes: number): string[] {
  if (chunks.length <= 1) return chunks;
  const batches: string[] = [];
  let current = '';
  let currentBytes = 0;
  for (const chunk of chunks) {
    const chunkBytes = Buffer.byteLength(chunk, 'utf-8');
    if (current && currentBytes + chunkBytes > maxBytes) {
      batches.push(current);
      current = chunk;
      currentBytes = chunkBytes;
    } else {
      current += chunk;
      currentBytes += chunkBytes;
    }
  }
  if (current) batches.push(current);
  return batches;
}

/** Per-connection subscription bookkeeping. */
interface ClientSubscriptions {
  debugHandler: (payload: any) => void;
  eventHandler: (payload: any) => void;
  checkpointHandler: (payload: any) => void;
}

export function setupWebSocket(wss: WebSocketServer) {
  // Track subscriptions per-connection so we can properly off() them on close,
  // fixing the previous memory leak where closures were registered on eventBus
  // forever (relying only on `ws.readyState !== OPEN` to no-op).
  const subscriptions = new WeakMap<WebSocket, ClientSubscriptions>();

  wss.on('connection', (ws: WebSocket) => {
    console.log('🔌 WebSocket 客户端已连接');

    const debugHandler = (payload: any) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'debug:log', payload }));
      }
    };
    const eventHandler = (payload: any) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'debug:event', payload }));
      }
    };
    const checkpointHandler = (payload: any) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'checkpoint:created', payload }));
      }
    };

    eventBus.on('debug:log', debugHandler);
    eventBus.on('debug:event', eventHandler);
    eventBus.on('checkpoint:created', checkpointHandler);

    subscriptions.set(ws, { debugHandler, eventHandler, checkpointHandler });

    ws.on('message', async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());

        if (message.type === 'chat:message') {
          const { conversationId, content } = message.payload || {};

          if (!conversationId || !content) {
            sendError(ws, '缺少 conversationId 或 content');
            return;
          }

          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'chat:start',
              payload: { conversationId }
            }));
          }

          const response = await agentRuntime.processMessage(conversationId, content);

          if (!response) {
            sendError(ws, '会话不存在');
            return;
          }

          // CJK-aware chunked streaming with pacing to avoid long-running tight loops.
          try {
            const chunks = chunkResponse(response.content);
            const batches = batchChunks(chunks, 80);
            for (let i = 0; i < batches.length; i++) {
              if (ws.readyState !== WebSocket.OPEN) break;
              await new Promise(resolve => setTimeout(resolve, 8));
              ws.send(JSON.stringify({
                type: 'chat:stream',
                payload: {
                  conversationId,
                  chunk: batches[i],
                  done: i === batches.length - 1
                }
              }));
            }
          } catch (streamErr: any) {
            console.error('流式发送错误:', streamErr);
          }

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
      // Properly unsubscribe from eventBus — fixes the prior leak.
      const subs = subscriptions.get(ws);
      if (subs) {
        eventBus.off('debug:log', subs.debugHandler);
        eventBus.off('debug:event', subs.eventHandler);
        eventBus.off('checkpoint:created', subs.checkpointHandler);
        subscriptions.delete(ws);
      }
    });

    ws.on('error', (err) => {
      console.error('WebSocket 错误:', err);
    });
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
