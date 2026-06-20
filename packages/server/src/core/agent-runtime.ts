import { v4 as uuidv4 } from 'uuid';
import type { Agent, Message } from '@ordpaw/shared';
import { getDatabase, saveDatabase } from '../db/index.js';
import { sessionManager } from './session.js';
import { checkpointManager } from './checkpoint.js';
import { eventBus } from './event-bus.js';
import { debugLogger } from './debug-logger.js';
import { providerService } from './provider-service.js';
import { agentCache } from './cache.js';

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

    // 构建系统提示词
    const systemPrompt = agent.systemPrompt || 'You are a helpful AI assistant.';

    // 解析服务商信息
    const provider = providerService.getProvider(agent.providerId);
    const providerName = provider?.name || agent.providerId;

    // TODO: 这里应该调用实际的 LLM API
    // 目前是模拟响应，但已带上服务商/模型信息用于调试展示
    const assistantContent = `[模拟响应] 收到消息: "${userMessage}"\n\nAgent: ${agent.name}\n服务商: ${providerName}\n模型: ${agent.model}\n系统提示: ${systemPrompt.substring(0, 100)}...`;

    // 添加助手消息
    const assistantMsg = sessionManager.addMessage(conversationId, 'assistant', assistantContent);

    debugLogger.log('info', `processMessage done: conversation=${conversationId}, provider=${providerName}, model=${agent.model}`, 'agent-runtime');

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
      const result = db.exec('SELECT * FROM agents WHERE id = ?', [id]);
      if (result.length === 0 || result[0].values.length === 0) return null;

      const row = result[0].values[0];
      const columns = result[0].columns;
      const agent: any = {};
      columns.forEach((col, idx) => {
        agent[col] = row[idx];
      });

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
      const result = db.exec('SELECT * FROM agents ORDER BY updated_at DESC');
      if (result.length === 0) return [];

      const columns = result[0].columns;
      return result[0].values.map(row => {
        const agent: any = {};
        columns.forEach((col, idx) => {
          agent[col] = row[idx];
        });
        return {
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
      });
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

function safeJsonParse<T>(value: any, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export const agentRuntime = new AgentRuntime();
