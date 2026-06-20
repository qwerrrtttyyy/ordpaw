import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { agentRuntime } from '../core/agent-runtime.js';
import { sessionManager } from '../core/session.js';
import { checkpointManager } from '../core/checkpoint.js';
import { skillRunner } from '../core/skill-runner.js';
import { scriptMcp } from '../core/script-mcp.js';
import { providerService } from '../core/provider-service.js';
import { testSuiteManager } from '../core/test-suite.js';
import { debugLogger } from '../core/debug-logger.js';
import { statsCache } from '../core/cache.js';
import { componentServer } from '../core/component-server.js';
import { getDatabase, saveDatabase } from '../db/index.js';
import { setupDownloadRoutes } from '../core/download-service.js';
import { asyncHandler, ApiError, validateBody } from '../middleware.js';

const DEFAULT_SETTINGS: any = {
  theme: 'ordpaw-light',
  uiMode: 'classic',
  uiEffects: 'balanced',
  performanceMode: 'auto',
  locale: 'zh-CN',
  debugMode: false,
  logLevel: 'info',
  checkpointStrategy: 'every-message',
  apiKeys: {},
  apiEndpoints: {}
};

function rowToObject(columns: string[], row: any[]): any {
  const obj: any = {};
  columns.forEach((col, idx) => {
    obj[col] = row[idx];
  });
  return obj;
}

