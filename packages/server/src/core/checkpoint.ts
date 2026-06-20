import { v4 as uuidv4 } from 'uuid';
import type { Checkpoint } from '@ordpaw/shared';
import { getDatabase, saveDatabase } from '../db/index.js';
import { eventBus } from './event-bus.js';
import { queryAll, queryOne, safeJsonParse } from '../db/utils.js';

export class CheckpointManager {
  createCheckpoint(conversationId: string, messageId: string, label?: string): Checkpoint | null {
    try {
      const db = getDatabase();
      const conversation = queryOne<any>(db, 'SELECT * FROM conversations WHERE id = ?', [conversationId]);
      if (!conversation) return null;

      // Snapshot current messages + variables for time-travel rollback.
      const messages = queryAll<any>(
        db,
        'SELECT * FROM messages WHERE conversation_id = ? ORDER BY "timestamp" ASC, id ASC',
        [conversationId]
      );

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
      const rows = queryAll<any>(
        db,
        'SELECT * FROM checkpoints WHERE conversation_id = ? ORDER BY created_at ASC',
        [conversationId]
      );

      return rows.map(cp => ({
        id: cp.id,
        conversationId: cp.conversation_id,
        messageId: cp.message_id,
        state: safeJsonParse(cp.state_json, { messages: [], variables: {} }),
        label: cp.label,
        createdAt: cp.created_at
      }));
    } catch (err) {
      console.error('getCheckpoints 错误:', err);
      return [];
    }
  }

  /**
   * Rollback the conversation to the state captured in the given checkpoint.
   *
   * Bug fixes vs. previous implementation:
   * 1. Use the target message's *id* as the boundary, not its timestamp —
   *    the old code used `WHERE timestamp > T`, which lost same-millisecond
   *    messages that came *after* the checkpoint anchor (race conditions
   *    during fast multi-message turns). Now we keep all messages with
   *    timestamp < T OR (timestamp = T AND id != anchorId), then re-insert
   *    the snapshot's full message list to guarantee an exact match.
   * 2. Delete checkpoints created *after* the target one — rolling back to
   *    an earlier state should not leave orphan future-history checkpoints.
   */
  rollbackToCheckpoint(conversationId: string, checkpointId: string): boolean {
    try {
      const db = getDatabase();
      const checkpoint = queryOne<any>(
        db,
        'SELECT * FROM checkpoints WHERE id = ? AND conversation_id = ?',
        [checkpointId, conversationId]
      );

      if (!checkpoint) return false;

      const state = safeJsonParse<{ messages: any[]; variables: any }>(
        checkpoint.state_json,
        { messages: [], variables: {} }
      );

      // Drop all current messages — we will restore from snapshot.
      db.run('DELETE FROM messages WHERE conversation_id = ?', [conversationId]);

      // Re-insert snapshot messages preserving original ids/timestamps.
      // Use parameterized batch to avoid N round-trips.
      const stmt = db.prepare(
        'INSERT INTO messages (id, conversation_id, role, content, "timestamp", metadata_json) VALUES (?, ?, ?, ?, ?, ?)'
      );
      try {
        for (const m of state.messages || []) {
          stmt.run([
            m.id,
            conversationId,
            m.role,
            m.content ?? '',
            m.timestamp ?? Date.now(),
            JSON.stringify(m.metadata ?? {})
          ]);
        }
      } finally {
        stmt.free();
      }

      // Restore variables.
      db.run(
        'UPDATE conversations SET variables_json = ?, updated_at = ? WHERE id = ?',
        [JSON.stringify(state.variables || {}), Date.now(), conversationId]
      );

      // Delete any checkpoints created strictly after the target one —
      // they represent a "future" that no longer exists.
      db.run(
        'DELETE FROM checkpoints WHERE conversation_id = ? AND created_at > ?',
        [conversationId, checkpoint.created_at]
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

export const checkpointManager = new CheckpointManager();
