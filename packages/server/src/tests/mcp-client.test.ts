import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { McpServer, InstallMcpRequest } from '@ordpaw/shared';

const mockConnect = vi.fn();
const mockClose = vi.fn();
const mockCallTool = vi.fn();

class MockClient {
  connect = mockConnect;
  close = mockClose;
  callTool = mockCallTool;
}

const mockStdioTransport = vi.fn();
const mockSseTransport = vi.fn();
const mockWebsocketTransport = vi.fn();

vi.mock('@modelcontextprotocol/sdk/client', () => ({
  Client: MockClient,
}));

vi.mock('@modelcontextprotocol/sdk/client/stdio', () => ({
  StdioClientTransport: mockStdioTransport,
}));

vi.mock('@modelcontextprotocol/sdk/client/sse', () => ({
  SSEClientTransport: mockSseTransport,
}));

vi.mock('@modelcontextprotocol/sdk/client/websocket', () => ({
  WebSocketClientTransport: mockWebsocketTransport,
}));

const mockSaveDatabase = vi.fn();
let memoryDb: ReturnType<typeof createMemoryDb>;

function createMemoryDb() {
  const mcpServers: McpServer[] = [];

  function exec(sql: string, params: any[] = []) {
    const p = params.map(v => v ?? null);

    if (sql.startsWith('SELECT * FROM mcp_servers WHERE id = ?')) {
      const row = mcpServers.find(s => s.id === p[0]);
      if (!row) return [];
      return [rowToResult([row])];
    }

    if (sql.startsWith('SELECT * FROM mcp_servers ORDER BY created_at DESC')) {
      const sorted = [...mcpServers].sort((a, b) => b.createdAt - a.createdAt);
      return [rowToResult(sorted)];
    }

    if (sql.startsWith('SELECT * FROM mcp_servers')) {
      return [rowToResult(mcpServers)];
    }

    throw new Error(`Unhandled exec SQL: ${sql}`);
  }

  function run(sql: string, params: any[] = []) {
    const p = params.map(v => v ?? null);

    if (sql.startsWith('INSERT INTO mcp_servers')) {
      const [id, name, transport, command, url, envJson, enabled, connected, createdAt, updatedAt] = p;
      const existing = mcpServers.find(s => s.id === id);
      if (existing) throw new Error(`Duplicate id ${id}`);
      mcpServers.push({
        id, name, transport, command, url,
        env: safeJsonParse(envJson, {}),
        enabled: enabled === 1,
        connected: connected === 1,
        createdAt, updatedAt,
      } as McpServer);
      return;
    }

    if (sql.startsWith('UPDATE mcp_servers SET connected = 1')) {
      const [updatedAt, id] = p;
      const row = mcpServers.find(s => s.id === id);
      if (!row) throw new Error(`No row ${id}`);
      row.connected = true;
      row.updatedAt = updatedAt;
      return;
    }

    if (sql.startsWith('UPDATE mcp_servers SET connected = 0')) {
      const [updatedAt, id] = p;
      const row = mcpServers.find(s => s.id === id);
      if (!row) throw new Error(`No row ${id}`);
      row.connected = false;
      row.updatedAt = updatedAt;
      return;
    }

    if (sql.startsWith('DELETE FROM mcp_servers WHERE id = ?')) {
      const id = p[0];
      const idx = mcpServers.findIndex(s => s.id === id);
      if (idx !== -1) mcpServers.splice(idx, 1);
      return;
    }

    throw new Error(`Unhandled run SQL: ${sql}`);
  }

  return {
    run: vi.fn(run),
    exec: vi.fn(exec),
    _rows: mcpServers,
  };
}

function rowToResult(rows: McpServer[]) {
  const columns = ['id', 'name', 'transport', 'command', 'url', 'env_json', 'enabled', 'connected', 'created_at', 'updated_at'];
  const values = rows.map(r => [
    r.id,
    r.name,
    r.transport,
    r.command ?? null,
    r.url ?? null,
    JSON.stringify(r.env || {}),
    r.enabled ? 1 : 0,
    r.connected ? 1 : 0,
    r.createdAt,
    r.updatedAt,
  ]);
  return { columns, values };
}

function safeJsonParse(val: any, def: any) {
  if (!val) return def;
  try { return JSON.parse(val); } catch { return def; }
}

vi.mock('../db/index.js', () => ({
  getDatabase: () => memoryDb,
  saveDatabase: mockSaveDatabase,
  default: {
    getDatabase: () => memoryDb,
    saveDatabase: mockSaveDatabase,
  },
}));

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'test-uuid'),
}));

