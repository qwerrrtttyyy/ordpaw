import { Router, static as serveStatic, type IRouter } from 'express';
import { existsSync } from 'fs';
import { join, resolve } from 'path';
import type { ComponentContribution } from '@ordpaw/shared';
import { getDatabase, saveDatabase } from '../db/index.js';
import { queryAll, safeJsonParse } from '../db/utils.js';

const PLUGINS_DIR = join(process.cwd(), 'plugins');

export interface ComponentNode {
  id: string;
  name: string;
  type: string;
  src: string;
  slot?: string;
  plugin: string;
  children: ComponentNode[];
  parent?: string;
  metadata: Record<string, unknown>;
}

export interface ComponentTree {
  root: ComponentNode[];
  relationships: Map<string, string[]>;
}

interface RegisterRequest {
  plugin: string;
  contributions: ComponentContribution[];
}

class ComponentServerImpl {
  private contributions: ComponentContribution[] = [];
  private pluginPaths = new Map<string, string>();
  private componentTree: ComponentTree = { root: [], relationships: new Map() };
  private builtInContributions: ComponentContribution[] = [];

  register(pluginName: string, contributions: ComponentContribution[], pluginPath: string) {
    this.pluginPaths.set(pluginName, pluginPath);

    this.contributions = this.contributions.filter(c => c.metadata?.__plugin !== pluginName);

    const normalized = contributions.map(c => ({
      ...c,
      src: this.normalizeSrc(pluginName, c.src),
      metadata: { ...(c.metadata || {}), __plugin: pluginName }
    }));
    this.contributions.push(...normalized);

    this.persist(pluginName, normalized);
    this.buildComponentTree();
  }

  registerBuiltIn(contributions: ComponentContribution[]) {
    for (const c of contributions) {
      if (!c.metadata?.__plugin) c.metadata = { ...(c.metadata || {}), __plugin: 'ordpaw-core' };
    }
    this.builtInContributions = [...this.builtInContributions, ...contributions];
    this.contributions.push(...contributions);
    this.buildComponentTree();
  }

  unregister(pluginName: string): boolean {
    const before = this.contributions.length;
    this.contributions = this.contributions.filter(c => c.metadata?.__plugin !== pluginName);
    this.pluginPaths.delete(pluginName);
    const db = getDatabase();
    db.run('DELETE FROM components WHERE plugin_name = ?', [pluginName]);
    saveDatabase();
    this.buildComponentTree();
    return this.contributions.length !== before;
  }

  getManifest(): ComponentContribution[] {
    return [...this.contributions];
  }

  getComponentTree(): {
    root: ComponentNode[];
    relationships: Array<{ from: string; to: string }>;
  } {
    return {
      root: this.componentTree.root,
      relationships: Array.from(this.componentTree.relationships.entries()).flatMap(([from, list]) => list.map(to => ({ from, to })))
    };
  }

  getNodesByPlugin(plugin: string): ComponentContribution[] {
    return this.contributions.filter(c => c.metadata?.__plugin === plugin);
  }

  getPlugins(): string[] {
    return Array.from(this.pluginPaths.keys());
  }

  getStats(): {
    totalComponents: number;
    totalPlugins: number;
    byType: Record<string, number>;
    byPlugin: Record<string, number>;
  } {
    const byType: Record<string, number> = {};
    const byPlugin: Record<string, number> = {};
    for (const c of this.contributions) {
      byType[c.type] = (byType[c.type] || 0) + 1;
      const plugin = c.metadata?.__plugin || 'unknown';
      byPlugin[plugin] = (byPlugin[plugin] || 0) + 1;
    }
    return {
      totalComponents: this.contributions.length,
      totalPlugins: this.pluginPaths.size,
      byType,
      byPlugin
    };
  }

