const eventHandlers: Record<string, Array<(payload: any) => void>> = {};
const actionHandlers: Record<string, (params: Record<string, any>, context: any) => any> = {};
let settingsGetter: (() => Record<string, any>) | null = null;

const apiObject = {
  registerActionHandler(type: string, handler: (params: Record<string, any>, context: any) => any) {
    actionHandlers[type] = handler;
  },
  unregisterActionHandler(type: string) {
    delete actionHandlers[type];
  },
  emit(event: string, payload?: any) {
    const handlers = eventHandlers[event];
    if (handlers) {
      for (const h of handlers) {
        try { h(payload); } catch (e) { console.error('[PluginRegistry] event handler error:', e); }
      }
    }
  },
  on(event: string, handler: (payload: any) => void): () => void {
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
  getSettings(): Record<string, any> {
    return settingsGetter ? settingsGetter() : {};
  },
};

const pluginRegistry = {
  setSettingsGetter(getter: () => Record<string, any>) {
    settingsGetter = getter;
  },
  api() {
    return apiObject;
  },
};

export function installGlobalPluginApi(settingsGetter: () => Record<string, any>) {
  pluginRegistry.setSettingsGetter(settingsGetter);
  const api = pluginRegistry.api();
  const ns = (globalThis as any).__ordpaw || {};
  ns.OrdPaw = api;
  (globalThis as any).__ordpaw = ns;
  (globalThis as any).OrdPaw = api;
}