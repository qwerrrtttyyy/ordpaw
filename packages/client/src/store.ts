import type { Locale, PerformanceTier, Settings, ThemeId } from '@ordpaw/shared';
import { setLocale } from './i18n';

export class Store {
  private settings: Settings = {
    theme: 'ordpaw-light',
    uiMode: 'classic',
    uiEffects: 'balanced',
    performanceMode: 'auto',
    locale: 'zh-CN',
    debugMode: false,
    logLevel: 'info',
    checkpointStrategy: 'every-message',
    apiKeys: {},
    apiEndpoints: {},
    downloadStorage: 'browser',
    browserStorageBackend: 'indexeddb',
    storageQuota: {
      browserMaxBytes: 500 * 1024 * 1024,
      serverMaxBytes: 2 * 1024 * 1024 * 1024,
      enforce: true,
      serverPath: './downloads'
    }
  };

  getSettings(): Settings {
    return { ...this.settings };
  }

  setSettings(settings: Partial<Settings>) {
    this.settings = { ...this.settings, ...settings };
    if (settings.locale) {
      setLocale(settings.locale);
    }
  }

  getTheme(): ThemeId {
    return this.settings.theme;
  }

  setTheme(theme: ThemeId) {
    this.settings.theme = theme;
  }

  getUIMode(): 'classic' | 'modern' {
    return this.settings.uiMode || 'classic';
  }

  setUIMode(mode: 'classic' | 'modern') {
    this.settings.uiMode = mode;
  }

  getUIEffects(): 'minimal' | 'balanced' | 'expressive' {
    return this.settings.uiEffects || 'balanced';
  }

  setUIEffects(effects: 'minimal' | 'balanced' | 'expressive') {
    this.settings.uiEffects = effects;
  }

  getPerformanceMode(): PerformanceTier {
    return this.settings.performanceMode || 'auto';
  }

  setPerformanceMode(mode: PerformanceTier) {
    this.settings.performanceMode = mode;
  }

  getLocale(): Locale {
    return this.settings.locale;
  }

  setLocale(locale: Locale) {
    this.settings.locale = locale;
    setLocale(locale);
  }
}
