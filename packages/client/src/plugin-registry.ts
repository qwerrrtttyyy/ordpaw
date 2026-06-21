import { logger } from './logger';

const eventHandlers: Record<string, Array<(payload: unknown) => void>> = {};
const actionHandlers: Record<
  string,
  (params: Record<string, unknown>, context: unknown) => unknown
> = {};
let settingsGetter: (() => Record<string, unknown>) | null = null;

const apiObject = {
  registerActionHandler(
    type: string,
    handler: (params: Record<string, unknown>, context: unknown) => unknown
  ) {
    actionHandlers[type] = handler;
  },
  unregisterActionHandler(type: string) {
    delete actionHandlers[type];
  },
  emit(event: string, payload?: unknown) {
    const handlers = eventHandlers[event];
    if (handlers) {
      for (const h of handlers) {
        try {
          h(payload);
        } catch (e) {
          logger.error(e, '[PluginRegistry] event handler error');
        }
      }
    }
  },
  on(event: string, handler: (payload: unknown) => void): () => void {
    if (!eventHandlers[event]) eventHandlers[event] = [];
    eventHandlers[event].push(handler);
    return () => {
      const idx = eventHandlers[event].indexOf(handler);
      if (idx >= 0) eventHandlers[event].splice(idx, 1);
    };
  },
  toast(message: string) {
    window.dispatchEvent(new CustomEvent('ordpaw-toast', { detail: message }));
  },
  getSettings(): Record<string, unknown> {
    return settingsGetter ? settingsGetter() : {};
  },
};

const pluginRegistry = {
  setSettingsGetter(getter: () => Record<string, unknown>) {
    settingsGetter = getter;
  },
  api() {
    return apiObject;
  },
};

type GlobalWithOrdPaw = typeof globalThis & Record<string, unknown>;

export function installGlobalPluginApi(settingsGetter: () => Record<string, unknown>) {
  pluginRegistry.setSettingsGetter(settingsGetter);
  const api = pluginRegistry.api();
  const ns =
    ((globalThis as GlobalWithOrdPaw).__ordpaw as Record<string, unknown> | undefined) || {};
  ns.OrdPaw = api;
  (globalThis as GlobalWithOrdPaw).__ordpaw = ns;
  // 保留旧版别名，让已部署的插件脚本无需改动即可运行。
  (globalThis as GlobalWithOrdPaw).OrdPaw = api;
}
