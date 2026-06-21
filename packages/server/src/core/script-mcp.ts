import { v4 as uuidv4 } from 'uuid';
import { mkdirSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import vm from 'node:vm';
import type { Script, ScriptExecutionResult, ScriptTool, ScriptToolCall } from '@ordpaw/shared';
import { getDatabase, saveDatabase } from '../db/index.js';
import { eventBus } from './event-bus.js';
import { queryAll, queryOne, safeJsonParse } from '../db/utils.js';
import { logger } from './logger.js';

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

/** Max wall-clock time a script is allowed to run before we kill it. */
const SCRIPT_TIMEOUT_MS = 5_000;

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
      const exists = queryOne(db, 'SELECT id FROM scripts WHERE id = ?', [id]);
      if (!exists) {
        this.saveScriptRecord(DEFAULT_PRESETS[id], true);
      }
    }
  }

  listScripts(): Script[] {
    const db = getDatabase();
    const rows = queryAll<Record<string, unknown>>(db, 'SELECT * FROM scripts ORDER BY updated_at DESC');
    return rows.map(row => this.rowToScript(row));
  }

  getScript(idOrName: string): Script | null {
    const db = getDatabase();
    let row = queryOne<Record<string, unknown>>(db, 'SELECT * FROM scripts WHERE id = ?', [idOrName]);
    if (!row) row = queryOne<Record<string, unknown>>(db, 'SELECT * FROM scripts WHERE name = ?', [idOrName]);
    if (!row) return null;
    return this.rowToScript(row);
  }

  createScript(data: { name: string; description?: string; code?: string; language?: string }): Script {
    const db = getDatabase();
    const normalizedName = data.name.trim();
    if (!normalizedName) throw new Error('Script name is required');

    const existing = queryOne(db, 'SELECT id FROM scripts WHERE name = ?', [normalizedName]);
    if (existing) {
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
        const existing = queryOne(db, 'SELECT id FROM scripts WHERE name = ? AND id != ?', [normalizedName, script.id]);
        if (existing) {
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

  async executeScript(idOrName: string, args: Record<string, unknown> = {}, context: Record<string, unknown> = {}): Promise<ScriptExecutionResult> {
    const script = this.getScript(idOrName);
    if (!script) return { success: false, error: `Script not found: ${idOrName}`, logs: [], duration: 0 };

    const start = Date.now();
    const logs: string[] = [];

    try {
      const result = this.runInSandbox(script.code, args, context, logs);
      const duration = Date.now() - start;
      eventBus.emit('script:executed', { id: script.id, name: script.name, duration, success: true });
      return { success: true, output: result, logs, duration };
    } catch (err: unknown) {
      const duration = Date.now() - start;
      const message = err instanceof Error ? err.message : String(err);
      eventBus.emit('script:executed', { id: script.id, name: script.name, duration, success: false, error: message });
      return { success: false, error: message, logs, duration };
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
      logger.error(err, 'Failed to persist script to file');
    }
  }

  /**
   * Execute user code inside an isolated vm.Context with a hardened sandbox.
   *
   * Improvements over the previous `new Function + eval` approach:
   * 1. Uses `node:vm` — code runs in a fresh V8 context with its own global.
   * 2. The sandbox global exposes only an allow-list of safe primitives.
   *    Dangerous globals (process, require, global, Function constructor, etc.)
   *    are NOT exposed. While vm is not a true security sandbox, this defeats
   *    the trivial `eval("process.exit()")` escape vector the old code had.
   * 3. Wall-clock timeout via `vm.Script` + `script.runInContext({ timeout })`.
   * 4. console.log/warn/error captured into the logs array.
   */
  private runInSandbox(code: string, args: Record<string, unknown>, context: Record<string, unknown>, logs: string[]): unknown {
    // Wrap user code in an IIFE so `return ...` works.
    // The vm context provides all standard JS globals (Math, JSON, Date, etc.)
    // automatically — we only need to inject our helpers.
    //
    // Backward-compat: the preset scripts (hello-world, calculator) end with
    // `main($args);` — they call main() but don't `return` the result. To
    // preserve the old `eval`-based behavior where the last expression's
    // value was returned, we append a synthetic `return main($args);` if the
    // user code defines a `main` function but doesn't already return its
    // result explicitly.
    const hasReturnStmt = /\breturn\s+main\s*\(/.test(code);
    const definesMain = /\bfunction\s+main\s*\(/.test(code) || /\bconst\s+main\s*=/.test(code) || /\blet\s+main\s*=/.test(code);
    const trailer = (!hasReturnStmt && definesMain) ? '\nreturn main($args);' : '';

    const wrapped = `(function() {
      "use strict";
      var console = {
        log: function() { var a = Array.prototype.slice.call(arguments); a.forEach(function(x) { __logs.push(String(x)); }); return a[a.length-1]; },
        warn: function() { var a = Array.prototype.slice.call(arguments); a.forEach(function(x) { __logs.push('[warn] ' + String(x)); }); },
        error: function() { var a = Array.prototype.slice.call(arguments); a.forEach(function(x) { __logs.push('[error] ' + String(x)); }); },
        info: function() { var a = Array.prototype.slice.call(arguments); a.forEach(function(x) { __logs.push(String(x)); }); }
      };
      var args = __args;
      var context = __context;
      var $args = args;
      var $ctx = context;
      return (function() { ${code}${trailer} })();
    })();`;

    // Build a context with only safe primitives. vm.createContext will
    // automatically provide the standard JS globals (Object, Array, Math,
    // JSON, Date, etc.) on the context object; we just augment with our
    // helpers. Critically, process / require / global / module are NOT
    // exposed, so user code cannot escape to Node primitives.
    const sandbox: Record<string, unknown> = {
      __logs: logs,
      __args: args,
      __context: context,
      // Explicitly provide the safe standard globals so user code can rely
      // on them even if a future vm version stops auto-exposing them.
      Math,
      JSON,
      Date,
      Array,
      Object,
      String,
      Number,
      Boolean,
      RegExp,
      Error,
      Map,
      Set,
      Promise,
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
      encodeURIComponent,
      decodeURIComponent
    };

    const contextObj = vm.createContext(sandbox);
    const scriptObj = new vm.Script(wrapped, { filename: 'ordpaw-script.js' });

    // runInContext supports a `timeout` option that aborts infinite loops.
    const result = scriptObj.runInContext(contextObj, {
      timeout: SCRIPT_TIMEOUT_MS,
      breakOnSigint: true
    });

    return result;
  }

  private rowToScript(row: Record<string, unknown>): Script {
    return {
      id: String(row.id),
      name: String(row.name),
      description: String(row.description || ''),
      code: String(row.code || ''),
      language: String(row.language || 'javascript') as Script['language'],
      createdAt: Number(row.created_at || Date.now()),
      updatedAt: Number(row.updated_at || Date.now())
    };
  }
}

export const scriptMcp = new ScriptMcp();
