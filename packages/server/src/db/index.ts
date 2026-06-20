import initSqlJs, { Database } from 'sql.js';
import { mkdirSync, writeFileSync, existsSync, renameSync, readFileSync } from 'fs';
import { join } from 'path';

const dataDir = join(process.cwd(), 'data');
mkdirSync(dataDir, { recursive: true });

const dbPath = join(dataDir, 'ordpaw.db');
const tempDbPath = join(dataDir, 'ordpaw.db.tmp');
const legacyDbPath = join(dataDir, 'agent-studio.db');

let db: Database | null = null;
let saveTimer: NodeJS.Timeout | null = null;
let dirty = false;

const DEBOUNCE_MS = 500;

export async function initDatabase(): Promise<Database> {
  const SQL = await initSqlJs();

  if (existsSync(dbPath)) {
    try {
      const buffer = readFileSync(dbPath);
      db = new SQL.Database(buffer);
    } catch (err) {
      console.error('数据库文件读取失败，创建新数据库:', err);
      db = new SQL.Database();
    }
  } else if (existsSync(legacyDbPath)) {
    // Migrate legacy DB file (project was renamed from Agent Studio → OrdPaw)
    try {
      const buffer = readFileSync(legacyDbPath);
      db = new SQL.Database(buffer);
      console.log('📦 已加载旧版 agent-studio.db，将写入新的 ordpaw.db');
    } catch (err) {
      console.error('旧数据库文件读取失败，创建新数据库:', err);
      db = new SQL.Database();
    }
  } else {
    db = new SQL.Database();
  }

  // 初始化表结构
  const schema = `
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      system_prompt TEXT DEFAULT '',
      provider_id TEXT DEFAULT 'openai',
      model TEXT DEFAULT 'gpt-4',
      skills_json TEXT DEFAULT '[]',
      mcp_json TEXT DEFAULT '[]',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS providers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      base_url TEXT,
      api_key_name TEXT,
      api_key TEXT,
      models_json TEXT NOT NULL,
      enabled INTEGER DEFAULT 1,
      is_built_in INTEGER DEFAULT 0,
      config_json TEXT DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS test_suites (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS test_cases (
      id TEXT PRIMARY KEY,
      suite_id TEXT NOT NULL REFERENCES test_suites(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      input TEXT NOT NULL,
      expected_output TEXT,
      expected_contains_json TEXT DEFAULT '[]',
      variables_json TEXT DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS test_runs (
      id TEXT PRIMARY KEY,
      suite_id TEXT NOT NULL REFERENCES test_suites(id) ON DELETE CASCADE,
      agent_id TEXT NOT NULL,
      results_json TEXT NOT NULL,
      passed INTEGER DEFAULT 0,
      failed INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS components (
      id TEXT PRIMARY KEY,
      plugin_name TEXT NOT NULL,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      src TEXT NOT NULL,
      slot TEXT,
      metadata_json TEXT DEFAULT '{}',
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      title TEXT NOT NULL DEFAULT '新会话',
      variables_json TEXT DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('user','assistant','system','tool')),
      content TEXT NOT NULL,
      metadata_json TEXT DEFAULT '{}',
      "timestamp" INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS checkpoints (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      message_id TEXT NOT NULL REFERENCES messages(id),
      state_json TEXT NOT NULL,
      label TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS plugins (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      version TEXT NOT NULL,
      description TEXT DEFAULT '',
      manifest_json TEXT NOT NULL,
      config_json TEXT DEFAULT '{}',
      state TEXT DEFAULT 'loaded',
      enabled INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS prompts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT DEFAULT '通用',
      content TEXT NOT NULL,
      variables_json TEXT DEFAULT '[]',
      version INTEGER DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS scripts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT DEFAULT '',
      code TEXT NOT NULL,
      language TEXT DEFAULT 'javascript',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_checkpoints_conv ON checkpoints(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_conversations_agent ON conversations(agent_id);
  `;

  try {
    db.exec(schema);
  } catch (err) {
    console.error('数据库初始化失败:', err);
    throw err;
  }

  // 迁移：为旧版 agents 表添加 provider_id 字段
  try {
    db.run("ALTER TABLE agents ADD COLUMN provider_id TEXT DEFAULT 'openai'");
  } catch {
    // 字段已存在，忽略
  }

  // 立即保存一次以确保表结构持久化
  flushSave();

  return db;
}

/**
 * 立即写入数据库（带原子性）
 */
function flushSave() {
  if (!db) return;
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    // 写入临时文件，然后原子重命名
    writeFileSync(tempDbPath, buffer);
    renameSync(tempDbPath, dbPath);
    dirty = false;
  } catch (err) {
    console.error('数据库保存失败:', err);
  }
}

/**
 * 防抖保存 - 多次连续写入会合并为一次
 */
export function saveDatabase() {
  dirty = true;
  if (saveTimer) {
    clearTimeout(saveTimer);
  }
  saveTimer = setTimeout(() => {
    flushSave();
    saveTimer = null;
  }, DEBOUNCE_MS);
}

/**
 * 强制立即保存（用于关闭前）
 */
export function flushDatabaseSync() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  flushSave();
}

export function getDatabase(): Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

/**
 * 在进程退出前保存
 */
function setupAutoSave() {
  const cleanup = () => {
    if (dirty) {
      flushSave();
    }
  };
  process.on('beforeExit', cleanup);
  process.on('exit', cleanup);
  process.on('SIGINT', () => {
    cleanup();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    cleanup();
    process.exit(0);
  });
}

setupAutoSave();

export default {
  initDatabase,
  saveDatabase,
  flushDatabaseSync,
  getDatabase
};
