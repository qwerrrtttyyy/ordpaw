import type {
  SkillDefinition,
  SkillContext,
  InstalledSkill,
  SkillInstallResult,
  SkillExecuteResult,
  InstallSkillRequest,
} from '@ordpaw/shared';
import { OrdPawError, OrdPawErrorCode } from '@ordpaw/shared/errors.js';
import { v4 as uuidv4 } from 'uuid';
import vm from 'vm';
import { getDatabase, saveDatabase } from '../db/index.js';
import { logger } from './logger.js';

class SkillRunner {
  private skills: Map<string, SkillDefinition> = new Map();
  private installedMeta: Map<string, InstalledSkill> = new Map();
  private static readonly SKILL_TIMEOUT_MS = 5000;
  private static readonly ALLOWED_GLOBALS = [
    'console',
    'Math',
    'JSON',
    'Date',
    'Array',
    'Object',
    'String',
    'Number',
    'Boolean',
    'RegExp',
    'Error',
    'Map',
    'Set',
    'Promise',
    'parseInt',
    'parseFloat',
    'isNaN',
    'isFinite',
    'encodeURIComponent',
    'decodeURIComponent',
    'setTimeout',
    'clearTimeout',
  ];

  init(): void {
    // Register built-in skills
    this.registerBuiltin(
      'echo',
      '回显输入内容',
      {
        type: 'object',
        properties: { message: { type: 'string' } },
        required: ['message'],
      },
      async (params: unknown) => {
        const record =
          typeof params === 'object' && params !== null ? (params as Record<string, unknown>) : {};
        return { echo: record.message };
      }
    );

    this.registerBuiltin(
      'time',
      '获取当前时间',
      {
        type: 'object',
        properties: {},
      },
      async () => ({ time: new Date().toISOString() })
    );

    // Load persisted user skills
    this.loadInstalledFromDb();
    logger.info(`SkillRunner 已初始化 (${this.skills.size} 个技能)`);
  }

