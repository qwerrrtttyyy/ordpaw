import { v4 as uuidv4 } from 'uuid';
import type { Conversation, Message } from '@ordpaw/shared';
import { getDatabase, saveDatabase } from '../db/index.js';
import { checkpointManager } from './checkpoint.js';
import { eventBus } from './event-bus.js';
import { queryAll, queryOne, safeJsonParse } from '../db/utils.js';

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
      const conv = queryOne<any>(db, 'SELECT * FROM conversations WHERE id = ?', [id]);
      if (!conv) return null;

      const msgRows = queryAll<any>(
        db,
        'SELECT * FROM messages WHERE conversation_id = ? ORDER BY "timestamp" ASC, id ASC',
        [id]
      );
      const messages: Message[] = msgRows.map(msg => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
        metadata: safeJsonParse(msg.metadata_json, {})
      }));

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
      const rows = agentId
        ? queryAll<any>(db, 'SELECT * FROM conversations WHERE agent_id = ? ORDER BY updated_at DESC', [agentId])
        : queryAll<any>(db, 'SELECT * FROM conversations ORDER BY updated_at DESC');
      return rows.map(conv => ({
        id: conv.id,
        agentId: conv.agent_id,
        title: conv.title,
        messages: [],
        checkpoints: [],
        variables: safeJsonParse(conv.variables_json, {}),
        createdAt: conv.created_at,
        updatedAt: conv.updated_at
      }));
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

export const sessionManager = new SessionManager();
