import { v4 as uuidv4 } from 'uuid';
import type { Provider, ModelInfo, CreateProviderRequest } from '@ordpaw/shared';
import { getDatabase, saveDatabase } from '../db/index.js';
import { queryAll, queryOne, safeJsonParse } from '../db/utils.js';
import { obfuscateApiKey, deobfuscateApiKey } from './api-key-crypto.js';

const BUILT_IN_PROVIDERS: Omit<Provider, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: 'OpenAI',
    type: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    apiKeyName: 'openai',
    apiKey: '',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' }
    ],
    enabled: true,
    isBuiltIn: true
  },
  {
    name: 'Anthropic',
    type: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    apiKeyName: 'anthropic',
    apiKey: '',
    models: [
      { id: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet' },
      { id: 'claude-3-opus', name: 'Claude 3 Opus' },
      { id: 'claude-3-haiku', name: 'Claude 3 Haiku' }
    ],
    enabled: true,
    isBuiltIn: true
  },
  {
    name: 'Ollama',
    type: 'ollama',
    baseUrl: 'http://localhost:11434',
    apiKeyName: '',
    apiKey: '',
    models: [
      { id: 'llama3', name: 'Llama 3' },
      { id: 'mistral', name: 'Mistral' },
      { id: 'qwen2', name: 'Qwen 2' }
    ],
    enabled: true,
    isBuiltIn: true
  }
];

export class ProviderService {
  init() {
    this.ensureBuiltIns();
  }

  listProviders(): Provider[] {
    try {
      const db = getDatabase();
      const rows = queryAll<any>(db, 'SELECT * FROM providers ORDER BY is_built_in DESC, name ASC');
      return rows.map(row => this.rowToProvider(row));
    } catch (err) {
      console.error('listProviders 错误:', err);
      return [];
    }
  }

  getProvider(idOrType: string): Provider | null {
    try {
      const db = getDatabase();
      let row = queryOne<any>(db, 'SELECT * FROM providers WHERE id = ?', [idOrType]);
      if (!row) row = queryOne<any>(db, 'SELECT * FROM providers WHERE type = ? LIMIT 1', [idOrType]);
      if (!row) row = queryOne<any>(db, 'SELECT * FROM providers WHERE name = ? LIMIT 1', [idOrType]);
      return row ? this.rowToProvider(row) : null;
    } catch (err) {
      console.error('getProvider 错误:', err);
      return null;
    }
  }

  getProviderByName(name: string): Provider | null {
    try {
      const db = getDatabase();
      const row = queryOne<any>(db, 'SELECT * FROM providers WHERE name = ?', [name]);
      return row ? this.rowToProvider(row) : null;
    } catch (err) {
      console.error('getProviderByName 错误:', err);
      return null;
    }
  }

  createProvider(data: CreateProviderRequest): Provider {
    const db = getDatabase();
    const now = Date.now();
    const id = uuidv4();
    const safeName = (data.name || '自定义服务商').toString();
    const safeType = (data.type || 'custom').toString();
    const safeBaseUrl = (data.baseUrl || '').toString();
    // Obfuscate before storing so the DB never holds plaintext keys.
    const safeApiKey = obfuscateApiKey((data.apiKey || '').toString());
    const safeApiKeyName = (data.apiKeyName || '').toString();
    const models = Array.isArray(data.models) ? data.models : [];
    const config = data.config || {};

    db.run(`
      INSERT INTO providers (id, name, type, base_url, api_key, api_key_name, models_json, enabled, is_built_in, config_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?, ?)
    `, [id, safeName, safeType, safeBaseUrl, safeApiKey, safeApiKeyName, JSON.stringify(models), JSON.stringify(config), now, now]);

    saveDatabase();
    return this.getProvider(id)!;
  }

  updateProvider(id: string, data: Partial<Provider>): Provider | null {
    const provider = this.getProvider(id);
    if (!provider) return null;

    const db = getDatabase();
    const updates: string[] = [];
    const params: any[] = [];

    if (data.name !== undefined) {
      updates.push('name = ?');
      params.push(data.name.toString());
    }
    if (data.baseUrl !== undefined) {
      updates.push('base_url = ?');
      params.push(data.baseUrl.toString());
    }
    if (data.apiKey !== undefined) {
      updates.push('api_key = ?');
      // Obfuscate before storing.
      params.push(obfuscateApiKey((data.apiKey || '').toString()));
    }
    if (data.apiKeyName !== undefined) {
      updates.push('api_key_name = ?');
      params.push(data.apiKeyName.toString());
    }
    if (data.models !== undefined) {
      updates.push('models_json = ?');
      params.push(JSON.stringify(data.models));
    }
    if (data.enabled !== undefined) {
      updates.push('enabled = ?');
      params.push(data.enabled ? 1 : 0);
    }
    if (data.config !== undefined) {
      updates.push('config_json = ?');
      params.push(JSON.stringify(data.config));
    }

    if (updates.length > 0) {
      updates.push('updated_at = ?');
      params.push(Date.now());
      params.push(id);
      db.run(`UPDATE providers SET ${updates.join(', ')} WHERE id = ?`, params);
      saveDatabase();
    }

    return this.getProvider(id);
  }

  deleteProvider(id: string): boolean {
    try {
      const db = getDatabase();
      const existing = db.exec('SELECT id FROM providers WHERE id = ? AND is_built_in = 0', [id]);
      if (existing.length === 0 || existing[0].values.length === 0) return false;
      db.run('DELETE FROM providers WHERE id = ?', [id]);
      saveDatabase();
      return true;
    } catch (err) {
      console.error('deleteProvider 错误:', err);
      return false;
    }
  }

  getModels(providerId: string): ModelInfo[] {
    const provider = this.getProvider(providerId);
    return provider?.models || [];
  }

  private ensureBuiltIns() {
    const existing = this.listProviders();
    const existingNames = new Set(existing.map(p => p.name));

    for (const builtIn of BUILT_IN_PROVIDERS) {
      if (existingNames.has(builtIn.name)) continue;
      const db = getDatabase();
      const now = Date.now();
      const id = uuidv4();
      db.run(`
        INSERT INTO providers (id, name, type, base_url, api_key, api_key_name, models_json, enabled, is_built_in, config_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
      `, [id, builtIn.name, builtIn.type, builtIn.baseUrl || '', builtIn.apiKey || '', builtIn.apiKeyName || '', JSON.stringify(builtIn.models), builtIn.enabled ? 1 : 0, JSON.stringify(builtIn.config || {}), now, now]);
    }

    saveDatabase();
  }

  private rowToProvider(p: any): Provider {
    return {
      id: p.id,
      name: p.name,
      type: p.type,
      baseUrl: p.base_url || undefined,
      apiKeyName: p.api_key_name || undefined,
      // Deobfuscate on read so callers (agentRuntime) get the real key.
      apiKey: deobfuscateApiKey(p.api_key) || undefined,
      models: safeJsonParse(p.models_json, []),
      enabled: p.enabled === 1,
      isBuiltIn: p.is_built_in === 1,
      config: safeJsonParse(p.config_json, {}),
      createdAt: p.created_at,
      updatedAt: p.updated_at
    };
  }
}

export const providerService = new ProviderService();
