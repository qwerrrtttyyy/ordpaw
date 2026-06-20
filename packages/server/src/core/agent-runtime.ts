import { v4 as uuidv4 } from 'uuid';
import type { Agent, Message, Provider } from '@ordpaw/shared';
import { getDatabase, saveDatabase } from '../db/index.js';
import { sessionManager } from './session.js';
import { checkpointManager } from './checkpoint.js';
import { eventBus } from './event-bus.js';
import { debugLogger } from './debug-logger.js';
import { providerService } from './provider-service.js';
import { agentCache } from './cache.js';
import { queryAll, queryOne, safeJsonParse } from '../db/utils.js';

/**
 * Resolve the effective API key for a provider.
 * Strategy: prefer the provider's own `apiKey`; fall back to the named key
 * in global settings.apiKeys[apiKeyName]; finally fall back to env var
 * ORDPAW_API_KEY_<TYPE>.
 */
function resolveApiKey(provider: Provider | null, settingsApiKeys: Record<string, string>): string {
  if (provider?.apiKey) return provider.apiKey;
  if (provider?.apiKeyName && settingsApiKeys[provider.apiKeyName]) {
    return settingsApiKeys[provider.apiKeyName];
  }
  const envKey = provider ? `ORDPAW_API_KEY_${provider.type.toUpperCase()}` : '';
  if (envKey && process.env[envKey]) return process.env[envKey] as string;
  return '';
}

/**
 * Build a chat-completion request body in OpenAI-compatible shape.
 * Anthropic is handled separately via its Messages API.
 */
function buildOpenAIMessages(systemPrompt: string, messages: Message[]): Array<{ role: string; content: string }> {
  const out: Array<{ role: string; content: string }> = [];
  if (systemPrompt) out.push({ role: 'system', content: systemPrompt });
  for (const m of messages) {
    if (m.role === 'system' && out.length > 0 && out[0].role === 'system') continue; // avoid dup
    out.push({ role: m.role, content: m.content });
  }
  return out;
}

/**
 * Call an OpenAI-compatible /v1/chat/completions endpoint and return the
 * assistant text. Returns null on failure (caller falls back to mock).
 */
async function callOpenAICompatible(opts: {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: Array<{ role: string; content: string }>;
}): Promise<string | null> {
  const url = opts.baseUrl.replace(/\/+$/, '') + '/v1/chat/completions';
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(opts.apiKey ? { Authorization: `Bearer ${opts.apiKey}` } : {})
      },
      body: JSON.stringify({
        model: opts.model,
        messages: opts.messages,
        stream: false
      })
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      debugLogger.log('error', `OpenAI-compatible call failed: ${res.status} ${text.slice(0, 200)}`, 'agent-runtime');
      return null;
    }
    const data: any = await res.json();
    return data?.choices?.[0]?.message?.content ?? '';
  } catch (err: any) {
    debugLogger.log('error', `OpenAI-compatible fetch error: ${err.message}`, 'agent-runtime');
    return null;
  }
}

/**
 * Call Anthropic Messages API (v1/messages) and return the assistant text.
 */
async function callAnthropic(opts: {
  baseUrl: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  messages: Array<{ role: string; content: string }>;
}): Promise<string | null> {
  const url = opts.baseUrl.replace(/\/+$/, '') + '/v1/messages';
  // Anthropic only accepts user/assistant roles in messages
  const filtered = opts.messages.filter(m => m.role === 'user' || m.role === 'assistant');
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': opts.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: opts.model,
        system: opts.systemPrompt,
        messages: filtered,
        max_tokens: 2048
      })
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      debugLogger.log('error', `Anthropic call failed: ${res.status} ${text.slice(0, 200)}`, 'agent-runtime');
      return null;
    }
    const data: any = await res.json();
    return data?.content?.map((c: any) => c.text).join('') ?? '';
  } catch (err: any) {
    debugLogger.log('error', `Anthropic fetch error: ${err.message}`, 'agent-runtime');
    return null;
  }
}

/**
 * Load the global Settings.apiKeys map from the settings table.
 */
