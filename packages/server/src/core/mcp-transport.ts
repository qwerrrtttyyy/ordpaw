import { spawn, type ChildProcess } from 'child_process';
import WebSocket from 'ws';
import type { McpConfig } from '@ordpaw/shared';
import { createLogger } from './logger.js';

const CONNECTION_TIMEOUT_MS = 10_000;
const REQUEST_TIMEOUT_MS = 30_000;

const mcpLogger = createLogger('mcp');

export interface McpTransport {
  readonly connected: boolean;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  callTool(toolName: string, params: Record<string, unknown>): Promise<unknown>;
}

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

abstract class BaseTransport implements McpTransport {
  protected _connected = false;
  protected requestId = 0;

  get connected(): boolean {
    return this._connected;
  }

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract callTool(toolName: string, params: Record<string, unknown>): Promise<unknown>;

  protected nextId(): number {
    return ++this.requestId;
  }

  protected withTimeout<T>(promise: Promise<T>, label: string, timeoutMs = CONNECTION_TIMEOUT_MS): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`${label} 超时`)), timeoutMs)
      )
    ]);
  }

  protected buildToolCallRequest(toolName: string, params: Record<string, unknown>): JsonRpcRequest {
    return {
      jsonrpc: '2.0',
      id: this.nextId(),
      method: 'tools/call',
      params: { name: toolName, arguments: params }
    };
  }

  protected parseJsonRpcResponse(data: string): JsonRpcResponse | null {
    try {
      const parsed = JSON.parse(data);
      if (parsed.jsonrpc === '2.0' && typeof parsed.id === 'number') {
        return parsed as JsonRpcResponse;
      }
    } catch {
      // not valid JSON-RPC
    }
    return null;
  }

  protected handleResponseError(response: JsonRpcResponse): void {
    if (response.error) {
      throw new Error(`MCP 工具调用失败: ${response.error.message} (code=${response.error.code})`);
    }
  }
}

export class StdioTransport extends BaseTransport {
  private process: ChildProcess | null = null;
  private stderrBuffer: string[] = [];
  private pendingRequests: Map<number, { resolve: (value: unknown) => void; reject: (err: Error) => void }> = new Map();
  private stdoutBuffer = '';

  constructor(private readonly config: McpConfig) {
    super();
  }

  async connect(): Promise<void> {
    if (this._connected || this.process) {
      throw new Error('stdio transport 已连接');
    }
    if (!this.config.command) {
      throw new Error('stdio transport 缺少 command');
    }

    const [cmd, ...args] = this.config.command.trim().split(/\s+/);
    if (!cmd) {
      throw new Error('stdio transport command 无效');
    }

    return this.withTimeout(
      new Promise<void>((resolve, reject) => {
        this.stderrBuffer = [];
        this.stdoutBuffer = '';
        const env = { ...process.env, ...(this.config.env || {}) };
        this.process = spawn(cmd, args, { env, stdio: ['pipe', 'pipe', 'pipe'] });

        const onError = (err: Error) => {
          this.cleanup();
          reject(new Error(`stdio transport 启动失败: ${err.message}`));
        };

        const onExit = (code: number | null) => {
          this.cleanup();
          const stderr = this.stderrBuffer.join('\n').slice(0, 500);
          reject(new Error(`stdio transport 进程退出 (code=${code})${stderr ? ': ' + stderr : ''}`));
        };

        this.process.once('error', onError);
        this.process.once('exit', onExit);

        this.process.stderr?.on('data', (chunk: Buffer) => {
          this.stderrBuffer.push(chunk.toString('utf-8'));
        });

        this.process.stdout?.on('data', (chunk: Buffer) => {
          this.stdoutBuffer += chunk.toString('utf-8');
          this.processStdoutBuffer();
        });

        // Give the process a tick to fail immediately (binary missing, etc.)
        setImmediate(() => {
          if (!this.process || this.process.killed) return;
          this.process.removeListener('exit', onExit);
          this._connected = true;
          this.process.once('exit', (code) => {
            this.cleanup();
            mcpLogger.warn(`stdio process ${this.config.name} exited (code=${code})`);
          });
          resolve();
        });
      }),
      'stdio 连接'
    );
  }

