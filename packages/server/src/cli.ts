#!/usr/bin/env node
/**
 * OrdPaw 命令行管理工具
 * 提供：version / backup / restore / status / migrate 等子命令
 * 通过 ORDPAW_DATA_DIR 环境变量隔离数据目录
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { createLogger } from './core/logger.js';
import {
  initDatabase,
  flushDatabaseSync,
  getDataPaths,
  listBackups as dbListBackups,
  createBackup as dbCreateBackup,
  restoreBackup as dbRestoreBackup,
  deleteBackup as dbDeleteBackup,
  setDataDir,
} from './db/index.js';

const logger = createLogger('cli');
const args = process.argv.slice(2);
const command = args[0] || 'help';

// 解析全局选项
function getOpt(name: string, fallback: string = ''): string {
  const idx = args.indexOf(`--${name}`);
  if (idx >= 0 && idx < args.length - 1) return args[idx + 1];
  return process.env[name.toUpperCase().replace(/-/g, '_')] || fallback;
}

// 子命令参数
function subArgs(): string[] {
  const idx = args.findIndex(a => !a.startsWith('--') && a !== command);
  return idx >= 0 ? args.slice(idx) : [];
}

const DEFAULT_DATA_DIR = process.env.ORDPAW_DATA_DIR || join(process.env.HOME || process.cwd(), '.ordpaw', 'data');

function ensureDataDir(): string {
  const dir = getOpt('data-dir', DEFAULT_DATA_DIR);
  setDataDir(dir);
  return dir;
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

async function cmdStatus() {
  const dataDir = ensureDataDir();
  const paths = getDataPaths();
  await initDatabase();

  const pkgPath = join(process.cwd(), 'package.json');
  const pkg = existsSync(pkgPath) ? JSON.parse(readFileSync(pkgPath, 'utf-8')) : {};

  console.log('');
  console.log('🐾 OrdPaw 状态');
  console.log('═══════════════════════════════════════');
  console.log(`  应用版本:   ${pkg.version || 'unknown'}`);
  console.log(`  数据目录:   ${paths.dataDir}`);
  console.log(`  数据库:     ${paths.dbPath} ${existsSync(paths.dbPath) ? '✓' : '✗ (待创建)'}`);
  console.log(`  备份目录:   ${paths.backupDir}`);

  const backups = dbListBackups();
  console.log(`  备份数量:   ${backups.length}`);
  if (backups.length > 0) {
    const totalSize = backups.reduce((s: number, b: { size: number }) => s + b.size, 0);
    console.log(`  备份大小:   ${fmtSize(totalSize)}`);
    console.log(`  最新备份:   ${backups[0].filename}`);
  }
  console.log('');
}

async function cmdBackup() {
  const dataDir = ensureDataDir();
  await initDatabase();

  const label = getOpt('label', '');
  const maxKeepRaw = getOpt('max-keep', '10');
  const maxKeep = parseInt(maxKeepRaw, 10);

  if (!existsSync(getDataPaths().dbPath)) {
    logger.error('数据库文件不存在，无需备份');
    process.exit(1);
  }

  const entry = dbCreateBackup({ label, maxKeep });
  console.log('');
  console.log('✅ 备份已创建');
  console.log(`   文件:   ${entry.filename}`);
  console.log(`   大小:   ${fmtSize(entry.size)}`);
  console.log(`   时间:   ${new Date(entry.createdAt).toISOString()}`);
  console.log(`   路径:   ${entry.path}`);
  console.log('');
}

async function cmdList() {
  ensureDataDir();
  await initDatabase();
  const backups = dbListBackups();
  if (backups.length === 0) {
    console.log('（暂无备份）');
    return;
  }
  console.log('');
  console.log(`${'时间'.padEnd(28)}  ${'大小'.padStart(10)}  文件`);
  console.log('─'.repeat(80));
  for (const b of backups) {
    const ts = new Date(b.createdAt).toISOString().replace('T', ' ').slice(0, 19);
    console.log(`${ts}  ${fmtSize(b.size).padStart(10)}  ${b.filename}`);
  }
  console.log('');
}

async function cmdRestore(filename?: string) {
  if (!filename) {
    const sub = subArgs();
    filename = sub[0];
  }
  if (!filename) {
    logger.error('请指定要恢复的备份文件名');
    console.log('用法: ordpaw restore <filename>');
    process.exit(1);
  }
  ensureDataDir();
  await initDatabase();
  const result = dbRestoreBackup(filename);
  console.log('');
  console.log('✅ 恢复成功');
  console.log(`   ${result.message}`);
  console.log('');
  console.log('请重启 OrdPaw 服务以加载恢复后的数据。');
}

async function cmdDelete(filename?: string) {
  if (!filename) {
    const sub = subArgs();
    filename = sub[0];
  }
  if (!filename) {
    logger.error('请指定要删除的备份文件名');
    process.exit(1);
  }
  ensureDataDir();
  const ok = dbDeleteBackup(filename);
  if (!ok) {
    logger.error(`备份不存在: ${filename}`);
    process.exit(1);
  }
  console.log(`✅ 已删除备份: ${filename}`);
}

async function cmdMigrate() {
  const dataDir = ensureDataDir();
  await initDatabase();
  logger.info('数据库迁移已应用（自动处理 schema 升级）');
}

async function cmdExec() {
  // 内部命令：在数据目录中执行任意 SQL
  const sub = subArgs();
  if (sub.length === 0) {
    logger.error('用法: ordpaw exec <sql>');
    process.exit(1);
  }
  const sql = sub.join(' ');
  ensureDataDir();
  await initDatabase();
  const db = (await import('./db/index.js')).getDatabase();
  const result = db.exec(sql);
  console.log(JSON.stringify(result, null, 2));
}

async function cmdVersion() {
  const pkgPath = join(process.cwd(), 'package.json');
  const pkg = existsSync(pkgPath) ? JSON.parse(readFileSync(pkgPath, 'utf-8')) : {};
  console.log(`ordpaw v${pkg.version || '0.0.0'}`);
}

function help() {
  console.log(`
OrdPaw 命令行管理工具

用法:
  ordpaw <command> [options] [args]

命令:
  status                 显示数据目录、数据库、备份状态
  backup                 创建一次数据库备份
  list                   列出所有备份
  restore <filename>     从指定备份恢复（自动备份当前数据）
  delete <filename>      删除指定备份
  migrate                应用数据库迁移
  version                显示应用版本
  help                   显示此帮助

选项:
  --data-dir <path>      数据目录（默认 \$ORDPAW_DATA_DIR 或 ~/.ordpaw/data）
  --label <name>         备份标签（用于 backup）
  --max-keep <n>         最大保留备份数（默认 10）

环境变量:
  ORDPAW_DATA_DIR        数据目录
`);
}

async function main() {
  try {
    switch (command) {
      case 'status': await cmdStatus(); break;
      case 'backup': await cmdBackup(); break;
      case 'list':
      case 'ls': await cmdList(); break;
      case 'restore': await cmdRestore(); break;
      case 'delete':
      case 'rm': await cmdDelete(); break;
      case 'migrate': await cmdMigrate(); break;
      case 'exec': await cmdExec(); break;
      case 'version':
      case '--version':
      case '-v': await cmdVersion(); break;
      case 'help':
      case '--help':
      case '-h':
      default: help();
    }
  } catch (err: any) {
    logger.error(err.message);
    process.exit(1);
  }
}

main();
