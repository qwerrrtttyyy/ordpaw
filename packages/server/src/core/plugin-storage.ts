import type { PluginStorageEntry } from '@ordpaw/shared';
import { getDatabase, saveDatabase } from '../db/index.js';
import { queryAll, queryOne } from '../db/utils.js';

export class PluginStorage {
  get(pluginName: string, key: string): any | undefined {
    const db = getDatabase();
    const row = queryOne<{ value_json: string }>(
      db,
      'SELECT value_json FROM plugin_storage WHERE plugin_name = ? AND key = ?',
      [pluginName, key]
    );
    if (!row) return undefined;
    try {
      return JSON.parse(row.value_json);
    } catch {
      return undefined;
    }
  }

  set(pluginName: string, key: string, value: any): void {
    const db = getDatabase();
    const now = Date.now();
    db.run(
      `INSERT INTO plugin_storage (plugin_name, key, value_json, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(plugin_name, key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
      [pluginName, key, JSON.stringify(value), now]
    );
    saveDatabase();
  }

  delete(pluginName: string, key: string): boolean {
    const db = getDatabase();
    const before = db.exec(
      'SELECT 1 FROM plugin_storage WHERE plugin_name = ? AND key = ?',
      [pluginName, key]
    );
    if (before.length === 0 || before[0].values.length === 0) return false;
    db.run('DELETE FROM plugin_storage WHERE plugin_name = ? AND key = ?', [pluginName, key]);
    saveDatabase();
    return true;
  }

  list(pluginName: string): PluginStorageEntry[] {
    const db = getDatabase();
    const rows = queryAll<{ key: string; value_json: string; updated_at: number }>(
      db,
      'SELECT key, value_json, updated_at FROM plugin_storage WHERE plugin_name = ? ORDER BY key',
      [pluginName]
    );
    return rows.map(row => ({
      key: row.key,
      value: JSON.parse(row.value_json),
      updatedAt: row.updated_at,
    }));
  }

  clear(pluginName: string): void {
    const db = getDatabase();
    db.run('DELETE FROM plugin_storage WHERE plugin_name = ?', [pluginName]);
    saveDatabase();
  }
}

export const pluginStorage = new PluginStorage();