function loadSettingsApiKeys(): Record<string, string> {
  try {
    const db = getDatabase();
    const row = queryOne<{ key: string; value_json: string }>(db, "SELECT value_json FROM settings WHERE key = 'apiKeys'");
    if (!row) return {};
    return safeJsonParse<Record<string, string>>(row.value_json, {});
  } catch {
    return {};
  }
}

export class AgentRuntime {
  async processMessage(conversationId: string, userMessage: string): Promise<Message | null> {
    const conversation = sessionManager.getConversation(conversationId);
    if (!conversation) return null;

    const agent = this.getAgent(conversation.agentId);
    if (!agent) {
      throw new Error('Agent not found for conversation');
    }

    debugLogger.log('debug', `processMessage start: conversation=${conversationId}, agent=${agent.id}`, 'agent-runtime');

    // 触发 message:before 事件
    await eventBus.emit('message:before', { conversationId, message: userMessage });

    // 添加用户消息
    const userMsg = sessionManager.addMessage(conversationId, 'user', userMessage);

    const systemPrompt = agent.systemPrompt || 'You are a helpful AI assistant.';
    const provider = providerService.getProvider(agent.providerId);
    const apiKey = resolveApiKey(provider, loadSettingsApiKeys());

    let assistantContent: string;
    if (provider && apiKey) {
      const history = sessionManager.getConversation(conversationId)?.messages ?? [userMsg];
      const openaiMessages = buildOpenAIMessages(systemPrompt, history);

      let llmText: string | null = null;
      if (provider.type === 'anthropic') {
        const baseUrl = provider.baseUrl || 'https://api.anthropic.com';
        llmText = await callAnthropic({
          baseUrl, apiKey, model: agent.model, systemPrompt, messages: openaiMessages.filter(m => m.role !== 'system')
        });
      } else if (provider.type === 'openai' || provider.type === 'custom' || provider.type === 'ollama') {
        const baseUrl = provider.baseUrl || (provider.type === 'ollama' ? 'http://localhost:11434' : 'https://api.openai.com');
        llmText = await callOpenAICompatible({ baseUrl, apiKey, model: agent.model, messages: openaiMessages });
      }

      if (llmText && llmText.trim()) {
        assistantContent = llmText;
        debugLogger.log('info', `LLM response received: conversation=${conversationId}, provider=${provider.name}, model=${agent.model}, len=${llmText.length}`, 'agent-runtime');
      } else {
        assistantContent = `[OrdPaw] LLM 调用失败或返回空，使用降级响应。Agent: ${agent.name}, Provider: ${provider.name}, Model: ${agent.model}\n\n收到消息: "${userMessage}"`;
        debugLogger.log('warn', `LLM call returned empty, using fallback`, 'agent-runtime');
      }
    } else {
      // 没有 provider 或 apiKey —— 降级为占位响应，但带明确的诊断信息
      const reason = !provider ? `provider not found (${agent.providerId})` : 'missing API key';
      assistantContent = `[OrdPaw 降级响应] 原因: ${reason}\n\nAgent: ${agent.name}\n服务商: ${provider?.name ?? agent.providerId}\n模型: ${agent.model}\n\n用户消息: ${userMessage}`;
      debugLogger.log('warn', `Using fallback response: ${reason}`, 'agent-runtime');
    }

    // 添加助手消息
    const assistantMsg = sessionManager.addMessage(conversationId, 'assistant', assistantContent);

    debugLogger.log('info', `processMessage done: conversation=${conversationId}`, 'agent-runtime');

    // 触发 message:after 事件
    await eventBus.emit('message:after', { conversationId, message: assistantMsg });

    // 根据策略创建检查点
    try {
      checkpointManager.createCheckpoint(conversationId, assistantMsg.id, 'Auto checkpoint');
    } catch (err) {
      console.error('自动检查点创建失败:', err);
    }

    return assistantMsg;
  }