  async disconnect(): Promise<void> {
    this.cleanup();
  }

  async callTool(toolName: string, params: Record<string, unknown>): Promise<unknown> {
    if (!this._connected || !this.process) {
      throw new Error('stdio transport 未连接');
    }

    const request = this.buildToolCallRequest(toolName, params);
    const requestJson = JSON.stringify(request) + '\n';

    return this.withTimeout(
      new Promise<unknown>((resolve, reject) => {
        this.pendingRequests.set(request.id, { resolve, reject });
        this.process!.stdin!.write(requestJson, (err) => {
          if (err) {
            this.pendingRequests.delete(request.id);
            reject(new Error(`stdio 写入失败: ${err.message}`));
          }
        });
      }),
      `工具调用 ${toolName}`,
      REQUEST_TIMEOUT_MS
    );
  }

  private processStdoutBuffer(): void {
    const lines = this.stdoutBuffer.split('\n');
    this.stdoutBuffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;
      const response = this.parseJsonRpcResponse(line);
      if (response) {
        const pending = this.pendingRequests.get(response.id);
        if (pending) {
          this.pendingRequests.delete(response.id);
          try {
            this.handleResponseError(response);
            pending.resolve(response.result);
          } catch (err: any) {
            pending.reject(err);
          }
        }
      }
    }
  }

  private cleanup(): void {
    this._connected = false;
    if (this.process && !this.process.killed) {
      try {
        this.process.kill('SIGTERM');
      } catch {
        // ignore
      }
    }
    this.process = null;
    this.stderrBuffer = [];
    this.stdoutBuffer = '';
    for (const [, { reject }] of this.pendingRequests) {
      reject(new Error('stdio transport 已断开'));
    }
    this.pendingRequests.clear();
  }
}

export class SseTransport extends BaseTransport {
  private abortController: AbortController | null = null;
  private pendingRequests: Map<number, { resolve: (value: unknown) => void; reject: (err: Error) => void }> = new Map();
  private sseEndpoint: string | null = null;

  constructor(private readonly config: McpConfig) {
    super();
  }

  async connect(): Promise<void> {
    if (this._connected) {
      throw new Error('sse transport 已连接');
    }
    if (!this.config.url) {
      throw new Error('sse transport 缺少 url');
    }

    return this.withTimeout(
      new Promise<void>((resolve, reject) => {
        this.abortController = new AbortController();

        fetch(this.config.url!, {
          method: 'GET',
          headers: { 'Accept': 'text/event-stream' },
          signal: this.abortController!.signal
        })
          .then(async (res) => {
            if (!res.ok) {
              reject(new Error(`sse transport 连接失败: HTTP ${res.status}`));
              return;
            }
            if (!res.body) {
              reject(new Error('sse transport 无响应体'));
              return;
            }

            // Extract SSE endpoint from response headers or URL
            this.sseEndpoint = res.headers.get('X-SSE-Endpoint') || this.config.url!.replace(/\/$/, '') + '/messages';

            this._connected = true;
            this.processSseStream(res.body);
            resolve();
          })
          .catch((err) => {
            if (err.name !== 'AbortError') {
              reject(new Error(`sse transport 连接失败: ${err.message}`));
            }
          });
      }),
      'sse 连接'
    );
  }

  async disconnect(): Promise<void> {
    this._connected = false;
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    for (const [, { reject }] of this.pendingRequests) {
      reject(new Error('sse transport 已断开'));
    }
    this.pendingRequests.clear();
  }

