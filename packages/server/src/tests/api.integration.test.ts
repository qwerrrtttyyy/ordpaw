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
    flushDatabaseSync: vi.fn(),
  },
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

  const { errorHandler, requestLogger, notFoundHandler } = await import('../middleware.js');
  app.use(requestLogger);
  app.use(errorHandler);
  app.use(notFoundHandler);

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
      body: JSON.stringify(body),
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
      model: 'llama3',
    });
    const agent = await agentRes.json();

    const convRes = await post('/api/conversations', { agentId: agent.id });
    const conversation = await convRes.json();

    const res = await post('/api/chat', {
      conversationId: conversation.id,
      content: 'Hello',
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
      parameters: { type: 'object', properties: { a: { type: 'number' }, b: { type: 'number' } } },
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
      body: JSON.stringify({ theme: 'ordpaw-dark', debugMode: true }),
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

  it('PUT /api/agents/:id updates an agent', async () => {
    const createRes = await post('/api/agents', { name: 'Update Me' });
    const { id } = await createRes.json();

    const res = await fetch(`${baseUrl}/api/agents/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Updated', model: 'gpt-4o' }),
    });
    expect(res.status).toBe(200);
    const agent = await res.json();
    expect(agent.name).toBe('Updated');
    expect(agent.model).toBe('gpt-4o');
  });

  it('DELETE /api/agents/:id removes an agent', async () => {
    const createRes = await post('/api/agents', { name: 'Delete Me' });
    const { id } = await createRes.json();

    const res = await fetch(`${baseUrl}/api/agents/${id}`, { method: 'DELETE' });
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);

    const getRes = await fetch(`${baseUrl}/api/agents/${id}`);
    expect(getRes.status).toBe(404);
  });

  it('POST /api/providers creates a custom provider', async () => {
    const res = await post('/api/providers', {
      name: 'Custom',
      type: 'custom',
      baseUrl: 'http://localhost:9999',
    });
    expect(res.status).toBe(201);
    const provider = await res.json();
    expect(provider.name).toBe('Custom');
    expect(provider.apiKey).toBe('');
  });

  it('PUT /api/providers/:id updates a custom provider', async () => {
    const createRes = await post('/api/providers', { name: 'Custom2', type: 'custom' });
    const { id } = await createRes.json();

    const res = await fetch(`${baseUrl}/api/providers/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Custom2Updated', enabled: false }),
    });
    expect(res.status).toBe(200);
    const provider = await res.json();
    expect(provider.name).toBe('Custom2Updated');
    expect(provider.enabled).toBe(false);
  });

  it('DELETE /api/providers/:id removes a custom provider', async () => {
    const createRes = await post('/api/providers', { name: 'Custom3', type: 'custom' });
    const { id } = await createRes.json();

    const res = await fetch(`${baseUrl}/api/providers/${id}`, { method: 'DELETE' });
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });

  it('GET /api/conversations lists conversations', async () => {
    const agentRes = await post('/api/agents', { name: 'List Conv Agent' });
    const agent = await agentRes.json();
    await post('/api/conversations', { agentId: agent.id, title: 'C1' });

    const res = await fetch(`${baseUrl}/api/conversations`);
    expect(res.status).toBe(200);
    const conversations = await res.json();
    expect(conversations.length).toBeGreaterThanOrEqual(1);
  });

  it('GET /api/conversations/:id returns a conversation', async () => {
    const agentRes = await post('/api/agents', { name: 'Get Conv Agent' });
    const agent = await agentRes.json();
    const convRes = await post('/api/conversations', { agentId: agent.id, title: 'C2' });
    const { id } = await convRes.json();

    const res = await fetch(`${baseUrl}/api/conversations/${id}`);
    expect(res.status).toBe(200);
    expect((await res.json()).id).toBe(id);
  });

  it('DELETE /api/conversations/:id removes a conversation', async () => {
    const agentRes = await post('/api/agents', { name: 'Delete Conv Agent' });
    const agent = await agentRes.json();
    const convRes = await post('/api/conversations', { agentId: agent.id, title: 'C3' });
    const { id } = await convRes.json();

    const res = await fetch(`${baseUrl}/api/conversations/${id}`, { method: 'DELETE' });
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });

  it('POST /api/conversations/:id/checkpoints creates a checkpoint', async () => {
    const agentRes = await post('/api/agents', { name: 'Checkpoint Agent' });
    const agent = await agentRes.json();
    const convRes = await post('/api/conversations', { agentId: agent.id });
    const conversation = await convRes.json();

    const chatRes = await post('/api/chat', { conversationId: conversation.id, content: 'Hi' });
    const message = await chatRes.json();

    const res = await post(`/api/conversations/${conversation.id}/checkpoints`, {
      messageId: message.id,
      label: 'cp1',
    });
    expect(res.status).toBe(201);
    const checkpoint = await res.json();
    expect(checkpoint.conversationId).toBe(conversation.id);
  });

  it('GET /api/conversations/:id/checkpoints lists checkpoints', async () => {
    const agentRes = await post('/api/agents', { name: 'List Checkpoint Agent' });
    const agent = await agentRes.json();
    const convRes = await post('/api/conversations', { agentId: agent.id });
    const conversation = await convRes.json();

    const chatRes = await post('/api/chat', { conversationId: conversation.id, content: 'Hi' });
    const message = await chatRes.json();
    await post(`/api/conversations/${conversation.id}/checkpoints`, { messageId: message.id });

    const res = await fetch(`${baseUrl}/api/conversations/${conversation.id}/checkpoints`);
    expect(res.status).toBe(200);
    const checkpoints = await res.json();
    expect(checkpoints.length).toBeGreaterThanOrEqual(1);
  });

  it('POST /api/test-suites creates and runs a suite', async () => {
    const agentRes = await post('/api/agents', { name: 'Test Suite Agent' });
    const agent = await agentRes.json();

    const suiteRes = await post('/api/test-suites', { agentId: agent.id, name: 'Suite1' });
    expect(suiteRes.status).toBe(201);
    const suite = await suiteRes.json();
    expect(suite.name).toBe('Suite1');

    const caseRes = await post(`/api/test-suites/${suite.id}/cases`, {
      name: 'Case1',
      input: 'hello',
    });
    expect(caseRes.status).toBe(201);

    const runRes = await post(`/api/test-suites/${suite.id}/run`);
    expect(runRes.status).toBe(200);
    const run = await runRes.json();
    expect(run).toHaveProperty('passed');
  });

  it('GET /api/debug/logs returns logs', async () => {
    const res = await fetch(`${baseUrl}/api/debug/logs`);
    expect(res.status).toBe(200);
    const logs = await res.json();
    expect(Array.isArray(logs)).toBe(true);
  });

  it('GET /api/skills/installed lists installed skills', async () => {
    const res = await fetch(`${baseUrl}/api/skills/installed`);
    expect(res.status).toBe(200);
    const installed = await res.json();
    expect(Array.isArray(installed)).toBe(true);
  });

  it('DELETE /api/skills/:id removes an installed skill', async () => {
    const installRes = await post('/api/skills/install', {
      name: 'removeme',
      code: 'return 1;',
      parameters: {},
    });
    const { id } = await installRes.json();

    const res = await fetch(`${baseUrl}/api/skills/${id}`, { method: 'DELETE' });
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });

  it('GET /api/mcp lists MCP servers', async () => {
    const res = await fetch(`${baseUrl}/api/mcp`);
    expect(res.status).toBe(200);
    const servers = await res.json();
    expect(Array.isArray(servers)).toBe(true);
  });

  it('POST /api/mcp installs an MCP server', async () => {
    const res = await post('/api/mcp', {
      name: 'fake-sse',
      transport: 'sse',
      url: 'http://localhost:9999/fake',
    });
    expect(res.status).toBe(201);
    const server = await res.json();
    expect(server.name).toBe('fake-sse');
  });

  it('DELETE /api/mcp/:id removes an MCP server', async () => {
    const installRes = await post('/api/mcp', {
      name: 'delete-sse',
      transport: 'sse',
      url: 'http://localhost:9999/fake',
    });
    const { id } = await installRes.json();

    const res = await fetch(`${baseUrl}/api/mcp/${id}`, { method: 'DELETE' });
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });

  it('POST /api/prompts creates and updates a prompt', async () => {
    const createRes = await post('/api/prompts', { name: 'P1', content: 'Hello {{name}}' });
    expect(createRes.status).toBe(201);
    const prompt = await createRes.json();

    const updateRes = await fetch(`${baseUrl}/api/prompts/${prompt.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'P1Updated', content: 'Updated' }),
    });
    expect(updateRes.status).toBe(200);
    expect((await updateRes.json()).name).toBe('P1Updated');

    const deleteRes = await fetch(`${baseUrl}/api/prompts/${prompt.id}`, { method: 'DELETE' });
    expect(deleteRes.status).toBe(200);
  });

  it('POST /api/plugins installs and configures a plugin', async () => {
    const installRes = await post('/api/plugins/install', {
      name: 'test-plugin-2',
      version: '1.0.0',
      manifest: { components: [] },
    });
    expect(installRes.status).toBe(201);
    const plugin = await installRes.json();

    const configRes = await fetch(`${baseUrl}/api/plugins/${plugin.id}/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: { enabled: true } }),
    });
    expect(configRes.status).toBe(200);

    const deleteRes = await fetch(`${baseUrl}/api/plugins/${plugin.id}`, { method: 'DELETE' });
    expect(deleteRes.status).toBe(200);
  });

  it('POST /api/scripts creates and executes a script', async () => {
    const createRes = await post('/api/scripts', {
      name: 'test-script',
      code: 'return { sum: $args.a + $args.b };',
      language: 'javascript',
    });
    expect(createRes.status).toBe(201);
    const script = await createRes.json();

    const execRes = await post(`/api/scripts/${script.id}/execute`, { args: { a: 1, b: 2 } });
    expect(execRes.status).toBe(200);
    const result = await execRes.json();
    expect(result.success).toBe(true);
    expect(result.output.sum).toBe(3);

    const deleteRes = await fetch(`${baseUrl}/api/scripts/${script.id}`, { method: 'DELETE' });
    expect(deleteRes.status).toBe(200);
  });

  it('POST /api/reset/settings resets settings', async () => {
    await fetch(`${baseUrl}/api/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme: 'ordpaw-dark' }),
    });

    const res = await post('/api/reset/settings', {});
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });

  it('POST /api/clear-data clears selected data', async () => {
    const res = await post('/api/clear-data', { targets: ['cache', 'logs'] });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.cleared).toContain('cache');
    expect(data.cleared).toContain('logs');
  });

  it('GET /api/export returns export data', async () => {
    const res = await fetch(`${baseUrl}/api/export`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.version).toBe(1);
    expect(data.scope).toBe('all');
  });

  it('POST /api/import imports agents', async () => {
    const res = await post('/api/import', {
      agents: [
        {
          id: 'imported-1',
          name: 'Imported',
          description: '',
          system_prompt: '',
          provider_id: 'openai',
          model: 'gpt-4',
          skills_json: '[]',
          mcp_json: '[]',
          created_at: Date.now(),
          updated_at: Date.now(),
        },
      ],
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.imported).toContain('agents');
  });

  it('GET /api/unknown-route returns 404', async () => {
    const res = await fetch(`${baseUrl}/api/unknown-route`);
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.code).toBe('ROUTE_NOT_FOUND');
  });

  it('returns 400 with details for invalid body type', async () => {
    const res = await fetch(`${baseUrl}/api/agents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 123 }),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.details).toBeInstanceOf(Array);
  });
});
