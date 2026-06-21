import type { McpServer, McpConfig, InstallMcpRequest } from '@ordpaw/shared';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase, saveDatabase } from '../db/index.js';
import { Client } from '@modelcontextprotocol/sdk/client';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse';
import { WebSocketClientTransport } from '@modelcontextprotocol/sdk/client/websocket';

interface ActiveConnection {
  config: McpConfig;
  connected: boolean;
  client?: Client;
  transport?: StdioClientTransport | SSEClientTransport | WebSocketClientTransport;
}

class McpClient {
  private connections: Map<string, ActiveConnection> = new Map();

  init(): void {
    try {
      const db = getDatabase();
      const result = db.exec('SELECT * FROM mcp_servers');
      if (result.length === 0) return;
      const { columns, values } = result[0];
      for (const row of values) {
        const idx = (c: string) => columns.indexOf(c);
        const server: McpServer = {
          id: row[idx('id')] as string,
          name: row[idx('name')] as string,
          transport: row[idx('transport')] as McpServer['transport'],
          command: row[idx('command')] as string | undefined,
          url: row[idx('url')] as string | undefined,
          env: this.safeJsonParse(row[idx('env_json')], {}),
          enabled: row[idx('enabled')] === 1,
          connected: false, // 初始化为未连接，避免进程未启动时误判
          createdAt: row[idx('created_at')] as number,
          updatedAt: row[idx('updated_at')] as number,
        };
        this.connections.set(server.name, {
          config: { name: server.name, transport: server.transport, command: server.command, url: server.url, env: server.env },
          connected: false,
        });
      }
      console.log(`✓ MCPClient 已初始化 (${this.connections.size} 个服务)`);
    } catch (err) {
      console.warn('加载 MCP 服务失败:', err);
    }
  }

  async installServer(req: InstallMcpRequest): Promise<McpServer> {
    if (req.transport === 'stdio' && !req.command) {
      throw new Error('stdio transport 需要提供 command');
    }
    if ((req.transport === 'sse' || req.transport === 'websocket') && !req.url) {
      throw new Error(`${req.transport} transport 需要提供 url`);
    }

    const db = getDatabase();
    const id = uuidv4();
    const now = Date.now();
    const envJson = JSON.stringify(req.env || {});

    try {
      db.run(
        `INSERT INTO mcp_servers (id, name, transport, command, url, env_json, enabled, connected, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, ?)`,
        [id, req.name, req.transport, req.command || null, req.url || null, envJson, now, now]
      );
      saveDatabase();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`MCP 服务安装失败: ${msg}`);
    }

    const server: McpServer = {
      id, name: req.name, transport: req.transport,
      command: req.command, url: req.url, env: req.env || {},
      enabled: true, connected: false, createdAt: now, updatedAt: now,
    };

    this.connections.set(server.name, {
      config: { name: server.name, transport: server.transport, command: server.command, url: server.url, env: server.env },
      connected: false,
    });

    // 安装后尝试自动连接，失败不影响安装结果
    try {
      await this.connectServer(id);
    } catch {
      // 非致命错误
    }

