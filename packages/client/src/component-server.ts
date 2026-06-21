import type { ComponentContribution } from '@ordpaw/shared';
import { animationManager } from './animation-manager';
import { prefersReducedMotion, detectOS } from './utils';
import { logger } from './logger';

export type OSType = 'macos' | 'windows' | 'linux' | 'ios' | 'android' | 'unknown';

export interface MountOptions {
  host?: HTMLElement;
  props?: Record<string, unknown>;
  onReady?: (el: HTMLElement) => void;
}

export interface ComponentNode {
  id: string;
  name: string;
  type: 'component' | 'script' | 'css' | 'view';
  src: string;
  plugin: string;
  slot?: string;
  parent?: string;
  children: string[];
  metadata: Record<string, unknown>;
  animation?: ComponentAnimation;
  mountHook?: (el: HTMLElement, props?: Record<string, unknown>) => void | Promise<void>;
  unmountHook?: (el: HTMLElement) => void;
}

export interface ComponentAnimation {
  mount?: string;
  unmount?: string;
  interactive?: string;
  duration?: number;
  easing?: string;
  disabled?: boolean;
}

export interface ComponentTreeSnapshot {
  nodes: ComponentNode[];
  relationships: Array<{ from: string; to: string }>;
  roots: string[];
}

interface RegisteredScript {
  src: string;
  promise?: Promise<void>;
  loaded: boolean;
}

interface RegisteredStyle {
  href: string;
  injected: boolean;
}

class ComponentServerImpl {
  private nodes = new Map<string, ComponentNode>();
  private contributions = new Map<string, ComponentContribution>();
  private relationships = new Map<string, string[]>();
  private roots: string[] = [];
  private scripts = new Map<string, RegisteredScript>();
  private styles = new Map<string, RegisteredStyle>();
  private mounted = new Map<string, Set<HTMLElement>>();
  private currentOS: OSType = detectOS() as OSType;
  private initialized = false;
  private mountHooks = new Map<
    string,
    (el: HTMLElement, props?: Record<string, unknown>) => void | Promise<void>
  >();
  private unmountHooks = new Map<string, (el: HTMLElement) => void>();
  private eventListeners = new Map<string, Map<string, Set<(payload?: unknown) => void>>>();

  get isReady(): boolean {
    return this.initialized;
  }

  get os(): OSType {
    return this.currentOS;
  }

  setOS(os: OSType) {
    this.currentOS = os;
    document.documentElement.setAttribute('data-os', os);
  }

  register(contribution: ComponentContribution, plugin = 'runtime'): string {
    const pluginName = String(contribution.metadata?.__plugin || plugin);
    const id = `${pluginName}:${contribution.name}`;
    const node: ComponentNode = {
      id,
      name: contribution.name,
      type: (contribution.type as ComponentNode['type']) || 'component',
      src: this.normalizeSrc(contribution.src, plugin),
      plugin: pluginName,
      slot: contribution.slot,
      children: [],
      metadata: { ...(contribution.metadata || {}) },
      animation: contribution.animation as ComponentAnimation | undefined,
    };

    const existing = this.nodes.get(id);
    if (existing?.mountHook) node.mountHook = existing.mountHook;
    if (existing?.unmountHook) node.unmountHook = existing.unmountHook;

    this.nodes.set(id, node);
    this.contributions.set(id, contribution);
    this.rebuildTree();

    if (node.type === 'css') {
      this.injectStyle(node.src);
    } else if (node.type === 'script') {
      this.injectScript(node.src);
    }
    return id;
  }

  registerMany(contributions: ComponentContribution[], plugin?: string): string[] {
    return contributions.map((c) => this.register(c, plugin));
  }

  registerMount(
    id: string,
    hook: (el: HTMLElement, props?: Record<string, unknown>) => void | Promise<void>
  ): void {
    this.mountHooks.set(id, hook);
    const node = this.nodes.get(id);
    if (node) node.mountHook = hook;
  }

