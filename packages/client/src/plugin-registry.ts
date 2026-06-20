/**
 * Client-side plugin registry.
 *
 * Provides a stable public API so that server-contributed plugin scripts
 * can register themselves with the SPA without monkey-patching internal
 * singletons. Plugins get a handle through `window.OrdPaw` (set by App.init)
 * or by importing this module directly.
 */

export type ActionHandler = (params: Record<string, any>, context: { conversationId?: string; [k: string]: any }) => Promise<any> | any;

export interface PluginApi {
  /** Register a custom operation handler usable by SequenceExecutor. */
  registerActionHandler(type: string, handler: ActionHandler): void;
  /** Unregister a previously registered operation handler. */
  unregisterActionHandler(type: string): void;
  /** Emit a custom event on the global OrdPaw event bus (delegates to App). */
  emit(event: string, payload?: any): void;
  /** Subscribe to a global OrdPaw event. Returns an unsubscribe function. */
  on(event: string, handler: (payload: any) => void): () => void;
  /** Show a toast notification. */
  toast(message: string): void;
  /** Get a read-only view of the current settings. */
  getSettings(): Record<string, any>;
}

type EventListener = (payload: any) => void;

class PluginRegistryImpl {
  private actionHandlers = new Map<string, ActionHandler>();
  private eventListeners = new Map<string, Set<EventListener>>();
  private settingsGetter: () => Record<string, any> = () => ({});

  setSettingsGetter(fn: () => Record<string, any>) {
    this.settingsGetter = fn;
  }

  getActionHandler(type: string): ActionHandler | undefined {
    return this.actionHandlers.get(type);
  }

  listActionTypes(): string[] {
    return Array.from(this.actionHandlers.keys());
  }

  emit(event: string, payload?: any) {
    const set = this.eventListeners.get(event);
    if (set) for (const fn of set) {
      try { fn(payload); } catch (e) { console.error('[OrdPaw plugin] event listener error', e); }
    }
  }

  api(): PluginApi {
    return {
      registerActionHandler: (type, handler) => { this.actionHandlers.set(type, handler); },
      unregisterActionHandler: (type) => { this.actionHandlers.delete(type); },
      emit: (event, payload) => { this.emit(event, payload); },
      on: (event, handler) => {
        let set = this.eventListeners.get(event);
        if (!set) { set = new Set(); this.eventListeners.set(event, set); }
        set.add(handler);
        return () => set!.delete(handler);
      },
      toast: (msg) => {
        const t = document.createElement('div');
        t.className = 'toast';
        t.textContent = msg;
        document.body.appendChild(t);
        setTimeout(() => t.remove(), 2400);
      },
      getSettings: () => this.settingsGetter()
    };
  }
}

export const pluginRegistry = new PluginRegistryImpl();

/**
 * Install the plugin API on window.OrdPaw so plugin scripts (loaded via
 * <script> tags by component-loader) can access it without bundler imports.
 * Called by App.init().
 */
export function installGlobalPluginApi(settingsGetter: () => Record<string, any>) {
  pluginRegistry.setSettingsGetter(settingsGetter);
  (globalThis as any).OrdPaw = pluginRegistry.api();
}