  getRouter(): IRouter {
    const router = Router();

    router.get('/manifest', (_req, res) => {
      res.json({
        version: '0.0.3',
        items: this.getManifest()
      });
    });

    router.get('/tree', (_req, res) => {
      res.json(this.getComponentTree());
    });

    router.get('/relationships', (_req, res) => {
      const relationships = Array.from(this.componentTree.relationships.entries()).map(([from, to]) => ({ from, to }));
      res.json({ relationships });
    });

    router.get('/plugins', (_req, res) => {
      res.json({ plugins: this.getPlugins(), stats: this.getStats() });
    });

    router.get('/plugins/:name', (req, res) => {
      const items = this.getNodesByPlugin(req.params.name);
      if (items.length === 0 && !this.pluginPaths.has(req.params.name)) {
        res.status(404).json({ error: 'Plugin not found' });
        return;
      }
      res.json({ plugin: req.params.name, components: items });
    });

    router.post('/register', (req, res) => {
      try {
        const body = req.body as Partial<RegisterRequest>;
        if (!body?.plugin || !Array.isArray(body.contributions)) {
          res.status(400).json({ error: 'Invalid payload. Expected { plugin, contributions[] }.' });
          return;
        }
        const path = body.plugin === 'ordpaw-core' ? join(process.cwd(), 'src') :
          this.pluginPaths.get(body.plugin) || join(PLUGINS_DIR, body.plugin);
        this.register(body.plugin, body.contributions, path);
        res.json({ registered: body.plugin, count: this.getNodesByPlugin(body.plugin).length });
      } catch (err) {
        res.status(500).json({ error: 'Internal error', message: (err as Error).message });
      }
    });

    router.delete('/plugins/:name', (req, res) => {
      const ok = this.unregister(req.params.name);
      res.json({ plugin: req.params.name, removed: ok });
    });

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
    if (!src) return '';
    if (/^https?:\/\//.test(src) || src.startsWith('/')) return src;
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
      if (process.env.NODE_ENV !== 'test') {
        console.error('组件持久化失败:', err);
      }
    }
  }

  loadFromDatabase() {
    try {
      const db = getDatabase();
      const rows = queryAll<any>(db, 'SELECT * FROM components ORDER BY created_at ASC');
      this.contributions = rows.map(c => ({
        type: c.type,
        name: c.name,
        src: c.src,
        slot: c.slot,
        metadata: safeJsonParse(c.metadata_json, {})
      }) as ComponentContribution);
      this.buildComponentTree();
    } catch (err) {
      console.error('loadFromDatabase 组件失败:', err);
    }
  }

  private buildComponentTree() {
    const nodeMap = new Map<string, ComponentNode>();
    const rootNodes: ComponentNode[] = [];
    const relationships = new Map<string, string[]>();

    for (const c of this.contributions) {
      const id = `${c.metadata?.__plugin || 'unknown'}:${c.name}`;
      const node: ComponentNode = {
        id,
        name: c.name,
        type: c.type,
        src: c.src,
        slot: c.slot,
        plugin: c.metadata?.__plugin || 'unknown',
        children: [],
        metadata: c.metadata || {}
      };
      nodeMap.set(id, node);
    }

    const byName = new Map<string, ComponentNode>();
    for (const [, node] of nodeMap) byName.set(`${node.plugin}:${node.name}`, node);

    for (const [, node] of nodeMap) {
      if (node.slot) {
        const key = `${node.plugin}:${node.slot}`;
        let parent = byName.get(key);
        if (!parent) {
          parent = Array.from(nodeMap.values()).find(p => p.name === node.slot && p.id !== node.id);
        }
        if (parent) {
          parent.children.push(node);
          node.parent = parent.id;
          if (!relationships.has(parent.id)) relationships.set(parent.id, []);
          relationships.get(parent.id)!.push(node.id);
          continue;
        }
      }
      rootNodes.push(node);
    }

    // 去重：根节点不应该包含任何父节点
    const dedupRoots = rootNodes.filter(n => !n.parent || !nodeMap.has(n.parent));
    this.componentTree = { root: dedupRoots, relationships };
  }
}

export const ComponentServer = ComponentServerImpl;
export const componentServer = new ComponentServerImpl();