  registerUnmount(id: string, hook: (el: HTMLElement) => void): void {
    this.unmountHooks.set(id, hook);
    const node = this.nodes.get(id);
    if (node) node.unmountHook = hook;
  }

  on(event: string, id: string, handler: (payload?: unknown) => void): () => void {
    if (!this.eventListeners.has(event)) this.eventListeners.set(event, new Map());
    const byId = this.eventListeners.get(event)!;
    if (!byId.has(id)) byId.set(id, new Set());
    byId.get(id)!.add(handler);
    return () => byId.get(id)?.delete(handler);
  }

  emit(event: string, id?: string, payload?: unknown): void {
    const byId = this.eventListeners.get(event);
    if (!byId) return;
    const targets = id ? [id] : Array.from(byId.keys());
    for (const key of targets) {
      const handlers = byId.get(key);
      if (!handlers) continue;
      for (const h of handlers) {
        try {
          h(payload);
        } catch (e) {
          logger.error(e, `[ComponentServer] event handler error for ${key}.${event}`);
        }
      }
    }
  }

  getNode(id: string): ComponentNode | undefined {
    return this.nodes.get(id);
  }

  getAllNodes(): ComponentNode[] {
    return Array.from(this.nodes.values());
  }

  getTreeSnapshot(): ComponentTreeSnapshot {
    return {
      nodes: Array.from(this.nodes.values()),
      relationships: Array.from(this.relationships.entries()).flatMap(([from, list]) =>
        list.map((to) => ({ from, to }))
      ),
      roots: [...this.roots],
    };
  }

  async mount(id: string, options: MountOptions = {}): Promise<HTMLElement | null> {
    const node = this.nodes.get(id);
    if (!node) {
      logger.warn(`[ComponentServer] 组件 ${id} 不存在`);
      return null;
    }

    const host = options.host || document.body;
    const el = document.createElement('div');
    el.className = `ord-component ord-component-${node.type}`;
    el.setAttribute('data-component-id', id);
    el.setAttribute('data-plugin', node.plugin);
    el.setAttribute('data-os', this.currentOS);

    if (!this.mounted.has(id)) this.mounted.set(id, new Set());
    this.mounted.get(id)!.add(el);

    this.emit('before-mount', id, { element: el });

    try {
      const hook = node.mountHook || this.mountHooks.get(id);
      if (hook) await hook(el, options.props || {});
    } catch (e) {
      logger.error(e, `[ComponentServer] 挂载钩子失败 ${id}`);
    }

    this.applyOSAnimation(el, node);
    host.appendChild(el);
    this.emit('after-mount', id, { element: el });
    options.onReady?.(el);
    return el;
  }

  async unmount(id: string, el?: HTMLElement): Promise<void> {
    const targets = el ? [el] : Array.from(this.mounted.get(id) || []);
    for (const target of targets) {
      this.emit('before-unmount', id, { element: target });
      try {
        const node = this.nodes.get(id);
        const hook = node?.unmountHook || this.unmountHooks.get(id);
        if (hook) await hook(target);
      } catch (e) {
        logger.error(e, `[ComponentServer] 卸载钩子失败 ${id}`);
      }
      target.remove();
      this.mounted.get(id)?.delete(target);
      this.emit('after-unmount', id);
    }
  }

