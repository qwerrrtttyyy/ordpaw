import type { ComponentContribution } from '@ordpaw/shared';

/**
 * Track loaded contributions by src URL so we don't double-inject.
 * Can be cleared by `reloadPluginComponents` to allow full refresh.
 */
const loaded = new Set<string>();
const injectedScripts = new Map<string, HTMLScriptElement>();
const injectedLinks = new Map<string, HTMLLinkElement>();

export async function loadPluginComponents(baseUrl = '/api/components/manifest'): Promise<ComponentContribution[]> {
  try {
    const res = await fetch(baseUrl);
    if (!res.ok) return [];
    const contributions: ComponentContribution[] = await res.json();
    const seen = new Set<string>();
    for (const c of contributions) {
      seen.add(c.src);
      if (loaded.has(c.src)) continue;
      loaded.add(c.src);
      if (c.type === 'css') {
        injectCss(c.src);
      } else if (c.type === 'script' || c.type === 'component') {
        await injectScript(c.src);
      }
    }
    return contributions;
  } catch (err) {
    console.warn('组件加载失败:', err);
    return [];
  }
}

/**
 * Full reload: remove previously injected script/link tags and re-fetch
 * the manifest. Useful after installing/uninstalling a plugin at runtime.
 */
export async function reloadPluginComponents(baseUrl = '/api/components/manifest'): Promise<ComponentContribution[]> {
  for (const [, el] of injectedScripts) el.remove();
  for (const [, el] of injectedLinks) el.remove();
  injectedScripts.clear();
  injectedLinks.clear();
  loaded.clear();
  return loadPluginComponents(baseUrl);
}

function injectCss(href: string) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
  injectedLinks.set(href, link);
}

function injectScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
    injectedScripts.set(src, script);
  });
}