export function setupApiRoutes(app: any) {
  const router = Router();
  app.use('/api', router);

  // ============ Agent API ============
  router.get('/agents', asyncHandler(async (req: Request, res: Response) => {
    const agents = agentRuntime.listAgents();
    res.json(agents);
  }));

  router.post('/agents', validateBody<{ name: string }>({ name: 'string' }), asyncHandler(async (req: Request, res: Response) => {
    const agent = agentRuntime.createAgent(req.body);
    res.status(201).json(agent);
  }));

  router.get('/agents/:id', asyncHandler(async (req: Request, res: Response) => {
    const agent = agentRuntime.getAgent(req.params.id);
    if (!agent) throw ApiError.notFound('Agent 不存在');
    res.json(agent);
  }));

  router.put('/agents/:id', asyncHandler(async (req: Request, res: Response) => {
    const agent = agentRuntime.updateAgent(req.params.id, req.body);
    if (!agent) throw ApiError.notFound('Agent 不存在');
    res.json(agent);
  }));

  router.delete('/agents/:id', asyncHandler(async (req: Request, res: Response) => {
    const ok = agentRuntime.deleteAgent(req.params.id);
    if (!ok) throw ApiError.notFound('Agent 不存在');
    res.json({ success: true });
  }));

  // ============ Provider API ============
  router.get('/providers', asyncHandler(async (_req: Request, res: Response) => {
    res.json(providerService.listProviders());
  }));

  router.get('/providers/:id/models', asyncHandler(async (req: Request, res: Response) => {
    const models = providerService.getModels(req.params.id);
    res.json(models);
  }));

  router.post('/providers', validateBody<{ name: string; type: string }>({ name: 'string', type: 'string' }), asyncHandler(async (req: Request, res: Response) => {
    const provider = providerService.createProvider(req.body);
    res.status(201).json(provider);
  }));

  router.put('/providers/:id', asyncHandler(async (req: Request, res: Response) => {
    const provider = providerService.updateProvider(req.params.id, req.body);
    if (!provider) throw ApiError.notFound('Provider 不存在');
    res.json(provider);
  }));

  router.delete('/providers/:id', asyncHandler(async (req: Request, res: Response) => {
    const ok = providerService.deleteProvider(req.params.id);
    if (!ok) throw ApiError.notFound('Provider 不存在或为内置');
    res.json({ success: true });
  }));

  // ============ 会话 API ============
  router.get('/conversations', asyncHandler(async (req: Request, res: Response) => {
    const agentId = req.query.agentId as string | undefined;
    const conversations = sessionManager.listConversations(agentId);
    res.json(conversations);
  }));

  router.post('/conversations', validateBody<{ agentId: string }>({ agentId: 'string' }), asyncHandler(async (req: Request, res: Response) => {
    const { agentId, title } = req.body;
    const agent = agentRuntime.getAgent(agentId);
    if (!agent) throw ApiError.badRequest('指定的 Agent 不存在');
    const conversation = sessionManager.createConversation(agentId, title);
    res.status(201).json(conversation);
  }));

  router.get('/conversations/:id', asyncHandler(async (req: Request, res: Response) => {
    const conversation = sessionManager.getConversation(req.params.id);
    if (!conversation) throw ApiError.notFound('会话不存在');
    res.json(conversation);
  }));

  router.delete('/conversations/:id', asyncHandler(async (req: Request, res: Response) => {
    const ok = sessionManager.deleteConversation(req.params.id);
    if (!ok) throw ApiError.notFound('会话不存在');
    res.json({ success: true });
  }));

  // ============ 检查点 API ============
  router.post('/conversations/:id/checkpoints', asyncHandler(async (req: Request, res: Response) => {
    const { messageId, label } = req.body || {};
    if (!messageId) throw ApiError.badRequest('缺少 messageId 字段');
    const checkpoint = checkpointManager.createCheckpoint(req.params.id, messageId, label);
    if (!checkpoint) throw ApiError.notFound('会话不存在');
    res.status(201).json(checkpoint);
  }));

  router.get('/conversations/:id/checkpoints', asyncHandler(async (req: Request, res: Response) => {
    const checkpoints = checkpointManager.getCheckpoints(req.params.id);
    res.json(checkpoints);
  }));

  router.post('/conversations/:id/rollback/:checkpointId', asyncHandler(async (req: Request, res: Response) => {
    const ok = checkpointManager.rollbackToCheckpoint(req.params.id, req.params.checkpointId);
    if (!ok) throw ApiError.notFound('检查点或会话不存在');
    res.json({ success: true });
  }));

  // ============ 测试套件 API ============
  router.get('/test-suites', asyncHandler(async (req: Request, res: Response) => {
    const agentId = req.query.agentId as string | undefined;
    res.json(testSuiteManager.listSuites(agentId));
  }));

  router.post('/test-suites', validateBody<{ agentId: string; name: string }>({ agentId: 'string', name: 'string' }), asyncHandler(async (req: Request, res: Response) => {
    const suite = testSuiteManager.createSuite(req.body);
    res.status(201).json(suite);
  }));

  router.get('/test-suites/:id', asyncHandler(async (req: Request, res: Response) => {
    const suite = testSuiteManager.getSuite(req.params.id);
    if (!suite) throw ApiError.notFound('测试套件不存在');
    res.json(suite);
  }));

  router.put('/test-suites/:id', asyncHandler(async (req: Request, res: Response) => {
    const suite = testSuiteManager.updateSuite(req.params.id, req.body);
    if (!suite) throw ApiError.notFound('测试套件不存在');
    res.json(suite);
  }));

  router.delete('/test-suites/:id', asyncHandler(async (req: Request, res: Response) => {
    const ok = testSuiteManager.deleteSuite(req.params.id);
    if (!ok) throw ApiError.notFound('测试套件不存在');
    res.json({ success: true });
  }));

  router.post('/test-suites/:id/run', asyncHandler(async (req: Request, res: Response) => {
    const run = await testSuiteManager.runSuite(req.params.id);
    if (!run) throw ApiError.notFound('测试套件或 Agent 不存在');
    res.json(run);
  }));

  router.get('/test-suites/:id/runs', asyncHandler(async (req: Request, res: Response) => {
    res.json(testSuiteManager.listRuns(req.params.id));
  }));

  router.post('/test-suites/:id/cases', validateBody<{ name: string; input: string }>({ name: 'string', input: 'string' }), asyncHandler(async (req: Request, res: Response) => {
    const c = testSuiteManager.createCase(req.params.id, req.body);
    if (!c) throw ApiError.notFound('测试套件不存在');
    res.status(201).json(c);
  }));

  router.put('/test-cases/:id', asyncHandler(async (req: Request, res: Response) => {
    const c = testSuiteManager.updateCase(req.params.id, req.body);
    if (!c) throw ApiError.notFound('测试用例不存在');
    res.json(c);
  }));

  router.delete('/test-cases/:id', asyncHandler(async (req: Request, res: Response) => {
    const ok = testSuiteManager.deleteCase(req.params.id);
    if (!ok) throw ApiError.notFound('测试用例不存在');
    res.json({ success: true });
  }));

  // ============ 聊天 API ============
  router.post('/chat', validateBody<{ conversationId: string; content: string }>({
    conversationId: 'string',
    content: 'string'
  }), asyncHandler(async (req: Request, res: Response) => {
    const { conversationId, content } = req.body;
    if (!content || !content.trim()) {
      throw ApiError.badRequest('消息内容不能为空');
    }
    const message = await agentRuntime.processMessage(conversationId, content);
    if (!message) throw ApiError.notFound('会话不存在');
    res.json(message);
  }));

  // ============ 调试 API ============
  router.get('/debug/logs', asyncHandler(async (req: Request, res: Response) => {
    const level = req.query.level as any;
    const limit = Math.min(parseInt(req.query.limit as string || '100', 10), 500);
    res.json(debugLogger.getLogs(level, limit));
  }));

  router.get('/debug/events', asyncHandler(async (req: Request, res: Response) => {
    const type = req.query.type as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string || '100', 10), 300);
    res.json(debugLogger.getEvents(type, limit));
  }));

  router.get('/debug/stream', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const send = (event: string, data: any) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const unsubLog = debugLogger.subscribe(entry => send('log', entry));
    const unsubEvent = debugLogger.subscribeEvents(evt => send('event', evt));

    const keepAlive = setInterval(() => send('ping', { time: Date.now() }), 30000);

    req.on('close', () => {
      clearInterval(keepAlive);
      unsubLog();
      unsubEvent();
    });
  });

  router.post('/debug/clear', asyncHandler(async (_req: Request, res: Response) => {
    debugLogger.clearLogs();
    debugLogger.clearEvents();
    res.json({ success: true });
  }));

  // ============ 技能 API ============
  router.get('/skills', asyncHandler(async (req: Request, res: Response) => {
    const skills = skillRunner.listSkills();
    res.json(skills);
  }));

  // ============ 提示词库 API ============
  router.get('/prompts', asyncHandler(async (req: Request, res: Response) => {
    const db = getDatabase();
    const result = db.exec('SELECT * FROM prompts ORDER BY updated_at DESC');
    if (result.length === 0) {
      res.json([]);
      return;
    }
    const { columns, values } = result[0];
    const prompts = values.map(row => {
      const p = rowToObject(columns, row);
      return {
        id: p.id,
        name: p.name,
        category: p.category,
        content: p.content,
        variables: safeJsonParse(p.variables_json, []),
        version: p.version,
        createdAt: p.created_at,
        updatedAt: p.updated_at
      };
    });
    res.json(prompts);
  }));

  router.post('/prompts', validateBody<{ name: string; content: string }>({
    name: 'string',
    content: 'string'
  }), asyncHandler(async (req: Request, res: Response) => {
    const db = getDatabase();
    const { name, category, content, variables } = req.body;
    const id = uuidv4();
    const now = Date.now();
    const safeCategory = (category || '通用').toString();
    const safeName = name.toString();
    const safeContent = content.toString();
    const variablesJson = JSON.stringify(variables || []);

    db.run(`
      INSERT INTO prompts (id, name, category, content, variables_json, version, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?)
    `, [id, safeName, safeCategory, safeContent, variablesJson, now, now]);
    saveDatabase();

    const result = db.exec('SELECT * FROM prompts WHERE id = ?', [id]);
    if (result.length === 0) {
      throw ApiError.internal('提示词创建失败');
    }
    const { columns, values: rows } = result[0];
    const prompt = rowToObject(columns, rows[0]);
    res.status(201).json(prompt);
  }));

  router.put('/prompts/:id', asyncHandler(async (req: Request, res: Response) => {
    const db = getDatabase();
    const { name, category, content, variables } = req.body || {};
    if (!name || !content) throw ApiError.badRequest('缺少必要字段 name 或 content');
    const now = Date.now();
    const safeCategory = (category || '通用').toString();
    const variablesJson = JSON.stringify(variables || []);

    db.run(`
      UPDATE prompts SET name = ?, category = ?, content = ?, variables_json = ?, version = version + 1, updated_at = ?
      WHERE id = ?
    `, [name.toString(), safeCategory, content.toString(), variablesJson, now, req.params.id]);
    saveDatabase();

    const result = db.exec('SELECT * FROM prompts WHERE id = ?', [req.params.id]);
    if (result.length === 0) throw ApiError.notFound('提示词不存在');
    const { columns, values: rows } = result[0];
    res.json(rowToObject(columns, rows[0]));
  }));

  router.delete('/prompts/:id', asyncHandler(async (req: Request, res: Response) => {
    const db = getDatabase();
    db.run('DELETE FROM prompts WHERE id = ?', [req.params.id]);
    saveDatabase();
    res.json({ success: true });
  }));

  // ============ 插件 API ============
  router.get('/plugins', asyncHandler(async (req: Request, res: Response) => {
    const db = getDatabase();
    const result = db.exec('SELECT * FROM plugins');
    if (result.length === 0) {
      res.json([]);
      return;
    }
    const { columns, values } = result[0];
    const plugins = values.map(row => {
      const p = rowToObject(columns, row);
      return {
        id: p.id,
        name: p.name,
        version: p.version,
        description: p.description,
        manifest: safeJsonParse(p.manifest_json, {}),
        config: safeJsonParse(p.config_json, {}),
        state: p.state,
        enabled: p.enabled === 1
      };
    });
    res.json(plugins);
  }));

  router.post('/plugins/install', validateBody<{ name: string; manifest: any }>({
    name: 'string',
    manifest: 'object'
  }), asyncHandler(async (req: Request, res: Response) => {
    const db = getDatabase();
    const { name, version, description, manifest } = req.body;
    const id = uuidv4();
    const safeVersion = (version || '0.0.0').toString();
    const safeDesc = (description || '').toString();
    const manifestJson = JSON.stringify(manifest);

    db.run(`
      INSERT INTO plugins (id, name, version, description, manifest_json, config_json, state, enabled)
      VALUES (?, ?, ?, ?, ?, ?, 'loaded', 1)
    `, [id, name.toString(), safeVersion, safeDesc, manifestJson, '{}']);
    saveDatabase();

    const result = db.exec('SELECT * FROM plugins WHERE id = ?', [id]);
    if (result.length === 0) throw ApiError.internal('插件安装失败');
    const { columns, values: rows } = result[0];
    res.status(201).json(rowToObject(columns, rows[0]));
  }));

  router.put('/plugins/:id/config', asyncHandler(async (req: Request, res: Response) => {
    const db = getDatabase();
    const { config } = req.body || {};
    if (config === undefined) throw ApiError.badRequest('缺少 config 字段');
    db.run('UPDATE plugins SET config_json = ? WHERE id = ?', [JSON.stringify(config), req.params.id]);
    saveDatabase();
    res.json({ success: true });
  }));

  router.delete('/plugins/:id', asyncHandler(async (req: Request, res: Response) => {
    const db = getDatabase();
    db.run('DELETE FROM plugins WHERE id = ?', [req.params.id]);
    saveDatabase();
    res.json({ success: true });
  }));

  // ============ 组件 API ============
  router.get('/components/manifest', asyncHandler(async (_req: Request, res: Response) => {
    res.json(componentServer.getManifest());
  }));

  // ============ 下载 API ============
  setupDownloadRoutes(router);

  // ============ 设置 API ============
  router.get('/settings', asyncHandler(async (req: Request, res: Response) => {
    const db = getDatabase();
    const result = db.exec('SELECT * FROM settings');
    const settingsObj: any = { ...DEFAULT_SETTINGS };
    if (result.length > 0) {
      result[0].values.forEach(row => {
        const key = row[0] as string;
        const value = safeJsonParse(row[1], null);
        if (value !== null) {
          settingsObj[key] = value;
        }
      });
    }
    res.json(settingsObj);
  }));

  router.put('/settings', asyncHandler(async (req: Request, res: Response) => {
    const db = getDatabase();
    const settings = req.body || {};
    if (typeof settings !== 'object' || Array.isArray(settings)) {
      throw ApiError.badRequest('请求体必须是对象');
    }

    let updated = 0;
    for (const [key, value] of Object.entries(settings)) {
      if (typeof key !== 'string' || key.length > 64) continue;
      db.run(
        'INSERT OR REPLACE INTO settings (key, value_json) VALUES (?, ?)',
        [key, JSON.stringify(value)]
      );
      updated++;
    }
    saveDatabase();

    if (settings.debugMode !== undefined) {
      debugLogger.setDebugMode(Boolean(settings.debugMode));
    }

    res.json({ success: true, updated });
  }));

  // ============ 脚本 API ============
  router.get('/scripts', asyncHandler(async (req: Request, res: Response) => {
    const scripts = scriptMcp.listScripts();
    res.json(scripts);
  }));

  router.get('/scripts/tools', asyncHandler(async (req: Request, res: Response) => {
    res.json(scriptMcp.listTools());
  }));

  router.post('/scripts', validateBody<{ name: string; code: string }>({
    name: 'string',
    code: 'string'
  }), asyncHandler(async (req: Request, res: Response) => {
    const { name, description, code, language } = req.body;
    const script = scriptMcp.createScript({ name, description, code, language });
    res.status(201).json(script);
  }));

  router.get('/scripts/:id', asyncHandler(async (req: Request, res: Response) => {
    const script = scriptMcp.getScript(req.params.id);
    if (!script) throw ApiError.notFound('脚本不存在');
    res.json(script);
  }));

  router.put('/scripts/:id', asyncHandler(async (req: Request, res: Response) => {
    const script = scriptMcp.updateScript(req.params.id, req.body);
    if (!script) throw ApiError.notFound('脚本不存在');
    res.json(script);
  }));

  router.delete('/scripts/:id', asyncHandler(async (req: Request, res: Response) => {
    const ok = scriptMcp.deleteScript(req.params.id);
    if (!ok) throw ApiError.notFound('脚本不存在');
    res.json({ success: true });
  }));

  router.post('/scripts/:id/execute', validateBody<Record<string, any>>({}), asyncHandler(async (req: Request, res: Response) => {
    const { args, context } = req.body || {};
    const result = await scriptMcp.executeScript(req.params.id, args || {}, context || {});
    res.json(result);
  }));

  router.post('/scripts/use', validateBody<{ name: string }>({ name: 'string' }), asyncHandler(async (req: Request, res: Response) => {
    const { name, args, context } = req.body || {};
    const result = await scriptMcp.executeScript(name, args || {}, context || {});
    res.json(result);
  }));

  router.post('/mcp/scripts/call', validateBody<{ tool: string; params: any }>({
    tool: 'string',
    params: 'object'
  }), asyncHandler(async (req: Request, res: Response) => {
    const result = await scriptMcp.callTool({ tool: req.body.tool, params: req.body.params });
    res.json(result);
  }));

  // ============ 统计 API ============
  router.get('/stats', asyncHandler(async (req: Request, res: Response) => {
    const cached = statsCache.get('stats');
    if (cached) {
      res.json(cached);
      return;
    }

    const db = getDatabase();

    const stats = {
      agents: safeCount(db, 'SELECT COUNT(*) as count FROM agents'),
      conversations: safeCount(db, 'SELECT COUNT(*) as count FROM conversations'),
      plugins: safeCount(db, 'SELECT COUNT(*) as count FROM plugins'),
      prompts: safeCount(db, 'SELECT COUNT(*) as count FROM prompts'),
      scripts: safeCount(db, 'SELECT COUNT(*) as count FROM scripts'),
      skills: skillRunner.listSkills().length,
      providers: safeCount(db, 'SELECT COUNT(*) as count FROM providers'),
      testSuites: safeCount(db, 'SELECT COUNT(*) as count FROM test_suites')
    };

    statsCache.set('stats', stats);
    res.json(stats);
  }));

  // ============ 重置 / 清除数据 API ============
  router.post('/reset/settings', asyncHandler(async (_req: Request, res: Response) => {
    const db = getDatabase();
    db.run('DELETE FROM settings');
    saveDatabase();
    statsCache.clear();
    debugLogger.setDebugMode(false);
    res.json({ success: true, message: '设置已重置为默认值' });
  }));

  router.post('/clear-data', asyncHandler(async (req: Request, res: Response) => {
    const db = getDatabase();
    const targets = (req.body?.targets as string[]) || ['all'];
    const cleared: string[] = [];

    if (targets.includes('all') || targets.includes('conversations')) {
      db.run('DELETE FROM checkpoints');
      db.run('DELETE FROM messages');
      db.run('DELETE FROM conversations');
      cleared.push('conversations');
    }
    if (targets.includes('all') || targets.includes('logs')) {
      debugLogger.clearLogs();
      debugLogger.clearEvents();
      cleared.push('logs');
    }
    if (targets.includes('all') || targets.includes('cache')) {
      statsCache.clear();
      cleared.push('cache');
    }
    if (targets.includes('all') || targets.includes('testRuns')) {
      db.run('DELETE FROM test_runs');
      cleared.push('testRuns');
    }
    if (targets.includes('all') || targets.includes('scripts')) {
      db.run('DELETE FROM scripts');
      cleared.push('scripts');
    }

    saveDatabase();
    res.json({ success: true, cleared });
  }));

  // ============ 导出 / 导入 API ============
  router.get('/export', asyncHandler(async (req: Request, res: Response) => {
    const db = getDatabase();
    const scope = (req.query.scope as string) || 'all';

    const data: Record<string, any> = { version: 1, exportedAt: Date.now(), scope };

    const queryAll = (sql: string) => {
      const result = db.exec(sql);
      if (result.length === 0) return [];
      return result[0].values.map(row => rowToObject(result[0].columns, row));
    };

    if (scope === 'all' || scope === 'agents') {
      data.agents = queryAll('SELECT * FROM agents');
    }
    if (scope === 'all' || scope === 'conversations') {
      data.conversations = queryAll('SELECT * FROM conversations');
      data.messages = queryAll('SELECT * FROM messages');
      data.checkpoints = queryAll('SELECT * FROM checkpoints');
    }
    if (scope === 'all' || scope === 'providers') {
      data.providers = queryAll('SELECT * FROM providers');
    }
    if (scope === 'all' || scope === 'prompts') {
      data.prompts = queryAll('SELECT * FROM prompts');
    }
    if (scope === 'all' || scope === 'scripts') {
      data.scripts = queryAll('SELECT * FROM scripts');
    }
    if (scope === 'all' || scope === 'settings') {
      data.settings = queryAll('SELECT * FROM settings');
    }
    if (scope === 'all' || scope === 'testSuites') {
      data.testSuites = queryAll('SELECT * FROM test_suites');
      data.testCases = queryAll('SELECT * FROM test_cases');
      data.testRuns = queryAll('SELECT * FROM test_runs');
    }
    if (scope === 'all' || scope === 'plugins') {
      data.plugins = queryAll('SELECT * FROM plugins');
    }

    res.setHeader('Content-Disposition', `attachment; filename="agent-studio-export-${Date.now()}.json"`);
    res.json(data);
  }));

  router.get('/export/conversations/:id', asyncHandler(async (req: Request, res: Response) => {
    const db = getDatabase();
    const convResult = db.exec('SELECT * FROM conversations WHERE id = ?', [req.params.id]);
    if (convResult.length === 0) throw ApiError.notFound('会话不存在');
    const conv = rowToObject(convResult[0].columns, convResult[0].values[0]);

    const queryAll = (sql: string, params?: any[]) => {
      const result = params ? db.exec(sql, params) : db.exec(sql);
      if (result.length === 0) return [];
      return result[0].values.map(row => rowToObject(result[0].columns, row));
    };

    const data = {
      version: 1,
      exportedAt: Date.now(),
      scope: 'conversation',
      conversation: conv,
      messages: queryAll('SELECT * FROM messages WHERE conversation_id = ?', [req.params.id]),
      checkpoints: queryAll('SELECT * FROM checkpoints WHERE conversation_id = ?', [req.params.id])
    };

    res.setHeader('Content-Disposition', `attachment; filename="conversation-${req.params.id}.json"`);
    res.json(data);
  }));

  router.post('/import', asyncHandler(async (req: Request, res: Response) => {
    const db = getDatabase();
    const data = req.body;
    if (!data || typeof data !== 'object') throw ApiError.badRequest('无效的导入数据');

    const imported: string[] = [];

    const insertIf = (table: string, rows: any[], cols: string[]) => {
      if (!rows || !Array.isArray(rows) || rows.length === 0) return;
      for (const row of rows) {
        const vals = cols.map(c => {
          const v = row[c];
          if (v === undefined) return null;
          return typeof v === 'object' ? JSON.stringify(v) : v;
        });
        const placeholders = cols.map(() => '?').join(', ');
        try {
          db.run(`INSERT OR REPLACE INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`, vals);
        } catch {
          // 忽略重复或错误
        }
      }
      imported.push(table);
    };

    if (data.agents) insertIf('agents', data.agents, ['id','name','description','system_prompt','provider_id','model','skills_json','mcp_json','created_at','updated_at']);
    if (data.providers) insertIf('providers', data.providers, ['id','name','type','base_url','api_key_name','api_key','models_json','enabled','is_built_in','config_json','created_at','updated_at']);
    if (data.conversations) insertIf('conversations', data.conversations, ['id','agent_id','title','variables_json','created_at','updated_at']);
    if (data.messages) insertIf('messages', data.messages, ['id','conversation_id','role','content','metadata_json','timestamp']);
    if (data.checkpoints) insertIf('checkpoints', data.checkpoints, ['id','conversation_id','message_id','state_json','label','created_at']);
    if (data.prompts) insertIf('prompts', data.prompts, ['id','name','category','content','variables_json','version','created_at','updated_at']);
    if (data.scripts) insertIf('scripts', data.scripts, ['id','name','description','code','language','created_at','updated_at']);
    if (data.settings) insertIf('settings', data.settings, ['key','value_json']);
    if (data.testSuites) insertIf('test_suites', data.testSuites, ['id','agent_id','name','description','created_at','updated_at']);
    if (data.testCases) insertIf('test_cases', data.testCases, ['id','suite_id','name','input','expected_output','expected_contains_json','variables_json','created_at','updated_at']);
    if (data.testRuns) insertIf('test_runs', data.testRuns, ['id','suite_id','agent_id','results_json','passed','failed','created_at']);
    if (data.plugins) insertIf('plugins', data.plugins, ['id','name','version','description','manifest_json','config_json','state','enabled']);

    saveDatabase();
    statsCache.clear();
    res.json({ success: true, imported });
  }));
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

function safeCount(db: any, sql: string): number {
  try {
    const result = db.exec(sql);
    if (result.length === 0) return 0;
    return Number(result[0].values[0][0]) || 0;
  } catch (err) {
    console.error('safeCount 错误:', err);
    return 0;
  }
}
