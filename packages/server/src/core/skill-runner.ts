import type { SkillDefinition, SkillContext, InstalledSkill, SkillInstallResult, SkillExecuteResult, InstallSkillRequest } from '@ordpaw/shared';
import { v4 as uuidv4 } from 'uuid';
import vm from 'vm';
import { getDatabase, saveDatabase } from '../db/index.js';

class SkillRunner {
  private skills: Map<string, SkillDefinition> = new Map();
  private installedMeta: Map<string, InstalledSkill> = new Map();
  private static readonly SKILL_TIMEOUT_MS = 5000;
  private static readonly ALLOWED_GLOBALS = [
    'console', 'Math', 'JSON', 'Date', 'Array', 'Object', 'String',
    'Number', 'Boolean', 'RegExp', 'Error', 'Map', 'Set', 'Promise',
    'parseInt', 'parseFloat', 'isNaN', 'isFinite',
    'encodeURIComponent', 'decodeURIComponent', 'setTimeout', 'clearTimeout',
  ];

  init(): void {
    // Register built-in skills
    this.registerBuiltin('echo', '回显输入内容', {
      type: 'object',
      properties: { message: { type: 'string' } },
      required: ['message'],
    }, async (params) => ({ echo: params.message }));

    this.registerBuiltin('time', '获取当前时间', {
      type: 'object', properties: {},
    }, async () => ({ time: new Date().toISOString() }));

    // Load persisted user skills
    this.loadInstalledFromDb();
    console.log(`✓ SkillRunner 已初始化 (${this.skills.size} 个技能)`);
  }

  private registerBuiltin(name: string, description: string, parameters: any, execute: (params: any) => Promise<any>): void {
    const id = `builtin-${name}`;
    this.skills.set(id, { id, name, description, parameters, execute });
    this.installedMeta.set(id, {
      id, name, description, parameters, code: '',
      source: 'builtin', enabled: true,
      createdAt: Date.now(), updatedAt: Date.now(),
    });
  }

  private loadInstalledFromDb(): void {
    try {
      const db = getDatabase();
      const result = db.exec('SELECT * FROM installed_skills WHERE enabled = 1');
      if (result.length === 0) return;
      const { columns, values } = result[0];
      for (const row of values) {
        const obj = this.rowToMeta(columns, row);
        this.installedMeta.set(obj.id, obj);
        this.registerInstalled(obj);
      }
    } catch (err) {
      console.warn('加载已安装技能失败:', err);
    }
  }

  private rowToMeta(columns: string[], row: any[]): InstalledSkill {
    const idx = (c: string) => columns.indexOf(c);
    return {
      id: row[idx('id')] as string,
      name: row[idx('name')] as string,
      description: row[idx('description')] as string,
      parameters: this.safeJsonParse(row[idx('parameters_json')], {}),
      code: row[idx('code')] as string,
      source: row[idx('source')] as 'builtin' | 'user',
      enabled: row[idx('enabled')] === 1,
      createdAt: row[idx('created_at')] as number,
      updatedAt: row[idx('updated_at')] as number,
    };
  }

  private registerInstalled(meta: InstalledSkill): void {
    const sandbox: Record<string, any> = {};
    for (const g of SkillRunner.ALLOWED_GLOBALS) {
      sandbox[g] = (globalThis as any)[g];
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

    const execute = async (params: any, _context: SkillContext): Promise<any> => {
      sandbox.__args = params;
      sandbox.__log = (...a: any[]) => logs.push(a.map(String).join(' '));
      sandbox.__warn = (...a: any[]) => logs.push('WARN: ' + a.map(String).join(' '));
      sandbox.__error = (...a: any[]) => logs.push('ERROR: ' + a.map(String).join(' '));
      const logs: string[] = [];
      try {
        const result = script.runInContext(ctx, {
          timeout: SkillRunner.SKILL_TIMEOUT_MS,
          breakOnSigint: true,
        });
        return { result, logs };
      } catch (err: any) {
        throw new Error(`技能执行错误: ${err.message}`);
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
    const source: 'user' = 'user';

    // Validate code by attempting to compile it
    try {
      new vm.Script(`(function() { ${req.code} })()`, { filename: 'validate.js' });
    } catch (err: any) {
      throw new Error(`技能代码验证失败: ${err.message}`);
    }

    try {
      db.run(
        `INSERT INTO installed_skills (id, name, description, parameters_json, code, source, enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        [id, req.name, req.description || '', paramsJson, req.code, source, now, now]
      );
      saveDatabase();
    } catch (err: any) {
      throw new Error(`技能安装失败: ${err.message}`);
    }

    const meta: InstalledSkill = {
      id, name: req.name, description: req.description || '',
      parameters: req.parameters || {}, code: req.code,
      source, enabled: true, createdAt: now, updatedAt: now,
    };
    this.installedMeta.set(id, meta);

    try {
      this.registerInstalled(meta);
    } catch (err: any) {
      // Rollback
      db.run('DELETE FROM installed_skills WHERE id = ?', [id]);
      saveDatabase();
      this.installedMeta.delete(id);
      throw new Error(`技能注册失败，已回滚: ${err.message}`);
    }

    return { id, name: req.name, description: req.description || '', source };
  }

  async executeSkill(id: string, params: any, context: SkillContext): Promise<SkillExecuteResult> {
    const skill = this.skills.get(id);
    if (!skill) {
      return { success: false, error: `技能不存在: ${id}` };
    }
    try {
      const output = await skill.execute(params, context);
      return { success: true, output };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  uninstallSkill(id: string): boolean {
    if (!this.skills.has(id)) return false;
    const meta = this.installedMeta.get(id);
    if (meta && meta.source === 'builtin') {
      throw new Error('内置技能无法卸载');
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

  private safeJsonParse(val: any, def: any): any {
    if (!val) return def;
    try { return JSON.parse(val); } catch { return def; }
  }
}

export const skillRunner = new SkillRunner();