    return server;
  }

  async connectServer(id: string): Promise<McpServer> {
    const server = this.getServer(id);
    if (!server) throw new Error(`MCP 服务不存在: ${id}`);

    const conn = this.connections.get(server.name);
    if (!conn) throw new Error(`MCP 连接不存在: ${server.name}`);

    // 关闭已有连接，避免重复
    if (conn.client) {
      try { await conn.client.close(); } catch { /* ignore */ }
    }

    const transport = this.createTransport(conn.config);
    const client = new Client(
      { name: 'ordpaw-mcp-client', version: '0.0.3' },
      { capabilities: {} }
    );

    await client.connect(transport);

    conn.client = client;
    conn.transport = transport;
    conn.connected = true;

    const db = getDatabase();
    db.run('UPDATE mcp_servers SET connected = 1, updated_at = ? WHERE id = ?', [Date.now(), id]);
    saveDatabase();

    return { ...server, connected: true, updatedAt: Date.now() };
  }

  async disconnectServer(id: string): Promise<McpServer> {
    const server = this.getServer(id);
    if (!server) throw new Error(`MCP 服务不存在: ${id}`);

    const conn = this.connections.get(server.name);
    if (conn?.client) {
      try { await conn.client.close(); } catch { /* ignore */ }
      conn.client = undefined;
      conn.transport = undefined;
    }
    if (conn) conn.connected = false;

    const db = getDatabase();
    db.run('UPDATE mcp_servers SET connected = 0, updated_at = ? WHERE id = ?', [Date.now(), id]);
    saveDatabase();

    return { ...server, connected: false, updatedAt: Date.now() };
  }

  uninstallServer(id: string): boolean {
    const server = this.getServer(id);
    if (!server) return false;

    const conn = this.connections.get(server.name);
    if (conn?.client) {
      conn.client.close().catch(() => {});
    }
    this.connections.delete(server.name);

    const db = getDatabase();
    db.run('DELETE FROM mcp_servers WHERE id = ?', [id]);
    saveDatabase();
    return true;
  }

  listServers(): McpServer[] {
    const db = getDatabase();
    const result = db.exec('SELECT * FROM mcp_servers ORDER BY created_at DESC');
    if (result.length === 0) return [];
    const { columns, values } = result[0];
    return values.map((row: any[]) => {
      const idx = (c: string) => columns.indexOf(c);
      return {
        id: row[idx('id')] as string,
        name: row[idx('name')] as string,
        transport: row[idx('transport')] as McpServer['transport'],
        command: row[idx('command')] as string | undefined,
        url: row[idx('url')] as string | undefined,
        env: this.safeJsonParse(row[idx('env_json')], {}),
        enabled: row[idx('enabled')] === 1,
        connected: row[idx('connected')] === 1,
        createdAt: row[idx('created_at')] as number,
        updatedAt: row[idx('updated_at')] as number,
      };
    });
  }

  getServer(id: string): McpServer | undefined {
    const db = getDatabase();
    const result = db.exec('SELECT * FROM mcp_servers WHERE id = ?', [id]);
    if (result.length === 0) return undefined;
    const { columns, values } = result[0];
    if (values.length === 0) return undefined;
    const row = values[0];
    const idx = (c: string) => columns.indexOf(c);
    return {
      id: row[idx('id')] as string,
      name: row[idx('name')] as string,
      transport: row[idx('transport')] as McpServer['transport'],
      command: row[idx('command')] as string | undefined,
      url: row[idx('url')] as string | undefined,
      env: this.safeJsonParse(row[idx('env_json')], {}),
      enabled: row[idx('enabled')] === 1,
      connected: row[idx('connected')] === 1,
      createdAt: row[idx('created_at')] as number,
      updatedAt: row[idx('updated_at')] as number,
    };
  }

  // 保留旧版 API 以兼容已有代码
  async connect(config: McpConfig): Promise<void> {
    this.connections.set(config.name, { config, connected: true });
  }

  async disconnect(name: string): Promise<void> {
    this.connections.delete(name);
  }

  isConnected(name: string): boolean {
    return this.connections.get(name)?.connected || false;
  }

  listConnections(): string[] {
    return Array.from(this.connections.keys());
  }

  async callTool(name: string, toolName: string, params: any): Promise<any> {
    const conn = this.connections.get(name);
    if (!conn || !conn.connected || !conn.client) {
      throw new Error(`MCP connection not found: ${name}`);
    }
    const raw = await conn.client.callTool({ name: toolName, arguments: params });
    if ('content' in raw) {
      return { result: raw.content };
    }
    return { result: raw.toolResult };
  }

  private createTransport(config: McpConfig): StdioClientTransport | SSEClientTransport | WebSocketClientTransport {
    switch (config.transport) {
      case 'stdio': {
        if (!config.command) throw new Error('stdio transport 需要提供 command');
        const parts = config.command.trim().split(/\s+/).filter(Boolean);
        const command = parts.shift()!;
        return new StdioClientTransport({ command, args: parts, env: config.env });
      }
      case 'sse': {
        if (!config.url) throw new Error('sse transport 需要提供 url');
        return new SSEClientTransport(new URL(config.url));
      }
      case 'websocket': {
        if (!config.url) throw new Error('websocket transport 需要提供 url');
        return new WebSocketClientTransport(new URL(config.url));
      }
      default:
        throw new Error(`不支持的 transport: ${(config as any).transport}`);
    }
  }

  private safeJsonParse(val: any, def: any): any {
    if (!val) return def;
    try { return JSON.parse(val); } catch { return def; }
  }
}

export const mcpClient = new McpClient();