  getAgent(id: string): Agent | null {
    const cached = agentCache.get(id);
    if (cached) return cached;

    try {
      const db = getDatabase();
      const agent = queryOne<any>(db, 'SELECT * FROM agents WHERE id = ?', [id]);
      if (!agent) return null;

      const parsed: Agent = {
        id: agent.id,
        name: agent.name,
        description: agent.description,
        systemPrompt: agent.system_prompt,
        providerId: agent.provider_id || 'openai',
        model: agent.model,
        skills: safeJsonParse(agent.skills_json, []),
        mcpServers: safeJsonParse(agent.mcp_json, []),
        createdAt: agent.created_at,
        updatedAt: agent.updated_at
      };
      agentCache.set(id, parsed);
      return parsed;
    } catch (err) {
      console.error('getAgent 错误:', err);
      return null;
    }
  }

  createAgent(data: { name: string; description?: string; systemPrompt?: string; providerId?: string; model?: string; skills?: string[]; mcpServers?: any[] }): Agent {
    const db = getDatabase();
    const now = Date.now();
    const id = uuidv4();
    const safeName = (data.name || '未命名').toString();
    const safeDesc = (data.description || '').toString();
    const safePrompt = (data.systemPrompt || '').toString();
    const safeProvider = (data.providerId || 'openai').toString();
    const safeModel = (data.model || 'gpt-4').toString();
    const skillsJson = JSON.stringify(data.skills || []);
    const mcpJson = JSON.stringify(data.mcpServers || []);

    db.run(`
      INSERT INTO agents (id, name, description, system_prompt, provider_id, model, skills_json, mcp_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, safeName, safeDesc, safePrompt, safeProvider, safeModel, skillsJson, mcpJson, now, now]);

    saveDatabase();
    return this.getAgent(id)!;
  }

  listAgents(): Agent[] {
    try {
      const db = getDatabase();
      const rows = queryAll<any>(db, 'SELECT * FROM agents ORDER BY updated_at DESC');
      return rows.map(agent => ({
        id: agent.id,
        name: agent.name,
        description: agent.description,
        systemPrompt: agent.system_prompt,
        providerId: agent.provider_id || 'openai',
        model: agent.model,
        skills: safeJsonParse(agent.skills_json, []),
        mcpServers: safeJsonParse(agent.mcp_json, []),
        createdAt: agent.created_at,
        updatedAt: agent.updated_at
      }));
    } catch (err) {
      console.error('listAgents 错误:', err);
      return [];
    }
  }

  updateAgent(id: string, data: Partial<Agent>): Agent | null {
    const agent = this.getAgent(id);
    if (!agent) return null;

    const db = getDatabase();
    const updates: string[] = [];
    const params: any[] = [];

    if (data.name !== undefined) {
      updates.push('name = ?');
      params.push(data.name.toString());
    }
    if (data.description !== undefined) {
      updates.push('description = ?');
      params.push((data.description || '').toString());
    }
    if (data.systemPrompt !== undefined) {
      updates.push('system_prompt = ?');
      params.push((data.systemPrompt || '').toString());
    }
    if (data.providerId !== undefined) {
      updates.push('provider_id = ?');
      params.push(data.providerId.toString());
    }
    if (data.model !== undefined) {
      updates.push('model = ?');
      params.push(data.model.toString());
    }
    if (data.skills !== undefined) {
      updates.push('skills_json = ?');
      params.push(JSON.stringify(data.skills));
    }
    if (data.mcpServers !== undefined) {
      updates.push('mcp_json = ?');
      params.push(JSON.stringify(data.mcpServers));
    }

    if (updates.length > 0) {
      updates.push('updated_at = ?');
      params.push(Date.now());
      params.push(id);
      db.run(`UPDATE agents SET ${updates.join(', ')} WHERE id = ?`, params);
      saveDatabase();
      agentCache.delete(id);
    }

    return this.getAgent(id);
  }

  deleteAgent(id: string): boolean {
    try {
      const db = getDatabase();
      const existing = db.exec('SELECT id FROM agents WHERE id = ?', [id]);
      if (existing.length === 0 || existing[0].values.length === 0) return false;
      db.run('DELETE FROM agents WHERE id = ?', [id]);
      saveDatabase();
      agentCache.delete(id);
      return true;
    } catch (err) {
      console.error('deleteAgent 错误:', err);
      return false;
    }
  }
}

export const agentRuntime = new AgentRuntime();
