class PluginRegistry {
  private settingsGetter: (() => Record<string, any>) | null = null;

  setSettingsGetter(getter: () => Record<string, any>) {
    this.settingsGetter = getter;
  }

  api() {
    const getSettings = () => this.settingsGetter?.() ?? {};
    return {
      get settings() {
        return getSettings();
      },
      getSetting: (key: string, defaultValue?: any) => {
        const settings = getSettings();
        return key in settings ? settings[key] : defaultValue;
      },
    };
  }
}

export const pluginRegistry = new PluginRegistry();

export function installGlobalPluginApi(settingsGetter: () => Record<string, any>) {
  pluginRegistry.setSettingsGetter(settingsGetter);
  const api = pluginRegistry.api();
  const ns = (globalThis as any).__ordpaw || {};
  ns.OrdPaw = api;
  (globalThis as any).__ordpaw = ns;
  // 保留旧版别名，让已部署的插件脚本无需改动即可运行。
  (globalThis as any).OrdPaw = api;
}
