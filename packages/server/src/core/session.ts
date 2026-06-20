import { v4 as uuidv4 } from 'uuid';
import type { Conversation, Message } from '@ordpaw/shared';
import { getDatabase, saveDatabase } from '../db/index.js';
import { checkpointManager } from './checkpoint.js';
import { eventBus } from './event-bus.js';

export class SessionManager {
  createConversation(agentId: string, title?: string): Conversation {
    const db = getDatabase();
    const now = Date.now();
    const id = uuidv4();
    const safeTitle = (title || '新会话').toString();

    db.run(`
      INSERT INTO conversations (id, agent_id, title, variables_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [id, agentId, safeTitle, '{}', now, now]);

    saveDatabase();
    eventBus.emit('conversation:created', { id, agentId });
    return this.getConversation(id)!;
  }

  getConversation(id: string): Conversation | null {
    try {
      const db = getDatabase();
      const convResult = db.exec('SELECT * FROM conversations WHERE id = ?', [id]);

      if (convResult.length === 0 || convResult[0].values.length === 0) return null;

      const convRow = convResult[0].values[0];
      const convColumns = convResult[0].columns;
      const conv: any = {};
      convColumns.forEach((col, idx) => {
        conv[col] = convRow[idx];
      });

      const msgResult = db.exec(
        'SELECT * FROM messages WHERE conversation_id = ? ORDER BY "timestamp" ASC',
        [id]
      );
      const messages: Message[] = [];

      if (msgResult.length > 0) {
        const msgColumns = msgResult[0].columns;
        msgResult[0].values.forEach(row => {
          const msg: any = {};
          msgColumns.forEach((col, idx) => {
            msg[col] = row[idx];
          });
          messages.push({
            id: msg.id,
            role: msg.role,
            content: msg.content,
            timestamp: msg.timestamp,
            metadata: safeJsonParse(msg.metadata_json, {})
          });
        });
      }

      const checkpoints = checkpointManager.getCheckpoints(id);

      return {
        id: conv.id,
        agentId: conv.agent_id,
        title: conv.title,
        messages,
        checkpoints,
        variables: safeJsonParse(conv.variables_json, {}),
        createdAt: conv.created_at,
        updatedAt: conv.updated_at
      };
    } catch (err) {
      console.error('getConversation 错误:', err);
      return null;
    }
  }

  listConversations(agentId?: string): Conversation[] {
    try {
      const db = getDatabase();
      let result;
      if (agentId) {
        result = db.exec('SELECT * FROM conversations WHERE agent_id = ? ORDER BY updated_at DESC', [agentId]);
      } else {
        result = db.exec('SELECT * FROM conversations ORDER BY updated_at DESC');
      }
      if (result.length === 0) return [];

      const columns = result[0].columns;
      return result[0].values.map(row => {
        const conv: any = {};
        columns.forEach((col, idx) => {
          conv[col] = row[idx];
        });
        return {
          id: conv.id,
          agentId: conv.agent_id,
          title: conv.title,
          messages: [],
          checkpoints: [],
          variables: safeJsonParse(conv.variables_json, {}),
          createdAt: conv.created_at,
          updatedAt: conv.updated_at
        };
      });
    } catch (err) {
      console.error('listConversations 错误:', err);
      return [];
    }
  }

  addMessage(conversationId: string, role: Message['role'], content: string, metadata?: Record<string, any>): Message {
    const db = getDatabase();
    const message: Message = {
      id: uuidv4(),
      role,
      content,
      timestamp: Date.now(),
      metadata
    };
    const metadataJson = JSON.stringify(message.metadata || {});

    db.run(`
      INSERT INTO messages (id, conversation_id, role, content, metadata_json, "timestamp")
      VALUES (?, ?, ?, ?, ?, ?)
    `, [message.id, conversationId, message.role, message.content, metadataJson, message.timestamp]);

    db.run('UPDATE conversations SET updated_at = ? WHERE id = ?', [Date.now(), conversationId]);

    saveDatabase();
    eventBus.emit('message:added', { conversationId, message });

    return message;
  }

  deleteConversation(id: string): boolean {
    try {
      const db = getDatabase();
      const existing = db.exec('SELECT id FROM conversations WHERE id = ?', [id]);
      if (existing.length === 0 || existing[0].values.length === 0) return false;
      db.run('DELETE FROM conversations WHERE id = ?', [id]);
      saveDatabase();
      eventBus.emit('conversation:deleted', { id });
      return true;
    } catch (err) {
      console.error('deleteConversation 错误:', err);
      return false;
    }
  }

  updateVariables(conversationId: string, variables: Record<string, any>): boolean {
    try {
      const db = getDatabase();
      const existing = db.exec('SELECT id FROM conversations WHERE id = ?', [conversationId]);
      if (existing.length === 0 || existing[0].values.length === 0) return false;
      db.run(
        'UPDATE conversations SET variables_json = ?, updated_at = ? WHERE id = ?',
        [JSON.stringify(variables), Date.now(), conversationId]
      );
      saveDatabase();
      return true;
    } catch (err) {
      console.error('updateVariables 错误:', err);
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

export const sessionManager = new SessionManager();
