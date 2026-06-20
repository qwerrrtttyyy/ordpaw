import { v4 as uuidv4 } from 'uuid';
import type { Checkpoint } from '@ordpaw/shared';
import { getDatabase, saveDatabase } from '../db/index.js';
import { eventBus } from './event-bus.js';

export class CheckpointManager {
  createCheckpoint(conversationId: string, messageId: string, label?: string): Checkpoint | null {
    try {
      const db = getDatabase();

      const convResult = db.exec('SELECT * FROM conversations WHERE id = ?', [conversationId]);
      if (convResult.length === 0 || convResult[0].values.length === 0) {
        return null;
      }

      const convRow = convResult[0].values[0];
      const convColumns = convResult[0].columns;
      const conversation: any = {};
      convColumns.forEach((col, idx) => {
        conversation[col] = convRow[idx];
      });

      // 获取当前会话的所有消息
      const msgResult = db.exec(
        'SELECT * FROM messages WHERE conversation_id = ? ORDER BY "timestamp" ASC',
        [conversationId]
      );
      const messages: any[] = [];

      if (msgResult.length > 0) {
        const msgColumns = msgResult[0].columns;
        msgResult[0].values.forEach(row => {
          const msg: any = {};
          msgColumns.forEach((col, idx) => {
            msg[col] = row[idx];
          });
          messages.push(msg);
        });
      }

      const state = {
        messages: messages.map(m => ({
          id: m.id,
          role: m.role,
          content: m.content,
          timestamp: m.timestamp,
          metadata: safeJsonParse(m.metadata_json, {})
        })),
        variables: safeJsonParse(conversation.variables_json, {})
      };

      const checkpoint: Checkpoint = {
        id: uuidv4(),
        conversationId,
        messageId,
        state,
        label: label || undefined,
        createdAt: Date.now()
      };

      db.run(`
        INSERT INTO checkpoints (id, conversation_id, message_id, state_json, label, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [
        checkpoint.id,
        checkpoint.conversationId,
        checkpoint.messageId,
        JSON.stringify(checkpoint.state),
        checkpoint.label || null,
        checkpoint.createdAt
      ]);

      saveDatabase();
      eventBus.emit('checkpoint:created', checkpoint);

      return checkpoint;
    } catch (err) {
      console.error('createCheckpoint 错误:', err);
      return null;
    }
  }

  getCheckpoints(conversationId: string): Checkpoint[] {
    try {
      const db = getDatabase();
      const result = db.exec(
        'SELECT * FROM checkpoints WHERE conversation_id = ? ORDER BY created_at ASC',
        [conversationId]
      );

      if (result.length === 0) return [];

      const columns = result[0].columns;
      return result[0].values.map(row => {
        const cp: any = {};
        columns.forEach((col, idx) => {
          cp[col] = row[idx];
        });
        return {
          id: cp.id,
          conversationId: cp.conversation_id,
          messageId: cp.message_id,
          state: safeJsonParse(cp.state_json, { messages: [], variables: {} }),
          label: cp.label,
          createdAt: cp.created_at
        };
      });
    } catch (err) {
      console.error('getCheckpoints 错误:', err);
      return [];
    }
  }

  rollbackToCheckpoint(conversationId: string, checkpointId: string): boolean {
    try {
      const db = getDatabase();
      const result = db.exec(
        'SELECT * FROM checkpoints WHERE id = ? AND conversation_id = ?',
        [checkpointId, conversationId]
      );

      if (result.length === 0 || result[0].values.length === 0) {
        return false;
      }

      const cpRow = result[0].values[0];
      const cpColumns = result[0].columns;
      const checkpoint: any = {};
      cpColumns.forEach((col, idx) => {
        checkpoint[col] = cpRow[idx];
      });

      const state = safeJsonParse<{ messages: any[]; variables: any }>(checkpoint.state_json, { messages: [], variables: {} });
      const lastMessage = state.messages && state.messages.length > 0 ? state.messages[state.messages.length - 1] : null;
      const lastTimestamp = lastMessage ? (lastMessage.timestamp || 0) : 0;

      // 删除检查点之后的消息
      db.run(
        'DELETE FROM messages WHERE conversation_id = ? AND "timestamp" > ?',
        [conversationId, lastTimestamp]
      );

      // 恢复变量
      db.run(
        'UPDATE conversations SET variables_json = ?, updated_at = ? WHERE id = ?',
        [JSON.stringify(state.variables || {}), Date.now(), conversationId]
      );

      saveDatabase();
      eventBus.emit('checkpoint:rollback', { conversationId, checkpointId });
      return true;
    } catch (err) {
      console.error('rollbackToCheckpoint 错误:', err);
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

export const checkpointManager = new CheckpointManager();
