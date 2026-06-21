import { readdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { pathToFileURL } from 'url';
import db from '../db/index.js';
import { getDatabase, saveDatabase } from '../db/index.js';
import { skillRunner } from '../core/skill-runner.js';
import { eventBus } from '../core/event-bus.js';
import { componentServer } from '../core/component-server.js';
import { sessionManager } from '../core/session.js';
import { queryOne, queryAll } from '../db/utils.js';
import type { ComponentContribution } from '@ordpaw/shared';

const PLUGINS_DIR = join(process.cwd(), 'plugins');

export function createPluginApi(pluginName: string, pluginPath: string) {
  return {
    logger: {
      info: (...args: any[]) => console.log(`[${pluginName}]`, ...args),
      debug: (...args: any[]) => console.debug(`[${pluginName}]`, ...args),
      warn: (...args: any[]) => console.warn(`[${pluginName}]`, ...args),
      error: (...args: any[]) => console.error(`[${pluginName}]`, ...args),
    },
    config: {},
    registerSkill: (skill: { id: string; name: string; description: string; parameters: any; execute: (params: any) => Promise<any> }) => {
      skillRunner.registerSkill(skill);
      console.log(`插件 ${pluginName} 注册了技能: ${skill.name}`);
    },
    getSession: (id: string) => {
      return sessionManager.getConversation(id);
    },
    emit: (event: string, data: any) => {
      eventBus.emit(event, data);
    },
    registerComponent: (contribution: ComponentContribution) => {
      componentServer.register(pluginName, [contribution], pluginPath);
      console.log(`插件 ${pluginName} 注册了组件: ${contribution.name}`);
    },
    db: {
      get: (key: string) => {
        const row = queryOne<any>(
          getDatabase(),
          'SELECT value_json FROM plugin_storage WHERE plugin_name = ? AND key = ?',
          [pluginName, key]
        );
        if (!row) return undefined;
        try { return JSON.parse(row.value_json); } catch { return undefined; }
      },
      set: (key: string, value: any) => {
        const valueJson = JSON.stringify(value);
        getDatabase().run(
          `INSERT INTO plugin_storage (plugin_name, key, value_json, updated_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(plugin_name, key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
          [pluginName, key, valueJson, Date.now()]
        );
        saveDatabase();
      },
      delete: (key: string) => {
        getDatabase().run(
          'DELETE FROM plugin_storage WHERE plugin_name = ? AND key = ?',
          [pluginName, key]
        );
        saveDatabase();
      },
      list: () => {
        const rows = queryAll<any>(
          getDatabase(),
          'SELECT key FROM plugin_storage WHERE plugin_name = ? ORDER BY key ASC',
          [pluginName]
        );
        return rows.map(r => r.key);
      },
      clear: () => {
        getDatabase().run(
          'DELETE FROM plugin_storage WHERE plugin_name = ?',
          [pluginName]
        );
        saveDatabase();
      }
    }
  };
}

export async function loadPlugins() {
  if (!existsSync(PLUGINS_DIR)) {
    console.log('插件目录不存在，跳过插件加载');
    return;
  }

  const pluginDirs = readdirSync(PLUGINS_DIR, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

  for (const pluginName of pluginDirs) {
    try {
      const pluginPath = join(PLUGINS_DIR, pluginName);
      const manifestPath = join(pluginPath, 'plugin.json');
      
      if (!existsSync(manifestPath)) {
        console.warn(`插件 ${pluginName} 缺少 plugin.json，跳过`);
        continue;
      }

      const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
      const mainFile = join(pluginPath, manifest.main || 'index.js');
      
      if (!existsSync(mainFile)) {
        console.warn(`插件 ${pluginName} 主文件不存在，跳过`);
        continue;
      }

      const { default: plugin } = await import(pathToFileURL(mainFile).href);

      // 创建插件 API
      const api = createPluginApi(pluginName, pluginPath);

      // 调用 onLoad
      if (plugin.onLoad) {
        await plugin.onLoad(api);
      }

      // 注册事件处理器
      if (plugin.handlers) {
        for (const [event, handler] of Object.entries(plugin.handlers)) {
          eventBus.on(event, handler as any);
        }
      }

      // 注册前端组件贡献
      if (manifest.frontend && Array.isArray(manifest.frontend)) {
        componentServer.register(pluginName, manifest.frontend as ComponentContribution[], pluginPath);
        console.log(`插件 ${pluginName} 注册了 ${manifest.frontend.length} 个前端组件`);
      }

      console.log(`✅ 插件 ${pluginName} 已加载`);
    } catch (error) {
      console.error(`❌ 插件 ${pluginName} 加载失败:`, error);
    }
  }
}
