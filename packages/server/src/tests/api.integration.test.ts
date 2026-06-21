import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import { createMemoryDb } from './helpers.js';

let memoryDb: any;
let server: any;
let baseUrl: string;

vi.mock('../db/index.js', () => ({
  initDatabase: vi.fn(async () => memoryDb),
  getDatabase: () => memoryDb,
  saveDatabase: vi.fn(),
  flushDatabaseSync: vi.fn(),
  default: {
    initDatabase: vi.fn(async () => memoryDb),
    getDatabase: () => memoryDb,
    saveDatabase: vi.fn(),
    flushDatabaseSync: vi.fn()
  }
}));

async function createTestServer() {
  memoryDb = await createMemoryDb();

  const { scriptMcp } = await import('../core/script-mcp.js');
  const { providerService } = await import('../core/provider-service.js');
  const { componentServer } = await import('../core/component-server.js');
  const { skillRunner } = await import('../core/skill-runner.js');
  const { mcpClient } = await import('../core/mcp-client.js');
  const { agentRuntime } = await import('../core/agent-runtime.js');

  scriptMcp.init();
  providerService.init();
  componentServer.loadFromDatabase();
  skillRunner.init();
  mcpClient.init();

  const app = express();
  app.use(express.json({ limit: '10mb' }));

  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
  });

  const { setupApiRoutes } = await import('../api/index.js');
  setupApiRoutes(app);

  const { errorHandler } = await import('../middleware.js');
  app.use(errorHandler);

  return new Promise<number>((resolve) => {
    server = app.listen(0, () => {
      resolve((server.address() as any).port);
    });
  });
}

describe('API Integration', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    const port = await createTestServer();
    baseUrl = `http://localhost:${port}`;
  });

  afterEach(async () => {
    if (server) {
      const s = server;
      server = null;
      await new Promise<void>((resolve, reject) => {
        s.close((err: any) => (err ? reject(err) : resolve()));
      });
    }
  });

  async function post(path: string, body: any) {
    return fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  }

  it('GET /healthz returns ok', async () => {
    const res = await fetch(`${baseUrl}/healthz`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('ok');
    expect(typeof data.timestamp).toBe('number');
  });

  it('GET /api/agents returns empty list initially', async () => {
    const res = await fetch(`${baseUrl}/api/agents`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('POST /api/agents creates an agent', async () => {
    const res = await post('/api/agents', { name: 'Test Agent' });
    expect(res.status).toBe(201);
    const agent = await res.json();
    expect(agent.name).toBe('Test Agent');
    expect(agent.providerId).toBe('openai');
  });

  it('GET /api/agents/:id returns the agent', async () => {
    const createRes = await post('/api/agents', { name: 'Finder' });
    const { id } = await createRes.json();

    const res = await fetch(`${baseUrl}/api/agents/${id}`);
    expect(res.status).toBe(200);
    expect((await res.json()).id).toBe(id);
  });

  it('GET /api/agents/:id returns 404 for unknown agent', async () => {
    const res = await fetch(`${baseUrl}/api/agents/unknown-id`);
    expect(res.status).toBe(404);
  });

  it('GET /api/providers lists built-in providers without api keys', async () => {
    const res = await fetch(`${baseUrl}/api/providers`);
    expect(res.status).toBe(200);
    const providers = await res.json();
    expect(providers.length).toBeGreaterThanOrEqual(3);
    const openai = providers.find((p: any) => p.name === 'OpenAI');
    expect(openai).toBeDefined();
    expect(openai.apiKey).toBe('');
    expect(openai.hasApiKey).toBe(false);
  });

  it('GET /api/components/manifest returns component manifest', async () => {
    const res = await fetch(`${baseUrl}/api/components/manifest`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.version).toBe('0.0.3');
    expect(Array.isArray(data.items)).toBe(true);
  });

  it('GET /api/components/tree returns component tree', async () => {
    const res = await fetch(`${baseUrl}/api/components/tree`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.root)).toBe(true);
    expect(Array.isArray(data.relationships)).toBe(true);
  });

  it('GET /api/components/plugins returns plugin stats', async () => {
    const res = await fetch(`${baseUrl}/api/components/plugins`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.plugins)).toBe(true);
    expect(data.stats).toHaveProperty('totalComponents');
  });

  it('POST /api/conversations creates a conversation for an agent', async () => {
    const agentRes = await post('/api/agents', { name: 'Chat Agent' });
    const agent = await agentRes.json();

    const res = await post('/api/conversations', { agentId: agent.id, title: 'Chat' });
    expect(res.status).toBe(201);
    const conversation = await res.json();
    expect(conversation.agentId).toBe(agent.id);
    expect(conversation.title).toBe('Chat');
  });

  it('POST /api/conversations returns 400 for missing agent', async () => {
    const res = await post('/api/conversations', { agentId: 'missing', title: 'X' });
    expect(res.status).toBe(400);
  });

  it('POST /api/chat returns fallback response without LLM key', async () => {
    const agentRes = await post('/api/agents', {
      name: 'Ollama Agent',
      providerId: 'ollama',
      model: 'llama3'
    });
    const agent = await agentRes.json();

    const convRes = await post('/api/conversations', { agentId: agent.id });
    const conversation = await convRes.json();

    const res = await post('/api/chat', {
      conversationId: conversation.id,
      content: 'Hello'
    });

    expect(res.status).toBe(200);
    const message = await res.json();
    expect(message.role).toBe('assistant');
    expect(message.content).toContain('降级响应');
  });

  it('GET /api/skills includes built-in skills', async () => {
    const res = await fetch(`${baseUrl}/api/skills`);
    expect(res.status).toBe(200);
    const skills = await res.json();
    expect(skills.some((s: any) => s.name === 'echo')).toBe(true);
  });

  it('POST /api/skills/install and execute works end-to-end', async () => {
    const installRes = await post('/api/skills/install', {
      name: 'adder',
      code: 'return $args.a + $args.b;',
      parameters: { type: 'object', properties: { a: { type: 'number' }, b: { type: 'number' } } }
    });
    expect(installRes.status).toBe(201);
    const { id } = await installRes.json();

    const execRes = await post(`/api/skills/${id}/execute`, { params: { a: 1, b: 2 } });
    expect(execRes.status).toBe(200);
    const result = await execRes.json();
    expect(result.success).toBe(true);
    expect(result.output.result).toBe(3);
  });

  it('GET /api/settings returns defaults', async () => {
    const res = await fetch(`${baseUrl}/api/settings`);
    expect(res.status).toBe(200);
    const settings = await res.json();
    expect(settings.theme).toBe('ordpaw-light');
    expect(settings.locale).toBe('zh-CN');
  });

  it('PUT /api/settings updates settings', async () => {
    const res = await fetch(`${baseUrl}/api/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme: 'ordpaw-dark', debugMode: true })
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.updated).toBe(2);
  });

  it('GET /api/stats returns counters', async () => {
    const res = await fetch(`${baseUrl}/api/stats`);
    expect(res.status).toBe(200);
    const stats = await res.json();
    expect(typeof stats.agents).toBe('number');
    expect(typeof stats.conversations).toBe('number');
    expect(typeof stats.skills).toBe('number');
    expect(typeof stats.providers).toBe('number');
  });
});
