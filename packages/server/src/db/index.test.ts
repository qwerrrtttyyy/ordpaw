import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync, readFileSync, writeFileSync, statSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  setDataDir,
  getDataPaths,
  initDatabase,
  getDatabase,
  saveDatabase,
  flushDatabaseSync,
  createBackup,
  listBackups,
  restoreBackup,
  deleteBackup,
  reloadDatabase,
} from './index.js';

function makeTmpDataDir(): string {
  const dir = join(tmpdir(), `ordpaw-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('setDataDir / getDataPaths', () => {
  it('creates data and backup dirs and resolves paths', () => {
    const dir = makeTmpDataDir();
    try {
      const paths = setDataDir(dir);
      expect(existsSync(paths.dataDir)).toBe(true);
      expect(existsSync(paths.backupDir)).toBe(true);
      expect(paths.dbPath).toBe(join(dir, 'ordpaw.db'));
      expect(paths.backupDir).toBe(join(dir, 'backups'));
      const current = getDataPaths();
      expect(current.dataDir).toBe(paths.dataDir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('initDatabase / saveDatabase', () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = makeTmpDataDir();
    setDataDir(dataDir);
    await initDatabase();
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('persists writes to disk', async () => {
    const db = getDatabase();
    const id = 'test-agent-' + Date.now();
    const now = Date.now();
    db.run(
      'INSERT INTO agents (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)',
      [id, 'Test Agent', now, now]
    );
    flushDatabaseSync();
    expect(existsSync(join(dataDir, 'ordpaw.db'))).toBe(true);
    const stat = statSync(join(dataDir, 'ordpaw.db'));
    expect(stat.size).toBeGreaterThan(0);
  });

  it('writes to .tmp then renames atomically', () => {
    const db = getDatabase();
    db.run('INSERT INTO agents (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)',
      ['atomic-1', 'Atomic', Date.now(), Date.now()]);
    flushDatabaseSync();
    expect(existsSync(join(dataDir, 'ordpaw.db'))).toBe(true);
    expect(existsSync(join(dataDir, 'ordpaw.db.tmp'))).toBe(false);
  });

  it('records schema version', () => {
    const db = getDatabase();
    const result = db.exec('SELECT value FROM schema_meta WHERE key = ?', ['schema_version']);
    expect(result.length).toBe(1);
    expect(result[0].values[0][0]).toBe('1');
  });
});

describe('createBackup / listBackups', () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = makeTmpDataDir();
    setDataDir(dataDir);
    await initDatabase();
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('creates a backup file with timestamp in name', () => {
    const db = getDatabase();
    db.run('INSERT INTO agents (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)',
      ['bk-1', 'Backup Test', Date.now(), Date.now()]);
    saveDatabase();
    flushDatabaseSync();

    const entry = createBackup();
    expect(existsSync(entry.path)).toBe(true);
    expect(entry.filename).toMatch(/^ordpaw-\d{4}-\d{2}-\d{2}T[\d-]+-v\d+\.db$/);
    expect(entry.size).toBeGreaterThan(0);
  });

  it('lists backups in reverse-chronological order', () => {
    const db = getDatabase();
    db.run('INSERT INTO agents (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)',
      ['bk-list', 'A', Date.now(), Date.now()]);
    flushDatabaseSync();
    createBackup();
    createBackup({ label: 'second' });
    const list = listBackups();
    expect(list.length).toBeGreaterThanOrEqual(2);
    expect(list[0].filename >= list[1].filename).toBe(true);
  });

  it('rotates old backups when maxKeep is exceeded', async () => {
    const db = getDatabase();
    db.run('INSERT INTO agents (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)',
      ['rot-1', 'R', Date.now(), Date.now()]);
    flushDatabaseSync();

    const b1 = createBackup({ label: 'one' });
    await new Promise(r => setTimeout(r, 1100));
    const b2 = createBackup({ label: 'two' });
    await new Promise(r => setTimeout(r, 1100));
    const b3 = createBackup({ label: 'three' });

    expect(b1.filename).not.toBe(b2.filename);
    expect(b2.filename).not.toBe(b3.filename);
    expect(listBackups().length).toBe(3);

    const before = listBackups().length;
    createBackup({ label: 'four', maxKeep: 2 });
    const after = listBackups().length;
    expect(after).toBeLessThan(before);
    expect(after).toBe(2);
  });
});

describe('restoreBackup', () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = makeTmpDataDir();
    setDataDir(dataDir);
    await initDatabase();
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('restores a previous snapshot', async () => {
    const db = getDatabase();
    const now = Date.now();
    db.run('INSERT INTO agents (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)',
      ['r-1', 'Original', now, now]);
    flushDatabaseSync();

    const backup = createBackup({ label: 'snapshot' });

    // 再次写入
    db.run('INSERT INTO agents (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)',
      ['r-2', 'Newer', now, now]);
    flushDatabaseSync();

    const result = restoreBackup(backup.filename);
    expect(result.success).toBe(true);

    // 重新加载数据库
    await reloadDatabase();
    const db2 = getDatabase();
    const check = db2.exec("SELECT id FROM agents WHERE id = 'r-1'");
    expect(check.length).toBe(1);

    // restore 已经创建了 pre-restore 备份
    const all = listBackups();
    const safetyBackup = all.find(b => b.filename.includes('pre-restore'));
    expect(safetyBackup).toBeDefined();
  });

  it('throws for unknown backup', () => {
    expect(() => restoreBackup('nonexistent.db')).toThrow();
  });

  it('deletes backup', () => {
    const db = getDatabase();
    db.run('INSERT INTO agents (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)',
      ['d-1', 'D', Date.now(), Date.now()]);
    flushDatabaseSync();
    const entry = createBackup();
    const ok = deleteBackup(entry.filename);
    expect(ok).toBe(true);
    expect(existsSync(entry.path)).toBe(false);
  });
});