  async callTool(toolName: string, params: Record<string, unknown>): Promise<unknown> {
    if (!this._connected || !this.sseEndpoint) {
      throw new Error('sse transport 未连接');
    }

    const request = this.buildToolCallRequest(toolName, params);

    return this.withTimeout(
      new Promise<unknown>((resolve, reject) => {
        this.pendingRequests.set(request.id, { resolve, reject });

        fetch(this.sseEndpoint!, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request)
        })
          .then(async (res) => {
            if (!res.ok) {
              this.pendingRequests.delete(request.id);
              reject(new Error(`sse POST 失败: HTTP ${res.status}`));
            }
            // Response will come via SSE stream
          })
          .catch((err) => {
            this.pendingRequests.delete(request.id);
            reject(new Error(`sse POST 失败: ${err.message}`));
          });
      }),
      `工具调用 ${toolName}`,
      REQUEST_TIMEOUT_MS
    );
  }

  private async processSseStream(body: ReadableStream<Uint8Array>): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';

        for (const event of events) {
          if (!event.trim()) continue;
          const lines = event.split('\n');
          let data = '';
          for (const line of lines) {
            if (line.startsWith('data:')) {
              data += line.slice(5).trim();
            }
          }
          if (data) {
            const response = this.parseJsonRpcResponse(data);
            if (response) {
              const pending = this.pendingRequests.get(response.id);
              if (pending) {
                this.pendingRequests.delete(response.id);
                try {
                  this.handleResponseError(response);
                  pending.resolve(response.result);
                } catch (err: any) {
                  pending.reject(err);
                }
              }
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        mcpLogger.error('SSE 流处理错误:', err);
      }
    }
  }
}

export class WebSocketTransport extends BaseTransport {
  private ws: WebSocket | null = null;
  private pendingRequests: Map<number, { resolve: (value: unknown) => void; reject: (err: Error) => void }> = new Map();

  constructor(private readonly config: McpConfig) {
    super();
  }

  async connect(): Promise<void> {
    if (this._connected || this.ws) {
      throw new Error('websocket transport 已连接');
    }
    if (!this.config.url) {
      throw new Error('websocket transport 缺少 url');
    }

    return this.withTimeout(
      new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(this.config.url!);
        this.ws = ws;

        const onOpen = () => {
          this._connected = true;
          cleanupListeners();
          ws.on('message', (data) => {
            const text = data.toString();
            const response = this.parseJsonRpcResponse(text);
            if (response) {
              const pending = this.pendingRequests.get(response.id);
              if (pending) {
                this.pendingRequests.delete(response.id);
                try {
                  this.handleResponseError(response);
                  pending.resolve(response.result);
                } catch (err: any) {
                  pending.reject(err);
                }
              }
            }
          });
          ws.once('close', () => {
            this.cleanup();
          });
          ws.once('error', (err) => {
            mcpLogger.warn(`websocket ${this.config.name} error:`, err.message);
            this.cleanup();
          });
          resolve();
        };

        const onError = (err: Error) => {
          this.cleanup();
          reject(new Error(`websocket transport 连接失败: ${err.message}`));
        };

        const onClose = () => {
          this.cleanup();
          reject(new Error('websocket transport 连接被关闭'));
        };

        const cleanupListeners = () => {
          ws.off('open', onOpen);
          ws.off('error', onError);
          ws.off('close', onClose);
        };

        ws.once('open', onOpen);
        ws.once('error', onError);
        ws.once('close', onClose);
      }),
      'websocket 连接'
    );
  }

  async disconnect(): Promise<void> {
    this.cleanup();
  }

  async callTool(toolName: string, params: Record<string, unknown>): Promise<unknown> {
    if (!this._connected || !this.ws) {
      throw new Error('websocket transport 未连接');
    }

    const request = this.buildToolCallRequest(toolName, params);

    return this.withTimeout(
      new Promise<unknown>((resolve, reject) => {
        this.pendingRequests.set(request.id, { resolve, reject });
        this.ws!.send(JSON.stringify(request), (err) => {
          if (err) {
            this.pendingRequests.delete(request.id);
            reject(new Error(`websocket 发送失败: ${err.message}`));
          }
        });
      }),
      `工具调用 ${toolName}`,
      REQUEST_TIMEOUT_MS
    );
  }

  private cleanup(): void {
    this._connected = false;
    if (this.ws) {
      try {
        this.ws.terminate();
      } catch {
        // ignore
      }
      this.ws = null;
    }
    for (const [, { reject }] of this.pendingRequests) {
      reject(new Error('websocket transport 已断开'));
    }
    this.pendingRequests.clear();
  }
}

export function createTransport(config: McpConfig): McpTransport {
  switch (config.transport) {
    case 'stdio':
      return new StdioTransport(config);
    case 'sse':
      return new SseTransport(config);
    case 'websocket':
      return new WebSocketTransport(config);
    default:
      throw new Error(`不支持的 MCP transport: ${(config as McpConfig).transport}`);
  }
}