  private applyOSAnimation(el: HTMLElement, node: ComponentNode): void {
    if (prefersReducedMotion() || node.animation?.disabled) {
      el.style.opacity = '1';
      return;
    }

    const animCfg = node.animation;
    const duration = animCfg?.duration || this.osDuration();
    const easing = animCfg?.easing || this.osEasing();
    const mountAnim = animCfg?.mount;

    if (mountAnim) {
      el.classList.add(`ord-anim-${mountAnim}`);
    } else {
      // 按照操作系统使用不同的入场方式
      if (this.currentOS === 'macos' || this.currentOS === 'ios') {
        el.style.opacity = '0';
        el.style.transform = 'translateY(8px) scale(0.98)';
        requestAnimationFrame(() => {
          el.style.transition = `opacity ${duration}ms ${easing}, transform ${duration}ms ${easing}`;
          el.style.opacity = '1';
          el.style.transform = 'translateY(0) scale(1)';
        });
      } else if (this.currentOS === 'windows') {
        el.style.opacity = '0';
        requestAnimationFrame(() => {
          el.style.transition = `opacity ${duration}ms ${easing}`;
          el.style.opacity = '1';
        });
      } else {
        animationManager.fadeIn(el, duration);
      }
    }
  }

  private osDuration(): number {
    switch (this.currentOS) {
      case 'macos':
        return 380;
      case 'ios':
        return 320;
      case 'windows':
        return 220;
      case 'linux':
        return 300;
      case 'android':
        return 260;
      default:
        return 300;
    }
  }

  private osEasing(): string {
    switch (this.currentOS) {
      case 'macos':
        return 'cubic-bezier(0.34, 1.56, 0.64, 1)';
      case 'ios':
        return 'cubic-bezier(0.32, 0.72, 0, 1)';
      case 'windows':
        return 'cubic-bezier(0.1, 0.9, 0.2, 1)';
      case 'linux':
        return 'cubic-bezier(0.25, 0.1, 0.25, 1)';
      case 'android':
        return 'cubic-bezier(0.4, 0, 0.2, 1)';
      default:
        return 'ease-out';
    }
  }

  private normalizeSrc(src: string, plugin: string): string {
    if (!src) return '';
    if (/^https?:\/\//.test(src) || src.startsWith('/')) return src;
    return `/components/${plugin}/${src.replace(/^\.\/?/, '')}`;
  }

  private injectStyle(href: string): void {
    if (!href || this.styles.has(href)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.setAttribute('data-component-style', 'true');
    document.head.appendChild(link);
    this.styles.set(href, { href, injected: true });
  }

  private injectScript(src: string): Promise<void> {
    const cached = this.scripts.get(src);
    if (cached?.promise) return cached.promise;
    const promise = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.setAttribute('data-component-script', 'true');
      script.onload = () => {
        const entry = this.scripts.get(src);
        if (entry) entry.loaded = true;
        resolve();
      };
      script.onerror = () => {
        this.scripts.delete(src);
        reject(new Error(`脚本加载失败: ${src}`));
      };
      document.head.appendChild(script);
    });
    this.scripts.set(src, { src, promise, loaded: false });
    return promise;
  }

  private rebuildTree(): void {
    const nodeList = Array.from(this.nodes.values());
    const byName = new Map<string, ComponentNode>();
    for (const n of nodeList) byName.set(`${n.plugin}:${n.name}`, n);

    this.relationships.clear();
    this.roots = [];
    for (const n of nodeList) n.children = [];

    for (const n of nodeList) {
      if (n.slot) {
        const parent =
          byName.get(`${n.plugin}:${n.slot}`) ||
          Array.from(nodeList).find((p) => p.name === n.slot && p.id !== n.id);
        if (parent) {
          parent.children.push(n.id);
          n.parent = parent.id;
          if (!this.relationships.has(parent.id)) this.relationships.set(parent.id, []);
          this.relationships.get(parent.id)!.push(n.id);
          continue;
        }
      }
      if (!n.parent) this.roots.push(n.id);
    }
  }

  reset(): void {
    for (const [, set] of this.mounted) {
      for (const el of set) el.remove();
    }
    this.mounted.clear();
    this.nodes.clear();
    this.contributions.clear();
    this.relationships.clear();
    this.roots = [];
    this.mountHooks.clear();
    this.unmountHooks.clear();
    this.eventListeners.clear();
  }
}

export const componentServer = new ComponentServerImpl();
