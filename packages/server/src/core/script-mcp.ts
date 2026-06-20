import { v4 as uuidv4 } from 'uuid';
import { mkdirSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import type { Script, ScriptExecutionResult, ScriptTool, ScriptToolCall } from '@ordpaw/shared';
import { getDatabase, saveDatabase } from '../db/index.js';
import { eventBus } from './event-bus.js';

const scriptsDir = join(process.cwd(), 'data', 'scripts');
mkdirSync(scriptsDir, { recursive: true });

const DEFAULT_PRESETS: Record<string, Script> = {
  'preset-hello': {
    id: 'preset-hello',
    name: 'hello-world',
    description: 'A simple greeting script that returns a welcome message.',
    code: `function main(args) {\n  const name = args.name || 'world';\n  return { greeting: 'Hello, ' + name + '!'};\n}\n\nmain($args);`,
    language: 'javascript',
    createdAt: Date.now(),
    updatedAt: Date.now()
  },
  'preset-calc': {
    id: 'preset-calc',
    name: 'calculator',
    description: 'Basic arithmetic operations: add, subtract, multiply, divide.',
    code: `function main(args) {\n  const op = args.op || 'add';\n  const a = Number(args.a || 0);\n  const b = Number(args.b || 0);\n  switch (op) {\n    case 'add': return { result: a + b };\n    case 'sub': return { result: a - b };\n    case 'mul': return { result: a * b };\n    case 'div': return { result: b === 0 ? 'Error: division by zero' : a / b };\n    default: return { error: 'Unknown operation' };\n  }\n}\nmain($args);`,
    language: 'javascript',
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
};

export class ScriptMcp {
  private tools: ScriptTool[];

  constructor() {
    this.tools = this.buildTools();
  }

  init() {
    this.ensurePresets();
  }

  private buildTools(): ScriptTool[] {
    return [
      {
        name: 'script_create',
        description: 'Create a new script with a name and optional description.',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Unique script name' },
            description: { type: 'string' }
          },
          required: ['name']
        }
      },
      {
        name: 'script_write',
        description: 'Write or overwrite the code of an existing script.',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            code: { type: 'string' },
            language: { type: 'string', enum: ['javascript', 'typescript', 'python'] }
          },
          required: ['name', 'code']
        }
      },
      {
        name: 'script_save',
        description: 'Save an existing script (alias for write).',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            code: { type: 'string' },
            description: { type: 'string' }
          },
          required: ['name', 'code']
        }
      },
      {
        name: 'script_delete',
        description: 'Delete a script by name.',
        parameters: {
          type: 'object',
          properties: { name: { type: 'string' } },
          required: ['name']
        }
      },
      {
        name: 'script_remove',
        description: 'Remove a script by name (alias for delete).',
        parameters: {
          type: 'object',
          properties: { name: { type: 'string' } },
          required: ['name']
        }
      },
      {
        name: 'script_list',
        description: 'List all available scripts.',
        parameters: { type: 'object', properties: {} }
      },
      {
        name: 'script_use',
        description: 'Execute a script by name with arguments.',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            args: { type: 'object' }
          },
          required: ['name']
        }
      }
    ];
  }

  listTools(): ScriptTool[] {
    return this.tools;
  }

  private ensurePresets() {
    const db = getDatabase();
    for (const id of Object.keys(DEFAULT_PRESETS)) {
      const exists = db.exec('SELECT id FROM scripts WHERE id = ?', [id]);
      if (exists.length === 0 || exists[0].values.length === 0) {
        this.saveScriptRecord(DEFAULT_PRESETS[id], true);
      }
    }
  }

  listScripts(): Script[] {
    const db = getDatabase();
    const result = db.exec('SELECT * FROM scripts ORDER BY updated_at DESC');
    if (result.length === 0) return [];

    const { columns, values } = result[0];
    return values.map(row => this.rowToScript(columns, row));
  }

  getScript(idOrName: string): Script | null {
    const db = getDatabase();
    let result = db.exec('SELECT * FROM scripts WHERE id = ?', [idOrName]);
    if (result.length === 0 || result[0].values.length === 0) {
      result = db.exec('SELECT * FROM scripts WHERE name = ?', [idOrName]);
    }
    if (result.length === 0 || result[0].values.length === 0) return null;
    const { columns, values } = result[0];
    return this.rowToScript(columns, values[0]);
  }

  createScript(data: { name: string; description?: string; code?: string; language?: string }): Script {
    const db = getDatabase();
    const normalizedName = data.name.trim();
    if (!normalizedName) throw new Error('Script name is required');

    const existing = db.exec('SELECT id FROM scripts WHERE name = ?', [normalizedName]);
    if (existing.length > 0 && existing[0].values.length > 0) {
      throw new Error(`Script "${normalizedName}" already exists`);
    }

    const script: Script = {
      id: uuidv4(),
      name: normalizedName,
      description: data.description || '',
      code: data.code || '',
      language: this.normalizeLanguage(data.language),
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    this.saveScriptRecord(script, true);
    return script;
  }

  updateScript(idOrName: string, data: Partial<Script>): Script | null {
    const script = this.getScript(idOrName);
    if (!script) return null;

    if (data.name !== undefined) {
      const normalizedName = data.name.trim();
      if (normalizedName && normalizedName !== script.name) {
        const db = getDatabase();
        const existing = db.exec('SELECT id FROM scripts WHERE name = ? AND id != ?', [normalizedName, script.id]);
        if (existing.length > 0 && existing[0].values.length > 0) {
          throw new Error(`Script name "${normalizedName}" already in use`);
        }
        script.name = normalizedName;
      }
    }

    if (data.description !== undefined) script.description = data.description;
    if (data.code !== undefined) script.code = data.code;
    if (data.language !== undefined) script.language = this.normalizeLanguage(data.language);
    script.updatedAt = Date.now();

    this.saveScriptRecord(script, false);
    return script;
  }

  deleteScript(idOrName: string): boolean {
    const script = this.getScript(idOrName);
    if (!script) return false;

    const db = getDatabase();
    db.run('DELETE FROM scripts WHERE id = ?', [script.id]);
    saveDatabase();

    const filePath = join(scriptsDir, `${script.id}.js`);
    if (existsSync(filePath)) {
      try { unlinkSync(filePath); } catch {}
    }

    eventBus.emit('script:deleted', { id: script.id, name: script.name });
    return true;
  }

  async executeScript(idOrName: string, args: Record<string, any> = {}, context: Record<string, any> = {}): Promise<ScriptExecutionResult> {
    const script = this.getScript(idOrName);
    if (!script) return { success: false, error: `Script not found: ${idOrName}`, logs: [], duration: 0 };

    const start = Date.now();
    const logs: string[] = [];

    try {
      const safeCode = this.buildSafeCode(script.code, args, context, logs);
      const result = this.runInSandbox(safeCode);
      const duration = Date.now() - start;
      eventBus.emit('script:executed', { id: script.id, name: script.name, duration, success: true });
      return { success: true, output: result, logs, duration };
    } catch (err: any) {
      const duration = Date.now() - start;
      eventBus.emit('script:executed', { id: script.id, name: script.name, duration, success: false, error: err.message });
      return { success: false, error: err.message, logs, duration };
    }
  }

  async callTool(call: ScriptToolCall): Promise<ScriptExecutionResult> {
    const { tool, params } = call;
    switch (tool) {
      case 'script_create': {
        const script = this.createScript({ name: params.name, description: params.description });
        return { success: true, output: { id: script.id, name: script.name }, logs: [], duration: 0 };
      }
      case 'script_write':
      case 'script_save': {
        const script = this.getScript(params.name);
        if (script) {
          this.updateScript(script.id, { code: params.code, language: params.language, description: params.description });
        } else {
          this.createScript({ name: params.name, code: params.code, description: params.description, language: params.language });
        }
        return { success: true, output: { name: params.name }, logs: [], duration: 0 };
      }
      case 'script_delete':
      case 'script_remove': {
        const ok = this.deleteScript(params.name);
        return { success: ok, output: { deleted: ok }, logs: [], duration: 0 };
      }
      case 'script_list': {
        const scripts = this.listScripts();
        return { success: true, output: scripts.map(s => ({ id: s.id, name: s.name, description: s.description })), logs: [], duration: 0 };
      }
      case 'script_use': {
        return this.executeScript(params.name, params.args || {});
      }
      default:
        return { success: false, error: `Unknown tool: ${tool}`, logs: [], duration: 0 };
    }
  }

  private normalizeLanguage(lang?: string): Script['language'] {
    if (lang === 'python' || lang === 'typescript') return lang;
    return 'javascript';
  }

  private saveScriptRecord(script: Script, isNew: boolean) {
    const db = getDatabase();
    if (isNew) {
      db.run(`
        INSERT INTO scripts (id, name, description, code, language, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [script.id, script.name, script.description, script.code, script.language, script.createdAt, script.updatedAt]);
    } else {
      db.run(`
        UPDATE scripts SET name = ?, description = ?, code = ?, language = ?, updated_at = ?
        WHERE id = ?
      `, [script.name, script.description, script.code, script.language, script.updatedAt, script.id]);
    }
    saveDatabase();
    this.persistToFile(script);
    eventBus.emit(isNew ? 'script:created' : 'script:updated', script);
  }

  private persistToFile(script: Script) {
    const filePath = join(scriptsDir, `${script.id}.js`);
    try {
      writeFileSync(filePath, `// ${script.name}\n// ${script.description}\n\n${script.code}\n`, 'utf-8');
    } catch (err) {
      console.error('Failed to persist script to file:', err);
    }
  }

  private buildSafeCode(code: string, args: Record<string, any>, context: Record<string, any>, logs: string[]): string {
    const safeArgs = JSON.stringify(args);
    const safeContext = JSON.stringify(context);
    const wrapped = `
      "use strict";
      var console = {
        log: function(...a) { a.forEach(x => __logs.push(String(x))); return a[a.length-1]; },
        warn: function(...a) { a.forEach(x => __logs.push('[warn] ' + String(x))); },
        error: function(...a) { a.forEach(x => __logs.push('[error] ' + String(x))); }
      };
      var args = ${safeArgs};
      var context = ${safeContext};
      var $args = args;
      var $ctx = context;
      return eval(${JSON.stringify(code)});
    `;
    return wrapped;
  }

  private runInSandbox(code: string): any {
    const fn = new Function('__logs', code);
    const logs: string[] = [];
    const result = fn(logs);
    // copy logs from local scope into outer capture? not needed, buildSafeCode uses closure __logs param
    return result;
  }

  private rowToScript(columns: string[], row: any[]): Script {
    const s: any = {};
    columns.forEach((col, idx) => { s[col] = row[idx]; });
    return {
      id: s.id,
      name: s.name,
      description: s.description,
      code: s.code,
      language: s.language,
      createdAt: s.created_at,
      updatedAt: s.updated_at
    };
  }
}

export const scriptMcp = new ScriptMcp();
