import { spawn, type ChildProcess } from 'child_process';
import WebSocket from 'ws';
import type { McpConfig } from '@ordpaw/shared';

const CONNECTION_TIMEOUT_MS = 10_000;

export interface McpTransport {
  readonly connected: boolean;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  callTool(toolName: string, params: Record<string, unknown>): Promise<unknown>;
}

abstract class BaseTransport implements McpTransport {
  protected _connected = false;

  get connected(): boolean {
    return this._connected;
  }

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;

  async callTool(toolName: string, params: Record<string, unknown>): Promise<unknown> {
    if (!this._connected) {
      throw new Error(`MCP transport not connected`);
    }
    // Full MCP JSON-RPC tool calling is not yet implemented.
    // This stub preserves backward compatibility while the lifecycle is real.
    return { result: `Tool ${toolName} executed`, params };
  }

  protected withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`${label} 超时`)), CONNECTION_TIMEOUT_MS)
      )
    ]);
  }
}

export class StdioTransport extends BaseTransport {
  private process: ChildProcess | null = null;
  private stderrBuffer: string[] = [];

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

        // Give the process a tick to fail immediately (binary missing, etc.)
        setImmediate(() => {
          if (!this.process || this.process.killed) return;
          this.process.removeListener('exit', onExit);
          this._connected = true;
          this.process.once('exit', (code) => {
            this.cleanup();
            console.warn(`MCP stdio process ${this.config.name} exited (code=${code})`);
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
  }
}

export class SseTransport extends BaseTransport {
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
        fetch(this.config.url!, { method: 'GET' })
          .then((res) => {
            if (!res.ok) {
              reject(new Error(`sse transport 连接失败: HTTP ${res.status}`));
              return;
            }
            this._connected = true;
            resolve();
          })
          .catch((err) => reject(new Error(`sse transport 连接失败: ${err.message}`)));
      }),
      'sse 连接'
    );
  }

  async disconnect(): Promise<void> {
    this._connected = false;
  }
}

export class WebSocketTransport extends BaseTransport {
  private ws: WebSocket | null = null;

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
          ws.once('close', () => {
            this.cleanup();
          });
          ws.once('error', (err) => {
            console.warn(`MCP websocket ${this.config.name} error:`, err.message);
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
