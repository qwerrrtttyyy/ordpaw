import { Router, Request, Response } from 'express';
import { execFile } from 'child_process';
import { mkdirSync, existsSync, writeFileSync, statSync, readdirSync } from 'fs';
import { join, resolve, isAbsolute, relative } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { v4 as uuidv4 } from 'uuid';
import type {
  DownloadItem,
  DownloadTask,
  DownloadResourceType,
  StorageQuota,
} from '@ordpaw/shared';
import { OrdPawError, OrdPawErrorCode } from '@ordpaw/shared/errors';
import { getDatabase } from '../db/index.js';
import { skillRunner } from './skill-runner.js';
import { scriptMcp } from './script-mcp.js';
import { asyncHandler, ApiError, validateBody } from '../middleware.js';
import { queryAll, queryOne, safeJsonParse } from '../db/utils.js';
import { logger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEFAULT_SERVER_MAX_BYTES = 2 * 1024 * 1024 * 1024;

interface ServerTaskRecord {
  task: DownloadTask;
  statusControl: 'running' | 'paused' | 'cancelled';
}

const serverTasks = new Map<string, ServerTaskRecord>();

export function setupDownloadRoutes(router: Router) {
  // 单个资源下载（JSON 元数据/内容）
  router.get(
    '/download/resource',
    asyncHandler(async (req: Request, res: Response) => {
      const type = req.query.type as DownloadResourceType;
      const id = req.query.id as string;
      if (!type) throw ApiError.badRequest('缺少 type 参数');
      const data = await getResourcePayload(type, id);
      res.setHeader('Content-Disposition', `attachment; filename="${data.filename}"`);
      res.type('application/json');
      res.send(Buffer.from(data.content, 'utf-8'));
    })
  );

  // OrdPaw 源码打包下载
  router.get(
    '/download/source',
    asyncHandler(async (_req: Request, res: Response) => {
      const workspaceRoot = getWorkspaceRoot();
      const outPath = join(getServerDownloadDir(), `ordpaw-source-${Date.now()}.tar.gz`);
      mkdirSync(getServerDownloadDir(), { recursive: true });

      await packSourceCode(workspaceRoot, outPath);

      res.setHeader('Content-Disposition', 'attachment; filename="ordpaw-source.tar.gz"');
      res.type('application/gzip');
      res.sendFile(resolve(outPath));
    })
  );

  // 服务端批量下载任务
  router.post(
    '/download/server',
    validateBody<{ items: unknown[]; serverPath: string }>({
      items: 'array',
      serverPath: 'string',
    }),
    asyncHandler(async (req: Request, res: Response) => {
      const { items, serverPath, quota } = req.body || {};
      const targetDir = resolveTargetDirectory(serverPath);
      mkdirSync(targetDir, { recursive: true });

      const task: DownloadTask = {
        id: uuidv4(),
        status: 'pending',
        items: Array.isArray(items) ? items.filter((i) => i && i.id && i.type) : [],
        storage: 'server',
        progress: 0,
        downloadedBytes: 0,
        totalBytes: items.reduce((sum: number, i: DownloadItem) => sum + (i.size || 0), 0),
        serverPath: targetDir,
        storageQuota: quota,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      serverTasks.set(task.id, { task, statusControl: 'running' });

      // 后台执行
      processServerTask(task).catch((err) => {
        logger.error(err, '服务端下载任务失败');
        task.status = 'failed';
        task.error = err instanceof Error ? err.message : '执行失败';
        task.updatedAt = Date.now();
      });

      res.status(201).json({ taskId: task.id });
    })
  );

  router.get(
    '/download/server/:id/status',
    asyncHandler(async (req: Request, res: Response) => {
      const record = serverTasks.get(req.params.id);
      if (!record) throw ApiError.notFound('下载任务不存在');
      res.json(record.task);
    })
  );

  router.post(
    '/download/server/:id/pause',
    asyncHandler(async (req: Request, res: Response) => {
      const record = serverTasks.get(req.params.id);
      if (!record) throw ApiError.notFound('下载任务不存在');
      record.statusControl = 'paused';
      record.task.status = 'paused';
      record.task.updatedAt = Date.now();
      res.json(record.task);
    })
  );

  router.post(
    '/download/server/:id/resume',
    asyncHandler(async (req: Request, res: Response) => {
      const record = serverTasks.get(req.params.id);
      if (!record) throw ApiError.notFound('下载任务不存在');
      record.statusControl = 'running';
      record.task.status = 'running';
      record.task.updatedAt = Date.now();
      res.json(record.task);
    })
  );

  router.post(
    '/download/server/:id/cancel',
    asyncHandler(async (req: Request, res: Response) => {
      const record = serverTasks.get(req.params.id);
      if (!record) throw ApiError.notFound('下载任务不存在');
      record.statusControl = 'cancelled';
      record.task.status = 'cancelled';
      record.task.updatedAt = Date.now();
      res.json(record.task);
    })
  );
}

async function processServerTask(task: DownloadTask): Promise<void> {
  const record = serverTasks.get(task.id);
  if (!record) return;

  task.status = 'running';
  task.updatedAt = Date.now();

  const quota: StorageQuota = task.storageQuota || {
    enforce: true,
    serverMaxBytes: DEFAULT_SERVER_MAX_BYTES,
  };
  const targetDir = task.serverPath || getServerDownloadDir();
  mkdirSync(targetDir, { recursive: true });

  const completedIds = new Set<string>(task.completedItemIds || []);

  for (const item of task.items) {
    if (record.statusControl === 'cancelled') {
      task.status = 'cancelled';
      task.updatedAt = Date.now();
      return;
    }

    // 等待恢复
    let control: string = record.statusControl;
    while (control === 'paused') {
      await sleep(500);
      control = record.statusControl;
      if (control === 'cancelled') {
        task.status = 'cancelled';
        task.updatedAt = Date.now();
        return;
      }
    }

    if (completedIds.has(item.id)) continue;

    try {
      const payload = await getResourcePayload(item.type, item.id);
      const contentBuffer = Buffer.from(payload.content, 'utf-8');

      if (quota.enforce) {
        const currentSize = getDirectorySize(targetDir);
        const maxBytes = quota.serverMaxBytes ?? DEFAULT_SERVER_MAX_BYTES;
        if (currentSize + contentBuffer.length > maxBytes) {
          throw new OrdPawError(
            `服务端存储配额不足（当前 ${currentSize}，需 ${contentBuffer.length}，上限 ${maxBytes}）`,
            { code: OrdPawErrorCode.FORBIDDEN }
          );
        }
      }

      const filePath = join(targetDir, payload.filename);
      writeFileSync(filePath, contentBuffer);

      task.downloadedBytes += contentBuffer.length;
      completedIds.add(item.id);
      task.completedItemIds = Array.from(completedIds);

      if (task.totalBytes > 0) {
        task.progress = Math.min(100, Math.floor((task.downloadedBytes / task.totalBytes) * 100));
      }
      task.updatedAt = Date.now();
    } catch (err: unknown) {
      task.status = 'failed';
      task.error = err instanceof Error ? err.message : '子项下载失败';
      task.updatedAt = Date.now();
      return;
    }
  }

  task.status = 'completed';
  task.progress = 100;
  task.updatedAt = Date.now();
}

interface ResourcePayload {
  filename: string;
  content: string;
}

async function getResourcePayload(
  type: DownloadResourceType,
  id?: string
): Promise<ResourcePayload> {
  const db = getDatabase();

  switch (type) {
    case 'conversation': {
      if (!id) throw ApiError.badRequest('缺少 id 参数');
      const conv = queryOne<Record<string, unknown>>(
        db,
        'SELECT * FROM conversations WHERE id = ?',
        [id]
      );
      if (!conv) throw ApiError.notFound('会话不存在');
      const messages = queryAll<Record<string, unknown>>(
        db,
        'SELECT * FROM messages WHERE conversation_id = ?',
        [id]
      );
      const checkpoints = queryAll<Record<string, unknown>>(
        db,
        'SELECT * FROM checkpoints WHERE conversation_id = ?',
        [id]
      );
      const data = {
        version: 1,
        exportedAt: Date.now(),
        scope: 'conversation',
        conversation: conv,
        messages,
        checkpoints,
      };
      return { filename: `conversation-${id}.json`, content: JSON.stringify(data, null, 2) };
    }

    case 'script':
    case 'code': {
      if (!id) throw ApiError.badRequest('缺少 id 参数');
      const script = scriptMcp.getScript(id);
      if (!script) throw ApiError.notFound('脚本不存在');
      return {
        filename: `${sanitizeFileName(script.name)}.json`,
        content: JSON.stringify(script, null, 2),
      };
    }

    case 'skill': {
      if (!id) throw ApiError.badRequest('缺少 id 参数');
      const skill = skillRunner.getSkill(id);
      if (!skill) throw ApiError.notFound('Skill 不存在');
      const serializable = { ...skill, execute: undefined };
      return {
        filename: `${sanitizeFileName(skill.name)}-skill.json`,
        content: JSON.stringify(serializable, null, 2),
      };
    }

    case 'mcp': {
      if (id) {
        const agent = queryOne<Record<string, unknown>>(db, 'SELECT * FROM agents WHERE id = ?', [
          id,
        ]);
        if (!agent) throw ApiError.notFound('Agent 不存在');
        const configs = safeJsonParse(agent.mcp_json, []);
        return { filename: `mcp-${id}.json`, content: JSON.stringify(configs, null, 2) };
      }
      const allAgents = queryAll<Record<string, unknown>>(
        db,
        'SELECT id, name, mcp_json FROM agents'
      );
      const configs = allAgents.map((a) => ({
        agentId: a.id,
        name: a.name,
        mcpServers: safeJsonParse(a.mcp_json, []),
      }));
      return { filename: 'mcp-configs.json', content: JSON.stringify(configs, null, 2) };
    }

    case 'file': {
      if (!id) throw ApiError.badRequest('缺少 id 参数');
      const filePath = join(getServerDownloadDir(), '..', 'files', id);
      if (!existsSync(filePath)) {
        // 未找到真实文件时返回占位元数据，避免整体失败
        return {
          filename: `file-${id}.json`,
          content: JSON.stringify({ id, note: '文件未在服务器上找到' }, null, 2),
        };
      }
      // 二进制文件不通过 JSON 下载；这里仅返回元数据
      const stats = statSync(filePath);
      return {
        filename: `file-${id}.json`,
        content: JSON.stringify({ id, path: filePath, size: stats.size }, null, 2),
      };
    }

    case 'source': {
      const workspaceRoot = getWorkspaceRoot();
      const outPath = join(getServerDownloadDir(), `ordpaw-source-${Date.now()}.tar.gz`);
      mkdirSync(getServerDownloadDir(), { recursive: true });
      await packSourceCode(workspaceRoot, outPath);
      // source 类型通常直接走 /download/source 流式返回；此处返回一个占位描述
      return {
        filename: 'ordpaw-source.tar.gz.json',
        content: JSON.stringify({ path: outPath, note: '源码包已生成' }, null, 2),
      };
    }

    default:
      throw ApiError.badRequest(`不支持的资源类型: ${type}`);
  }
}

function packSourceCode(workspaceRoot: string, outPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      '-czf',
      outPath,
      '--exclude=node_modules',
      '--exclude=.git',
      '--exclude=dist',
      '--exclude=.tmp',
      '-C',
      workspaceRoot,
      '.',
    ];
    execFile('tar', args, { maxBuffer: 50 * 1024 * 1024 }, (err, _stdout, stderr) => {
      if (err) {
        logger.error({ err, stderr }, '打包源码失败');
        reject(err);
        return;
      }
      resolve();
    });
  });
}

