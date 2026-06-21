import type { ComponentContribution } from '@ordpaw/shared';
import { logger } from './logger';

type LifecycleHook = (el: HTMLElement) => void | Promise<void>;

interface ComponentInstance {
  id: string;
  name: string;
  type: string;
  src: string;
  plugin: string;
  metadata: Record<string, unknown>;
  mount?: LifecycleHook;
  unmount?: LifecycleHook;
  mountedElements: WeakSet<HTMLElement>;
  loaded: boolean;
}

const loaded = new Set<string>();
const injectedScripts = new Map<string, HTMLScriptElement>();
const injectedLinks = new Map<string, HTMLLinkElement>();
const componentRegistry = new Map<string, ComponentInstance>();
const lifecycleHooks = new Map<string, { mount?: LifecycleHook; unmount?: LifecycleHook }>();

export async function loadPluginComponents(baseUrl = '/api/components/manifest'): Promise<ComponentContribution[]> {
  try {
    const res = await fetch(baseUrl);
    if (!res.ok) return [];
    const contributions: ComponentContribution[] = await res.json();
    for (const c of contributions) {
      if (loaded.has(c.src)) continue;
      loaded.add(c.src);
      if (c.type === 'css') {
        injectCss(c.src);
      } else if (c.type === 'script' || c.type === 'component') {
        await injectScript(c.src);
      }
      const id = `${c.metadata?.__plugin}:${c.name}`;
      const instance: ComponentInstance = {
        id,
        name: c.name,
        type: c.type,
        src: c.src,
        plugin: c.metadata?.__plugin || 'unknown',
        metadata: c.metadata || {},
        mountedElements: new WeakSet(),
        loaded: true
      };
      const hooks = lifecycleHooks.get(id);
      if (hooks) {
        instance.mount = hooks.mount;
        instance.unmount = hooks.unmount;
      }
      componentRegistry.set(id, instance);
    }
    return contributions;
  } catch (err) {
    logger.warn(err, '组件加载失败');
    return [];
  }
}

export async function loadComponentTree(baseUrl = '/api/components/tree'): Promise<unknown> {
  try {
    const res = await fetch(baseUrl);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    logger.warn(err, '组件树加载失败');
    return null;
  }
}

export function getComponentRegistry(): Map<string, ComponentInstance> {
  return componentRegistry;
}

export function getComponentById(id: string): ComponentInstance | undefined {
  return componentRegistry.get(id);
}

export function getComponentsByPlugin(pluginName: string): ComponentInstance[] {
  const result: ComponentInstance[] = [];
  for (const component of componentRegistry.values()) {
    if (component.plugin === pluginName) {
      result.push(component);
    }
  }
  return result;
}

export async function reloadPluginComponents(baseUrl = '/api/components/manifest'): Promise<ComponentContribution[]> {
  for (const [, el] of injectedScripts) el.remove();
  for (const [, el] of injectedLinks) el.remove();
  injectedScripts.clear();
  injectedLinks.clear();
  loaded.clear();
  componentRegistry.clear();
  return loadPluginComponents(baseUrl);
}

/**
 * 注册组件的生命周期钩子。
 * 该函数应在加载组件之前调用，以确保钩子能够被附加。
 */
export function registerLifecycle(
  id: string,
  hooks: { mount?: LifecycleHook; unmount?: LifecycleHook }
): void {
  lifecycleHooks.set(id, hooks);
  const instance = componentRegistry.get(id);
  if (instance) {
    instance.mount = hooks.mount;
    instance.unmount = hooks.unmount;
  }
}

/**
 * 将组件挂载到 DOM 元素。
 * 在挂载时执行 mount 钩子（如果已注册）。
 */
export async function mountComponent(id: string, el: HTMLElement): Promise<void> {
  const instance = componentRegistry.get(id);
  if (!instance) {
    logger.warn(`[ComponentLoader] 组件 ${id} 未注册`);
    return;
  }
  el.setAttribute('data-component-id', id);
  instance.mountedElements.add(el);
  if (instance.mount) {
    try {
      await instance.mount(el);
    } catch (err) {
      logger.error(err, `[ComponentLoader] 挂载组件 ${id} 失败`);
    }
  }
}

/**
 * 从 DOM 元素卸载组件。
 * 在卸载时执行 unmount 钩子（如果已注册）。
 */
export async function unmountComponent(id: string, el: HTMLElement): Promise<void> {
  const instance = componentRegistry.get(id);
  if (!instance) return;
  if (instance.unmount) {
    try {
      await instance.unmount(el);
    } catch (err) {
      logger.error(err, `[ComponentLoader] 卸载组件 ${id} 失败`);
    }
  }
  el.removeAttribute('data-component-id');
}

/**
 * 动态注册组件（无需后端持久化）。
 * 主要用于运行时添加临时组件。
 * 会自动绑定先前通过 registerLifecycle 注册的钩子。
 */
export function registerRuntimeComponent(contribution: ComponentContribution): void {
  const id = `${contribution.metadata?.__plugin || 'runtime'}:${contribution.name}`;
  const existing = componentRegistry.get(id);
  if (existing) {
    logger.warn(`[ComponentLoader] 组件 ${id} 已存在，将被覆盖`);
  }
  // 优先保留已注册的钩子
  const hooks = lifecycleHooks.get(id);
  const instance: ComponentInstance = {
    id,
    name: contribution.name,
    type: contribution.type,
    src: contribution.src,
    plugin: contribution.metadata?.__plugin || 'runtime',
    metadata: contribution.metadata || {},
    mountedElements: new WeakSet(),
    loaded: true,
    mount: existing?.mount ?? hooks?.mount,
    unmount: existing?.unmount ?? hooks?.unmount
  };
  if (contribution.type === 'css') {
    injectCss(contribution.src);
  }
  componentRegistry.set(id, instance);
  loaded.add(contribution.src);
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
