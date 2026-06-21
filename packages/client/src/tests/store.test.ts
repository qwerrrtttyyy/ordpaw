import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Store } from '../store';
import * as i18n from '../i18n';

describe('Store', () => {
  let store: Store;

  beforeEach(() => {
    vi.spyOn(i18n, 'setLocale').mockImplementation(() => {});
    store = new Store();
  });

  it('returns default settings', () => {
    const settings = store.getSettings();
    expect(settings.theme).toBe('ordpaw-light');
    expect(settings.locale).toBe('zh-CN');
    expect(settings.uiMode).toBe('classic');
  });

  it('updates settings', () => {
    store.setSettings({ theme: 'ordpaw-dark' });
    expect(store.getSettings().theme).toBe('ordpaw-dark');
  });

  it('sets locale and calls i18n', () => {
    store.setLocale('en-US');
    expect(store.getLocale()).toBe('en-US');
    expect(i18n.setLocale).toHaveBeenCalledWith('en-US');
  });

  it('updates theme', () => {
    store.setTheme('ordpaw-dark');
    expect(store.getTheme()).toBe('ordpaw-dark');
  });

  it('updates UI mode', () => {
    store.setUIMode('modern');
    expect(store.getUIMode()).toBe('modern');
  });

  it('updates UI effects', () => {
    store.setUIEffects('minimal');
    expect(store.getUIEffects()).toBe('minimal');
  });

  it('updates performance mode', () => {
    store.setPerformanceMode('high');
    expect(store.getPerformanceMode()).toBe('high');
  });
});