function getWorkspaceRoot(): string {
  const candidates = [
    process.cwd(),
    resolve(__dirname, '../../../../..'),
    resolve(__dirname, '../../../..'),
  ];
  for (const dir of candidates) {
    if (existsSync(join(dir, 'packages', 'server', 'package.json'))) {
      return dir;
    }
  }
  return resolve(__dirname, '../../../../..');
}

function getServerDownloadDir(): string {
  const dir = join(process.cwd(), 'data', 'downloads');
  mkdirSync(dir, { recursive: true });
  return dir;
}

function resolveTargetDirectory(inputPath: string): string {
  if (!inputPath) throw ApiError.badRequest('缺少 serverPath');
  const resolved = isAbsolute(inputPath) ? resolve(inputPath) : resolve(process.cwd(), inputPath);
  const cwd = resolve(process.cwd());
  const rel = relative(cwd, resolved);
  if (rel.startsWith('..') || rel.includes('..')) {
    throw ApiError.badRequest('serverPath 不能超出工作目录');
  }
  return resolved;
}

function getDirectorySize(dir: string): number {
  try {
    let total = 0;
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        total += getDirectorySize(fullPath);
      } else {
        total += statSync(fullPath).size;
      }
    }
    return total;
  } catch {
    return 0;
  }
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_.\u4e00-\u9fa5-]/g, '_');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
