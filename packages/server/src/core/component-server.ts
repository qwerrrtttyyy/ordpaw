import { Router, static as serveStatic, type IRouter } from 'express';
import { readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import type { ComponentContribution } from '@ordpaw/shared';
import { getDatabase, saveDatabase } from '../db/index.js';
import { providerModelsCache } from './cache.js';

const PLUGINS_DIR = join(process.cwd(), 'plugins');

export class ComponentServer {
  private contributions: ComponentContribution[] = [];
  private pluginPaths = new Map<string, string>();

  register(pluginName: string, contributions: ComponentContribution[], pluginPath: string) {
    this.pluginPaths.set(pluginName, pluginPath);

    // 移除该插件旧贡献，避免重复注册（例如从数据库加载后再由插件 loader 注册）
    this.contributions = this.contributions.filter(c => c.metadata?.__plugin !== pluginName);

    // 去重并记录来源
    const normalized = contributions.map(c => ({
      ...c,
      src: this.normalizeSrc(pluginName, c.src),
      metadata: { ...(c.metadata || {}), __plugin: pluginName }
    }));
    this.contributions.push(...normalized);

    this.persist(pluginName, normalized);
    providerModelsCache.delete(`components:${pluginName}`);
  }

  getManifest(): ComponentContribution[] {
    return this.contributions.slice();
  }

  getRouter(): IRouter {
    const router = Router();
    router.get('/manifest', (req, res) => {
      res.json(this.getManifest());
    });

    // 插件静态资源服务：/components/:pluginName/*
    router.use('/:pluginName', (req, res, next) => {
      const pluginName = req.params.pluginName;
      const pluginPath = this.pluginPaths.get(pluginName);
      if (!pluginPath) {
        res.status(404).json({ error: 'Plugin not found' });
        return;
      }
      const staticHandler = serveStatic(pluginPath, {
        fallthrough: false,
        index: false
      });
      staticHandler(req, res, next);
    });

    return router;
  }

  private normalizeSrc(pluginName: string, src: string): string {
    if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('/')) {
      return src;
    }
    return `/components/${pluginName}/${src.replace(/^\.\/?/, '')}`;
  }

  private persist(pluginName: string, contributions: ComponentContribution[]) {
    try {
      const db = getDatabase();
      db.run('DELETE FROM components WHERE plugin_name = ?', [pluginName]);
      for (const c of contributions) {
        const id = `${pluginName}:${c.name}`;
        db.run(`
          INSERT INTO components (id, plugin_name, type, name, src, slot, metadata_json, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [id, pluginName, c.type, c.name, c.src, c.slot || null, JSON.stringify(c.metadata || {}), Date.now()]);
      }
      saveDatabase();
    } catch (err) {
      console.error('组件持久化失败:', err);
    }
  }

  loadFromDatabase() {
    try {
      const db = getDatabase();
      const result = db.exec('SELECT * FROM components ORDER BY created_at ASC');
      if (result.length === 0) return;
      const columns = result[0].columns;
      this.contributions = result[0].values.map(row => {
        const c: any = {};
        columns.forEach((col, idx) => c[col] = row[idx]);
        return {
          type: c.type,
          name: c.name,
          src: c.src,
          slot: c.slot,
          metadata: safeJsonParse(c.metadata_json, {})
        } as ComponentContribution;
      });
    } catch (err) {
      console.error('loadFromDatabase 组件失败:', err);
    }
  }
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

export const componentServer = new ComponentServer();
