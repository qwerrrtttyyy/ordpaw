import { Router, static as serveStatic, type IRouter } from 'express';
import { readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import type { ComponentContribution } from '@ordpaw/shared';
import { getDatabase, saveDatabase } from '../db/index.js';
import { providerModelsCache } from './cache.js';
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
  metadata: Record<string, any>;
}

export interface ComponentTree {
  root: ComponentNode[];
  relationships: Map<string, string[]>;
}

export class ComponentServer {
  private contributions: ComponentContribution[] = [];
  private pluginPaths = new Map<string, string>();
  private componentTree: ComponentTree = { root: [], relationships: new Map() };

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
    this.buildComponentTree();
    // Use a dedicated cache-key namespace for components instead of reusing
    // the provider-models cache key space.
    providerModelsCache.delete(`__components__:${pluginName}`);
  }

  getManifest(): ComponentContribution[] {
    return this.contributions.slice();
  }

  getRouter(): IRouter {
    const router = Router();
    router.get('/manifest', (req, res) => {
      res.json(this.getManifest());
    });

    router.get('/tree', (req, res) => {
      res.json(this.getComponentTree());
    });

    router.get('/relationships', (req, res) => {
      const relationships = Array.from(this.componentTree.relationships.entries()).map(([from, to]) => ({ from, to }));
      res.json(relationships);
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
      // 数据库未初始化时静默处理（测试环境/早期启动阶段）
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

  getComponentTree(): any {
    return {
      root: this.componentTree.root,
      relationships: Array.from(this.componentTree.relationships.entries()).map(([from, to]) => ({ from, to }))
    };
  }

  private buildComponentTree() {
    const nodeMap = new Map<string, ComponentNode>();
    const rootNodes: ComponentNode[] = [];
    const relationships = new Map<string, string[]>();

    // 创建所有节点
    for (const c of this.contributions) {
      const id = `${c.metadata?.__plugin}:${c.name}`;
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

    // 建立父子关系
    for (const c of this.contributions) {
      const id = `${c.metadata?.__plugin}:${c.name}`;
      const node = nodeMap.get(id);
      if (!node) continue;

      // 如果有 slot，说明是子组件
      if (c.slot) {
        const parentId = this.findParentBySlot(c.slot);
        if (parentId) {
          const parent = nodeMap.get(parentId);
          if (parent) {
            parent.children.push(node);
            node.parent = parentId;

            // 记录关系
            if (!relationships.has(parentId)) {
              relationships.set(parentId, []);
            }
            relationships.get(parentId)!.push(id);
          }
        }
      } else {
        // 没有 slot，是根组件
        rootNodes.push(node);
      }
    }

    this.componentTree = { root: rootNodes, relationships };
  }

  private findParentBySlot(slot: string): string | null {
    // 根据 slot 名称查找父组件
    // 例如 slot="sidebar" 查找 name="sidebar" 的组件
    for (const c of this.contributions) {
      if (c.name === slot) {
        return `${c.metadata?.__plugin}:${c.name}`;
      }
    }
    return null;
  }
}

export const componentServer = new ComponentServer();
