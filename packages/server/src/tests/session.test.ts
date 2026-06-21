import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMemoryDb } from './helpers.js';

let memoryDb: any;

vi.mock('../db/index.js', () => ({
  getDatabase: () => memoryDb,
  saveDatabase: vi.fn(),
  default: {
    getDatabase: () => memoryDb,
    saveDatabase: vi.fn(),
  },
}));

describe('SessionManager', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    memoryDb = await createMemoryDb();
  });

  async function createAgent(name: string) {
    const id = crypto.randomUUID();
    memoryDb.run(
      'INSERT INTO agents (id, name, description, system_prompt, provider_id, model, skills_json, mcp_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, name, '', '', 'openai', 'gpt-4', '[]', '[]', Date.now(), Date.now()]
    );
    return id;
  }

  it('creates and retrieves a conversation', async () => {
    const { sessionManager } = await import('../core/session.js');
    const agentId = await createAgent('Test Agent');

    const conversation = sessionManager.createConversation(agentId, 'Hello');

    expect(conversation.agentId).toBe(agentId);
    expect(conversation.title).toBe('Hello');
    expect(conversation.messages).toEqual([]);

    const fetched = sessionManager.getConversation(conversation.id);
    expect(fetched?.id).toBe(conversation.id);
    expect(fetched?.title).toBe('Hello');
  });

  it('uses default title when not provided', async () => {
    const { sessionManager } = await import('../core/session.js');
    const agentId = await createAgent('Test Agent');

    const conversation = sessionManager.createConversation(agentId);
    expect(conversation.title).toBe('新会话');
  });

  it('lists conversations optionally filtered by agent', async () => {
    const { sessionManager } = await import('../core/session.js');
    const agentA = await createAgent('Agent A');
    const agentB = await createAgent('Agent B');

    sessionManager.createConversation(agentA, 'A1');
    sessionManager.createConversation(agentA, 'A2');
    sessionManager.createConversation(agentB, 'B1');

    const all = sessionManager.listConversations();
    expect(all.length).toBe(3);

    const filtered = sessionManager.listConversations(agentA);
    expect(filtered.length).toBe(2);
    expect(filtered.every((c) => c.agentId === agentA)).toBe(true);
  });

  it('adds messages to a conversation', async () => {
    const { sessionManager } = await import('../core/session.js');
    const agentId = await createAgent('Test Agent');
    const conversation = sessionManager.createConversation(agentId);

    const message = sessionManager.addMessage(conversation.id, 'user', 'Hi', { source: 'test' });

    expect(message.role).toBe('user');
    expect(message.content).toBe('Hi');
    expect(message.metadata).toEqual({ source: 'test' });

    const fetched = sessionManager.getConversation(conversation.id);
    expect(fetched?.messages.length).toBe(1);
    expect(fetched?.messages[0].content).toBe('Hi');
  });

  it('deletes an existing conversation', async () => {
    const { sessionManager } = await import('../core/session.js');
    const agentId = await createAgent('Test Agent');
    const conversation = sessionManager.createConversation(agentId);

    const ok = sessionManager.deleteConversation(conversation.id);
    expect(ok).toBe(true);
    expect(sessionManager.getConversation(conversation.id)).toBeNull();
  });

  it('returns false when deleting non-existent conversation', async () => {
    const { sessionManager } = await import('../core/session.js');
    expect(sessionManager.deleteConversation('missing-id')).toBe(false);
  });

  it('updates conversation variables', async () => {
    const { sessionManager } = await import('../core/session.js');
    const agentId = await createAgent('Test Agent');
    const conversation = sessionManager.createConversation(agentId);

    const ok = sessionManager.updateVariables(conversation.id, { key: 'value' });
    expect(ok).toBe(true);

    const fetched = sessionManager.getConversation(conversation.id);
    expect(fetched?.variables).toEqual({ key: 'value' });
  });

  it('returns false when updating variables for missing conversation', async () => {
    const { sessionManager } = await import('../core/session.js');
    expect(sessionManager.updateVariables('missing-id', {})).toBe(false);
  });

  it('safely handles getConversation database errors', async () => {
    const { sessionManager } = await import('../core/session.js');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const brokenDb = {
      exec: () => {
        throw new Error('db down');
      },
    };
    memoryDb = brokenDb;

    const result = sessionManager.getConversation('any');
    expect(result).toBeNull();
    errorSpy.mockRestore();
  });
});
