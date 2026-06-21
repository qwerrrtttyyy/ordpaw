import type { McpServer, McpConfig, InstallMcpRequest } from '@ordpaw/shared';
import { v4 as uuidv4 } from 'uuid';
import type { SqlValue } from 'sql.js';
import { getDatabase, saveDatabase } from '../db/index.js';
import { createTransport, type McpTransport } from './mcp-transport.js';
import { createLogger } from './logger.js';

const mcpLogger = createLogger('mcp');

class McpClient {
  private connections: Map<string, { server: McpServer; transport: McpTransport }> = new Map();

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
          connected: false,
          createdAt: row[idx('created_at')] as number,
          updatedAt: row[idx('updated_at')] as number,
        };
        const config = this.toConfig(server);
        this.connections.set(server.name, { server, transport: createTransport(config) });
      }
      mcpLogger.info(`已初始化 (${this.connections.size} 个服务)`);
    } catch (err) {
      mcpLogger.warn('加载 MCP 服务失败:', err);
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
    } catch (err: any) {
      throw new Error(`MCP 服务安装失败: ${err.message}`);
    }

    const server: McpServer = {
      id, name: req.name, transport: req.transport,
      command: req.command, url: req.url, env: req.env || {},
      enabled: true, connected: false, createdAt: now, updatedAt: now,
    };

    const config = this.toConfig(server);
    this.connections.set(server.name, { server, transport: createTransport(config) });

    try {
      await this.connectServer(id);
    } catch {
      // Non-fatal: server is installed but not connected
    }

    return server;
  }

  async connectServer(id: string): Promise<McpServer> {
    const server = this.getServer(id);
    if (!server) throw new Error(`MCP 服务不存在: ${id}`);

    const conn = this.connections.get(server.name);
    if (!conn) throw new Error(`MCP 连接不存在: ${server.name}`);

    if (conn.transport.connected) {
      return { ...server, connected: true };
    }

    try {
      await conn.transport.connect();
      this.updateServerConnectionState(id, true);
      mcpLogger.info(`已连接 ${server.name} (${server.transport})`);
      return { ...this.getServer(id)!, connected: true };
    } catch (err: any) {
      this.updateServerConnectionState(id, false);
      throw new Error(`MCP 连接失败 ${server.name}: ${err.message}`);
    }
  }

  async disconnectServer(id: string): Promise<McpServer> {
    const server = this.getServer(id);
    if (!server) throw new Error(`MCP 服务不存在: ${id}`);

    const conn = this.connections.get(server.name);
    if (conn) {
      try {
        await conn.transport.disconnect();
      } catch (err) {
        mcpLogger.warn(`断开连接时出错 ${server.name}:`, err);
      }
    }

    this.updateServerConnectionState(id, false);
    return { ...this.getServer(id)!, connected: false };
  }

  uninstallServer(id: string): boolean {
    const server = this.getServer(id);
    if (!server) return false;

    const conn = this.connections.get(server.name);
    if (conn) {
      conn.transport.disconnect().catch(() => {});
      this.connections.delete(server.name);
    }

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
    return values.map((row: SqlValue[]) => {
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

  // Legacy API kept for backward compatibility
  async connect(config: McpConfig): Promise<void> {
    const transport = createTransport(config);
    await transport.connect();
    this.connections.set(config.name, { server: this.configToServer(config), transport });
  }

  async disconnect(name: string): Promise<void> {
    const conn = this.connections.get(name);
    if (conn) {
      await conn.transport.disconnect();
      this.connections.delete(name);
    }
  }

  isConnected(name: string): boolean {
    return this.connections.get(name)?.transport.connected || false;
  }

  listConnections(): string[] {
    return Array.from(this.connections.entries())
      .filter(([, conn]) => conn.transport.connected)
      .map(([name]) => name);
  }

  async callTool(name: string, toolName: string, params: any): Promise<any> {
    const conn = this.connections.get(name);
    if (!conn || !conn.transport.connected) {
      throw new Error(`MCP connection not found or not connected: ${name}`);
    }
    return conn.transport.callTool(toolName, params);
  }

  private toConfig(server: McpServer): McpConfig {
    return {
      name: server.name,
      transport: server.transport,
      command: server.command,
      url: server.url,
      env: server.env,
    };
  }

  private configToServer(config: McpConfig): McpServer {
    return {
      id: '',
      name: config.name,
      transport: config.transport,
      command: config.command,
      url: config.url,
      env: config.env || {},
      enabled: true,
      connected: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  private updateServerConnectionState(id: string, connected: boolean): void {
    const db = getDatabase();
    db.run('UPDATE mcp_servers SET connected = ?, updated_at = ? WHERE id = ?', [connected ? 1 : 0, Date.now(), id]);
    saveDatabase();
  }

  private safeJsonParse(val: any, def: any): any {
    if (!val) return def;
    try { return JSON.parse(val); } catch { return def; }
  }
}

export const mcpClient = new McpClient();