  private registerBuiltin(
    name: string,
    description: string,
    parameters: Record<string, unknown>,
    execute: (params: unknown, context: SkillContext) => Promise<unknown>
  ): void {
    const id = `builtin-${name}`;
    this.skills.set(id, { id, name, description, parameters, execute });
    this.installedMeta.set(id, {
      id,
      name,
      description,
      parameters,
      code: '',
      source: 'builtin',
      enabled: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }

  private loadInstalledFromDb(): void {
    try {
      const db = getDatabase();
      const result = db.exec('SELECT * FROM installed_skills WHERE enabled = 1');
      if (result.length === 0) return;
      const { columns, values } = result[0];
      for (const row of values) {
        const obj = this.rowToMeta(columns, row as unknown[]);
        this.installedMeta.set(obj.id, obj);
        this.registerInstalled(obj);
      }
    } catch (err) {
      logger.warn({ err }, '加载已安装技能失败');
    }
  }

  private rowToMeta(columns: string[], row: unknown[]): InstalledSkill {
    const idx = (c: string) => columns.indexOf(c);
    return {
      id: row[idx('id')] as string,
      name: row[idx('name')] as string,
      description: row[idx('description')] as string,
      parameters: safeJsonParse(row[idx('parameters_json')], {}),
      code: row[idx('code')] as string,
      source: row[idx('source')] as 'builtin' | 'user',
      enabled: row[idx('enabled')] === 1,
      createdAt: row[idx('created_at')] as number,
      updatedAt: row[idx('updated_at')] as number,
    };
  }

  registerSkill(skill: SkillDefinition): void {
    // 插件通过 registerSkill 注册的技能，作为用户技能处理
    this.skills.set(skill.id, skill);
    logger.info(`技能 ${skill.name} 已注册`);
  }

  registerInstalled(meta: InstalledSkill): void {
    const sandbox: Record<string, unknown> = {};
    for (const g of SkillRunner.ALLOWED_GLOBALS) {
      sandbox[g] = (globalThis as Record<string, unknown>)[g];
    }
    sandbox.__args = null;

    const wrapped = `
(function() {
  "use strict";
  var console = { log: __log, warn: __warn, error: __error };
  var args = __args;
  var $args = args;
  return (function() {
    ${meta.code}
  })();
})();
`;

    const ctx = vm.createContext(sandbox);
    const script = new vm.Script(wrapped, { filename: `skill-${meta.name}.js` });

    const execute = async (params: unknown, _context: SkillContext): Promise<unknown> => {
      sandbox.__args = params;
      const logs: string[] = [];
      sandbox.__log = (...a: unknown[]) => logs.push(a.map(String).join(' '));
      sandbox.__warn = (...a: unknown[]) => logs.push('WARN: ' + a.map(String).join(' '));
      sandbox.__error = (...a: unknown[]) => logs.push('ERROR: ' + a.map(String).join(' '));
      try {
        const result = script.runInContext(ctx, {
          timeout: SkillRunner.SKILL_TIMEOUT_MS,
          breakOnSigint: true,
        });
        return { result, logs };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new OrdPawError(`技能执行错误: ${msg}`, {
          code: OrdPawErrorCode.INTERNAL_ERROR,
          cause: err,
        });
      }
    };

    const def: SkillDefinition = {
      id: meta.id,
      name: meta.name,
      description: meta.description,
      parameters: meta.parameters,
      execute,
    };
    this.skills.set(meta.id, def);
  }

  async installSkill(req: InstallSkillRequest): Promise<SkillInstallResult> {
    const db = getDatabase();
    const id = uuidv4();
    const now = Date.now();
    const paramsJson = JSON.stringify(req.parameters || {});
    const source = 'user' as const;

    // Validate code by attempting to compile it
    try {
      new vm.Script(`(function() { ${req.code} })()`, { filename: 'validate.js' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new OrdPawError(`技能代码验证失败: ${msg}`, {
        code: OrdPawErrorCode.BAD_REQUEST,
        cause: err,
      });
    }

    try {
      db.run(
        `INSERT INTO installed_skills (id, name, description, parameters_json, code, source, enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        [id, req.name, req.description || '', paramsJson, req.code, source, now, now]
      );
      saveDatabase();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new OrdPawError(`技能安装失败: ${msg}`, {
        code: OrdPawErrorCode.INTERNAL_ERROR,
        cause: err,
      });
    }

    const meta: InstalledSkill = {
      id,
      name: req.name,
      description: req.description || '',
      parameters: req.parameters || {},
      code: req.code,
      source,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    };
    this.installedMeta.set(id, meta);

    try {
      this.registerInstalled(meta);
    } catch (err: unknown) {
      // Rollback
      db.run('DELETE FROM installed_skills WHERE id = ?', [id]);
      saveDatabase();
      this.installedMeta.delete(id);
      const msg = err instanceof Error ? err.message : String(err);
      throw new OrdPawError(`技能注册失败，已回滚: ${msg}`, {
        code: OrdPawErrorCode.INTERNAL_ERROR,
        cause: err,
      });
    }

    return { id, name: req.name, description: req.description || '', source };
  }

  async executeSkill(
    id: string,
    params: unknown,
    context: SkillContext
  ): Promise<SkillExecuteResult> {
    const skill = this.skills.get(id);
    if (!skill) {
      return { success: false, error: `技能不存在: ${id}` };
    }
    try {
      const output = await skill.execute(params, context);
      return { success: true, output };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  uninstallSkill(id: string): boolean {
    if (!this.skills.has(id)) return false;
    const meta = this.installedMeta.get(id);
    if (meta && meta.source === 'builtin') {
      throw new OrdPawError('内置技能无法卸载', { code: OrdPawErrorCode.FORBIDDEN });
    }
    this.skills.delete(id);
    this.installedMeta.delete(id);
    if (meta) {
      const db = getDatabase();
      db.run('DELETE FROM installed_skills WHERE id = ?', [id]);
      saveDatabase();
    }
    return true;
  }

  listInstalled(): InstalledSkill[] {
    return Array.from(this.installedMeta.values());
  }

  listSkills(): SkillDefinition[] {
    return Array.from(this.skills.values());
  }

  getSkill(id: string): SkillDefinition | undefined {
    return this.skills.get(id);
  }
}

function safeJsonParse(value: unknown, fallback: Record<string, unknown>): Record<string, unknown> {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'string') return value as Record<string, unknown>;
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return fallback;
  }
}

export const skillRunner = new SkillRunner();
