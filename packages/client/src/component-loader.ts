import type { ComponentContribution } from '@ordpaw/shared';

const loaded = new Set<string>();

export async function loadPluginComponents(baseUrl = '/api/components/manifest') {
  try {
    const res = await fetch(baseUrl);
    if (!res.ok) return;
    const contributions: ComponentContribution[] = await res.json();
    for (const c of contributions) {
      if (loaded.has(c.src)) continue;
      loaded.add(c.src);
      if (c.type === 'css') {
        injectCss(c.src);
      } else if (c.type === 'script') {
        await injectScript(c.src);
      } else if (c.type === 'component') {
        await injectScript(c.src);
      }
    }
    return contributions;
  } catch (err) {
    console.warn('组件加载失败:', err);
  }
}

function injectCss(href: string) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

function injectScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}
