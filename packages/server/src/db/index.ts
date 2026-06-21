import initSqlJs, { Database } from 'sql.js';
import { mkdirSync, writeFileSync, existsSync, renameSync, readFileSync, copyFileSync, statSync, unlinkSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { createLogger } from '../core/logger.js';

const dbLogger = createLogger('db');

let db: Database | null = null;
let saveTimer: NodeJS.Timeout | null = null;
let dirty = false;
let currentDataDir: string = '';
let currentDbPath: string = '';
let currentTempPath: string = '';
let currentLegacyPath: string = '';
let currentBackupDir: string = '';

const DEBOUNCE_MS = 500;

export interface DataPaths {
  dataDir: string;
  dbPath: string;
  tempPath: string;
  legacyPath: string;
  backupDir: string;
}

function resolvePaths(dataDir: string): DataPaths {
  return {
    dataDir,
    dbPath: join(dataDir, 'ordpaw.db'),
    tempPath: join(dataDir, 'ordpaw.db.tmp'),
    legacyPath: join(dataDir, 'agent-studio.db'),
    backupDir: join(dataDir, 'backups'),
  };
}

/**
 * 显式设置数据目录（由 CLI / 安装脚本通过 ORDPAW_DATA_DIR 环境变量注入）
 * 必须在 initDatabase() 之前调用。
 */
export function setDataDir(dir: string): DataPaths {
  const resolved = resolvePaths(dir);
  mkdirSync(resolved.dataDir, { recursive: true });
  mkdirSync(resolved.backupDir, { recursive: true });
  currentDataDir = resolved.dataDir;
  currentDbPath = resolved.dbPath;
  currentTempPath = resolved.tempPath;
  currentLegacyPath = resolved.legacyPath;
  currentBackupDir = resolved.backupDir;
  return resolved;
}

export function getDataPaths(): DataPaths {
  if (!currentDataDir) {
    return setDataDir(join(process.cwd(), 'data'));
  }
  return resolvePaths(currentDataDir);
}

export async function initDatabase(): Promise<Database> {
  if (!currentDataDir) {
    // Default: ./data in the current working directory.
    setDataDir(join(process.cwd(), 'data'));
  }
  const paths = getDataPaths();

  const SQL = await initSqlJs();

  if (existsSync(paths.dbPath)) {
    try {
      const buffer = readFileSync(paths.dbPath);
      db = new SQL.Database(buffer);
    } catch (err) {
      dbLogger.error('数据库文件读取失败，创建新数据库:', err);
      db = new SQL.Database();
    }
  } else if (existsSync(paths.legacyPath)) {
    // Migrate legacy DB file (project was renamed from Agent Studio → OrdPaw)
    try {
      const buffer = readFileSync(paths.legacyPath);
      db = new SQL.Database(buffer);
      dbLogger.info('已加载旧版 agent-studio.db，将写入新的 ordpaw.db');
    } catch (err) {
      dbLogger.error('旧数据库文件读取失败，创建新数据库:', err);
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

    CREATE TABLE IF NOT EXISTS mcp_servers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      transport TEXT NOT NULL CHECK(transport IN ('stdio','sse','websocket')),
      command TEXT,
      url TEXT,
      env_json TEXT DEFAULT '{}',
      enabled INTEGER DEFAULT 1,
      connected INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS installed_skills (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT DEFAULT '',
      parameters_json TEXT DEFAULT '{}',
      code TEXT NOT NULL,
      source TEXT DEFAULT 'user' CHECK(source IN ('builtin','user')),
      enabled INTEGER DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS plugin_storage (
      plugin_name TEXT NOT NULL,
      key TEXT NOT NULL,
      value_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (plugin_name, key)
    );

    CREATE TABLE IF NOT EXISTS schema_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_checkpoints_conv ON checkpoints(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_conversations_agent ON conversations(agent_id);
  `;

  try {
    db.exec(schema);
  } catch (err) {
    dbLogger.error('数据库初始化失败:', err);
    throw err;
  }

  // 迁移：为旧版 agents 表添加 provider_id 字段
  try {
    db.run("ALTER TABLE agents ADD COLUMN provider_id TEXT DEFAULT 'openai'");
  } catch {
    // 字段已存在，忽略
  }

  // 记录当前 schema 版本
  try {
    db.run(
      'INSERT OR REPLACE INTO schema_meta (key, value, updated_at) VALUES (?, ?, ?)',
      ['schema_version', '1', Date.now()]
    );
  } catch {
    // ignore
  }

  // 立即保存一次以确保表结构持久化
  flushSave();

  return db;
}

/**
 * 立即写入数据库（原子：先写 .tmp 再 rename）
 */
function flushSave() {
  if (!db) return;
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    mkdirSync(dirname(currentDbPath), { recursive: true });
    // 写入临时文件，然后原子重命名
    writeFileSync(currentTempPath, buffer);
    renameSync(currentTempPath, currentDbPath);
    dirty = false;
  } catch (err) {
    dbLogger.error('数据库保存失败:', err);
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

// ================== 备份与恢复 ==================

export interface BackupEntry {
  filename: string;
  path: string;
  size: number;
  createdAt: number;
  schemaVersion: string;
}

export function listBackups(): BackupEntry[] {
  const paths = getDataPaths();
  if (!existsSync(paths.backupDir)) return [];
  const files = readdirSync(paths.backupDir)
    .filter(f => f.startsWith('ordpaw-') && f.endsWith('.db'))
    .sort()
    .reverse();

  return files.map(f => {
    const fullPath = join(paths.backupDir, f);
    const stat = statSync(fullPath);
    return {
      filename: f,
      path: fullPath,
      size: stat.size,
      createdAt: stat.mtimeMs,
      schemaVersion: parseBackupName(f).version,
    };
  });
}

function parseBackupName(filename: string): { timestamp: number; version: string } {
  // ordpaw-2026-06-21T12-30-00-v1.db
  const m = filename.match(/^ordpaw-(\d{4}-\d{2}-\d{2}T[\d-]+)-v(\d+)\.db$/);
  if (!m) return { timestamp: 0, version: '0' };
  const ts = Date.parse(m[1].replace(/-/g, (s, i) => (i > 9 ? ':' : s)));
  return { timestamp: isNaN(ts) ? 0 : ts, version: m[2] };
}

export function createBackup(opts: { label?: string; maxKeep?: number } = {}): BackupEntry {
  flushDatabaseSync();
  const paths = getDataPaths();
  if (!existsSync(paths.dbPath)) {
    throw new Error('数据库文件不存在，无法备份');
  }

  const schemaVersion = getSchemaVersion();
  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, '-').replace(/-\d{3}Z$/, '');
  const suffix = opts.label ? `-${sanitizeLabel(opts.label)}` : '';
  const filename = `ordpaw-${stamp}-v${schemaVersion}${suffix}.db`;
  const dest = join(paths.backupDir, filename);

  // 原子复制
  copyFileSync(paths.dbPath, dest);
  const stat = statSync(dest);
  const entry: BackupEntry = {
    filename,
    path: dest,
    size: stat.size,
    createdAt: stat.mtimeMs,
    schemaVersion,
  };

  // 备份轮转：默认保留最近 10 个
  const maxKeep = opts.maxKeep ?? 10;
  rotateBackups(maxKeep);

  dbLogger.info(`已创建备份: ${filename} (${stat.size} bytes)`);
  return entry;
}

function sanitizeLabel(label: string): string {
  return label.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 32);
}

function getSchemaVersion(): string {
  if (!db) return '0';
  try {
    const result = db.exec('SELECT value FROM schema_meta WHERE key = ?', ['schema_version']);
    if (result.length > 0 && result[0].values.length > 0) {
      return String(result[0].values[0][0]);
    }
  } catch {
    // schema_meta table might not exist in legacy DB
  }
  return '1';
}

function rotateBackups(maxKeep: number) {
  if (maxKeep <= 0) return;
  const all = listBackups();
  for (const old of all.slice(maxKeep)) {
    try {
      unlinkSync(old.path);
      dbLogger.info(`已清理旧备份: ${old.filename}`);
    } catch (err) {
      dbLogger.warn(`清理备份失败: ${old.filename}`, err);
    }
  }
}

export function restoreBackup(filename: string): { success: boolean; message: string } {
  const paths = getDataPaths();
  const src = join(paths.backupDir, filename);
  if (!existsSync(src)) {
    throw new Error(`备份文件不存在: ${filename}`);
  }

  // 先创建当前数据的安全备份（防回滚丢失）
  let safetyBackup: BackupEntry | null = null;
  if (existsSync(paths.dbPath)) {
    safetyBackup = createBackup({ label: 'pre-restore' });
  }

  // 关闭并替换 DB
  try {
    flushDatabaseSync();
    // 清空内存中的 db 引用，并清除 temp 残留
    db = null;
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    if (existsSync(paths.tempPath)) {
      try { unlinkSync(paths.tempPath); } catch { /* ignore */ }
    }

    // 原子替换
    copyFileSync(src, paths.dbPath);
    dbLogger.info(`已从备份恢复: ${filename}`);
  } catch (err) {
    dbLogger.error('恢复失败:', err);
    throw err;
  }

  return {
    success: true,
    message: `已恢复到 ${filename}` + (safetyBackup ? `（已自动创建安全备份 ${safetyBackup.filename}）` : ''),
  };
}

/**
 * 重新加载数据库（用于 restore 后让运行中的进程拾起新数据）
 */
export async function reloadDatabase(): Promise<Database> {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  db = null;
  return initDatabase();
}

export function deleteBackup(filename: string): boolean {
  const paths = getDataPaths();
  const src = join(paths.backupDir, filename);
  if (!existsSync(src)) return false;
  try {
    unlinkSync(src);
    dbLogger.info(`已删除备份: ${filename}`);
    return true;
  } catch (err) {
    dbLogger.error(`删除备份失败: ${filename}:`, err);
    return false;
  }
}

/**
 * 在进程退出前保存（不调用 process.exit，避免与上层优雅关闭逻辑冲突）
 */
function setupAutoSave() {
  const cleanup = () => {
    if (dirty) {
      flushSave();
    }
  };
  process.on('beforeExit', cleanup);
  process.on('exit', cleanup);
}

setupAutoSave();

export default {
  initDatabase,
  saveDatabase,
  flushDatabaseSync,
  getDatabase,
  setDataDir,
  getDataPaths,
  listBackups,
  createBackup,
  restoreBackup,
  deleteBackup,
};