describe('McpClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    memoryDb = createMemoryDb();
    mockConnect.mockResolvedValue(undefined);
    mockClose.mockResolvedValue(undefined);
    mockCallTool.mockResolvedValue({ content: ['result'] });
    mockStdioTransport.mockImplementation((opts: any) => opts);
    mockSseTransport.mockImplementation((url: URL) => ({ url }));
    mockWebsocketTransport.mockImplementation((url: URL) => ({ url }));
  });

  it('installServer inserts a stdio server and attempts to connect', async () => {
    const mod = await import('../core/mcp-client.js');
    const client = mod.mcpClient;

    const req: InstallMcpRequest = { name: 'math', transport: 'stdio', command: 'node math.js' };
    const server = await client.installServer(req);

    expect(server.id).toBe('test-uuid');
    expect(server.name).toBe('math');
    expect(server.transport).toBe('stdio');
    expect(server.command).toBe('node math.js');
    expect(memoryDb._rows).toHaveLength(1);
    expect(memoryDb._rows[0].connected).toBe(true);
    expect(client.isConnected('math')).toBe(true);
    expect(mockConnect).toHaveBeenCalled();
    expect(mockStdioTransport).toHaveBeenCalledWith({ command: 'node', args: ['math.js'], env: {} });
  });

  it('installServer throws when stdio command is missing', async () => {
    const mod = await import('../core/mcp-client.js');
    const client = mod.mcpClient;

    await expect(client.installServer({ name: 'bad', transport: 'stdio' })).rejects.toThrow('stdio transport 需要提供 command');
  });

  it('connectServer uses SDK Client.connect and marks connected', async () => {
    const mod = await import('../core/mcp-client.js');
    const client = mod.mcpClient;

    const req: InstallMcpRequest = { name: 'math', transport: 'stdio', command: 'node math.js' };
    await client.installServer(req);

    mockConnect.mockClear();
    const connected = await client.connectServer('test-uuid');

    expect(connected.connected).toBe(true);
    expect(mockConnect).toHaveBeenCalledWith(expect.objectContaining({ command: 'node', args: ['math.js'] }));
  });

  it('disconnectServer closes client and marks disconnected', async () => {
    const mod = await import('../core/mcp-client.js');
    const client = mod.mcpClient;

    const req: InstallMcpRequest = { name: 'math', transport: 'stdio', command: 'node math.js' };
    await client.installServer(req);

    const disconnected = await client.disconnectServer('test-uuid');

    expect(disconnected.connected).toBe(false);
    expect(mockClose).toHaveBeenCalled();
  });

  it('callTool returns result via Client.callTool', async () => {
    const mod = await import('../core/mcp-client.js');
    const client = mod.mcpClient;

    const req: InstallMcpRequest = { name: 'math', transport: 'stdio', command: 'node math.js' };
    await client.installServer(req);

    const result = await client.callTool('math', 'add', { a: 1, b: 2 });

    expect(mockCallTool).toHaveBeenCalledWith({ name: 'add', arguments: { a: 1, b: 2 } });
    expect(result).toEqual({ result: ['result'] });
  });

  it('callTool returns toolResult when content is absent', async () => {
    mockCallTool.mockResolvedValueOnce({ toolResult: { sum: 3 } });
    const mod = await import('../core/mcp-client.js');
    const client = mod.mcpClient;

    const req: InstallMcpRequest = { name: 'math', transport: 'stdio', command: 'node math.js' };
    await client.installServer(req);

    const result = await client.callTool('math', 'add', { a: 1, b: 2 });
    expect(result).toEqual({ result: { sum: 3 } });
  });

  it('uninstallServer removes server from database and connections', async () => {
    const mod = await import('../core/mcp-client.js');
    const client = mod.mcpClient;

    const req: InstallMcpRequest = { name: 'math', transport: 'stdio', command: 'node math.js' };
    await client.installServer(req);

    const ok = client.uninstallServer('test-uuid');

    expect(ok).toBe(true);
    expect(memoryDb._rows).toHaveLength(0);
    expect(mockClose).toHaveBeenCalled();
  });

  it('installServer supports sse transport', async () => {
    const mod = await import('../core/mcp-client.js');
    const client = mod.mcpClient;

    const req: InstallMcpRequest = { name: 'remote', transport: 'sse', url: 'http://localhost:3000/sse' };
    await client.installServer(req);

    expect(mockSseTransport).toHaveBeenCalledWith(new URL('http://localhost:3000/sse'));
    expect(memoryDb._rows[0].url).toBe('http://localhost:3000/sse');
  });

  it('installServer supports websocket transport', async () => {
    const mod = await import('../core/mcp-client.js');
    const client = mod.mcpClient;

    const req: InstallMcpRequest = { name: 'remote', transport: 'websocket', url: 'ws://localhost:3000/ws' };
    await client.installServer(req);

    expect(mockWebsocketTransport).toHaveBeenCalledWith(new URL('ws://localhost:3000/ws'));
    expect(memoryDb._rows[0].url).toBe('ws://localhost:3000/ws');
  });
});
