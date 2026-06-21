import { readdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { skillRunner } from '../core/skill-runner.js';
import { eventBus } from '../core/event-bus.js';
import { componentServer } from '../core/component-server.js';
import { sessionManager } from '../core/session.js';
import { pluginStorage } from '../core/plugin-storage.js';
import type { PluginApi, Plugin, ComponentContribution } from '@ordpaw/shared';
import { createLogger } from '../core/logger.js';
import { validateManifest, validatePluginModule, validateSkillDefinition } from './validation.js';

const PLUGINS_DIR = join(process.cwd(), 'plugins');

function createPluginApi(pluginName: string, pluginPath: string): PluginApi {
  const pluginLogger = createLogger(`plugin:${pluginName}`);
  return {
    logger: pluginLogger,
    config: {},
    registerSkill: (skill) => {
      if (!validateSkillDefinition(skill)) {
        throw new Error(`插件 ${pluginName} 注册的技能定义无效：必须包含 id、name 和 execute 函数`);
      }
      skillRunner.registerSkill(skill);
      pluginLogger.info(`注册了技能: ${skill.name}`);
    },
    getSession: (id) => sessionManager.getConversation(id),
    emit: (event, data) => {
      eventBus.emit(event, data);
    },
    registerComponent: (contribution) => {
          componentServer.register(pluginName, [contribution], pluginPath);
          pluginLogger.info(`注册了组件: ${contribution.name}`);
        },
    db: {
      get: (key) => pluginStorage.get(pluginName, key),
      set: (key, value) => pluginStorage.set(pluginName, key, value),
      delete: (key) => pluginStorage.delete(pluginName, key),
      list: () => pluginStorage.list(pluginName),
      clear: () => pluginStorage.clear(pluginName),
    }
  };
}

const loaderLogger = createLogger('plugin:loader');

export async function loadPlugins() {
  if (!existsSync(PLUGINS_DIR)) {
    loaderLogger.info('插件目录不存在，跳过插件加载');
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
        loaderLogger.warn(`插件 ${pluginName} 缺少 plugin.json，跳过`);
        continue;
      }

      const rawManifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
      if (!validateManifest(rawManifest)) {
        loaderLogger.warn(`插件 ${pluginName} 的 plugin.json 格式无效，跳过`);
        continue;
      }
      const manifest = rawManifest;

      const mainFile = join(pluginPath, manifest.main || 'index.js');

      if (!existsSync(mainFile)) {
        loaderLogger.warn(`插件 ${pluginName} 主文件不存在，跳过`);
        continue;
      }

      const module = await import(pathToFileURL(mainFile).href);
      const plugin: unknown = module.default;

      if (!validatePluginModule(plugin)) {
        loaderLogger.warn(`插件 ${pluginName} 导出模块格式无效，跳过`);
        continue;
      }
      const typedPlugin = plugin as Plugin;

      const api = createPluginApi(pluginName, pluginPath);

      if (typedPlugin.onLoad) {
        await typedPlugin.onLoad(api);
      }

      if (typedPlugin.handlers) {
        for (const [event, handler] of Object.entries(typedPlugin.handlers)) {
          eventBus.on(event, handler);
        }
      }

      if (manifest.frontend && Array.isArray(manifest.frontend)) {
        componentServer.register(pluginName, manifest.frontend as ComponentContribution[], pluginPath);
        loaderLogger.info(`插件 ${pluginName} 注册了 ${manifest.frontend.length} 个前端组件`);
      }

      loaderLogger.info(`插件 ${pluginName} 已加载`);
    } catch (error) {
      loaderLogger.error(`插件 ${pluginName} 加载失败:`, error);
    }
  }
}
