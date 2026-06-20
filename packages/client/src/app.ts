import { Router } from './router';
import { API } from './api';
import { Store } from './store';
import { Sidebar } from './components/sidebar';
import { MobileDrawer } from './components/mobile-drawer';
import { BottomNav } from './components/bottom-nav';
import { Dashboard } from './views/dashboard';
import { ConversationsView } from './views/conversations';
import { AgentsView } from './views/agents';
import { PluginsView } from './views/plugins';
import { PromptsView } from './views/prompts';
import { ScriptsView } from './views/scripts';
import { DebugView } from './views/debug';
import { ProvidersView } from './views/providers';
import { TestsView } from './views/tests';
import { SettingsView } from './views/settings';
import { DownloadManagerView } from './views/download-manager';
import { t, setLocale } from './i18n';
import type { Locale, PerformanceTier } from '@ordpaw/shared';
import { loadPluginComponents } from './component-loader';
import { detectPerformanceTier, initAnimationPreferences } from './animation-manager';
import { SequenceExecutor } from './sequence-executor';
import { DownloadManager } from './download-manager';
import { installGlobalPluginApi } from './plugin-registry';

export class App {
  private router: Router;
  private api: API;
  private store: Store;
  private sidebar: Sidebar;
  private mobileDrawer: MobileDrawer;
  private bottomNav: BottomNav;
  private mainEl: HTMLElement;
  private titleEl: HTMLElement;
  private crumbsEl: HTMLElement;
  private contentEl: HTMLElement;
  private currentRoute: string = '#/';
  private lastAppliedMode: 'classic' | 'modern' = 'classic';
  private lastAppliedEffects: 'minimal' | 'balanced' | 'expressive' = 'balanced';
  private lastAppliedPerformance: PerformanceTier = 'auto';
  private lastAppliedLocale: Locale = 'zh-CN';
  private ws: WebSocket | null = null;
  private sequenceExecutor: SequenceExecutor | null = null;
  private downloadManager: DownloadManager;

  constructor() {
    this.api = new API();
    this.store = new Store();
    this.downloadManager = new DownloadManager(this.api);
    this.router = new Router();
    this.sidebar = new Sidebar();
    this.mobileDrawer = new MobileDrawer();
    this.bottomNav = new BottomNav();
    this.mainEl = document.createElement('main');
    this.mainEl.className = 'main';
    this.titleEl = document.createElement('h1');
    this.crumbsEl = document.createElement('div');
    this.contentEl = document.createElement('div');
  }

  async init() {
    const app = document.getElementById('app');
    if (!app) return;

    await this.loadSettings();
    this.applyTheme();
    this.applyUIMode();
    this.applyUIEffects();
    this.applyPerformanceMode();
    this.lastAppliedMode = this.store.getUIMode();
    this.lastAppliedEffects = this.store.getUIEffects();
    this.lastAppliedPerformance = this.store.getPerformanceMode();
    this.lastAppliedLocale = this.store.getLocale();
    const effectiveTier = this.resolvePerformanceTier();
    initAnimationPreferences(effectiveTier);
    document.documentElement.setAttribute('data-perf-tier', effectiveTier);

    // Install the public window.OrdPaw plugin API before loading plugin
    // components so contributed scripts can immediately register themselves.
    installGlobalPluginApi(() => this.store.getSettings());
    loadPluginComponents();

    app.appendChild(this.sidebar.render());
    app.appendChild(this.mobileDrawer.render());
    app.appendChild(this.mainEl);
    app.appendChild(this.bottomNav.render());

    this.buildTopbar();
    this.setupContent();
    this.setupRoutes();
    this.router.init();

    this.sidebar.onNavigate((route) => this.router.navigate(route));
    this.mobileDrawer.onNavigate((route) => {
      this.mobileDrawer.close();
      this.router.navigate(route);
    });
    this.bottomNav.onNavigate((route) => this.router.navigate(route));

    await this.loadStats();

    // 初始化 WebSocket 和序列执行器
    this.initWebSocket();

    window.addEventListener('resize', () => {
      if (window.innerWidth > 960) {
        this.mobileDrawer.close();
      }
    });
  }

  /**
   * Reload the plugin component manifest from the server and inject any new
   * CSS/script contributions. Called after a plugin is installed/uninstalled
   * at runtime — fixes the prior issue where users had to refresh the page
   * to see newly-installed plugin contributions.
   */
  async reloadPluginComponents() {
    try {
      await loadPluginComponents();
    } catch (err) {
      console.error('重载插件组件失败:', err);
    }
  }

  private initWebSocket() {
    try {
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      // Honor Vite dev proxy: if the page is served from the dev server,
      // use the same host:port (the proxy forwards /ws to the backend).
      // In production, fall back to explicit port 3000 only when the page
      // itself isn't already on 3000.
      const wsHost = window.location.hostname;
      const wsPort = window.location.port && window.location.port !== '5173'
        ? window.location.port
        : '3000';
      const wsUrl = `${wsProtocol}//${wsHost}:${wsPort}`;

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('[App] WebSocket 已连接');
        this.sequenceExecutor = new SequenceExecutor(this.router, this.store);
        this.sequenceExecutor.connect(this.ws!);
      };

      this.ws.onclose = () => {
        console.log('[App] WebSocket 已断开，5秒后重连...');
        setTimeout(() => this.initWebSocket(), 5000);
      };

      this.ws.onerror = (error) => {
        console.error('[App] WebSocket 错误:', error);
      };
    } catch (error) {
      console.error('[App] WebSocket 初始化失败:', error);
    }
  }

  private buildTopbar() {
    const topbar = document.createElement('div');
    topbar.className = 'topbar';

    const pageMeta = document.createElement('div');
    pageMeta.className = 'page-meta';
    this.crumbsEl.className = 'crumbs';
    this.titleEl.className = 'page-title';
    pageMeta.appendChild(this.crumbsEl);
    pageMeta.appendChild(this.titleEl);

    const menuBtn = document.createElement('button');
    menuBtn.className = 'mobile-menu-btn';
    menuBtn.innerHTML = '☰';
    menuBtn.addEventListener('click', () => this.mobileDrawer.open());

    const topbarActions = document.createElement('div');
    topbarActions.className = 'topbar-actions';
    topbarActions.innerHTML = `
      <div class="search-box">
        <span>⌕</span>
        <span>${t('common.search')}</span>
      </div>
    `;

    topbar.appendChild(menuBtn);
    topbar.appendChild(pageMeta);
    topbar.appendChild(topbarActions);
    this.mainEl.appendChild(topbar);
  }

  private setupContent() {
    this.contentEl.className = 'content';
    this.contentEl.id = 'view-content';
    this.mainEl.appendChild(this.contentEl);
  }

  private async loadSettings() {
    try {
      const settings = await this.api.getSettings();
      this.store.setSettings(settings);
      this.downloadManager.setBrowserBackend(settings.browserStorageBackend || 'indexeddb');
      if (settings.locale) {
        setLocale(settings.locale);
      }
    } catch (error) {
      console.error('加载设置失败:', error);
    }
  }

  private async loadStats() {
    try {
      const stats = await this.api.getStats();
      this.sidebar.setStats(stats);
      this.mobileDrawer.setStats(stats);
      this.bottomNav.setCounts(stats);
    } catch (error) {
      console.error('加载统计失败:', error);
    }
  }

  private applyTheme() {
    const theme = this.store.getSettings().theme || 'ordpaw-light';
    document.documentElement.setAttribute('data-theme', theme);
  }

  private applyUIMode() {
    const mode = this.store.getUIMode();
    document.documentElement.setAttribute('data-ui-mode', mode);
  }

  private applyUIEffects() {
    const effects = this.store.getUIEffects();
    document.documentElement.setAttribute('data-ui-effects', effects);
  }

  private applyPerformanceMode() {
    const mode = this.store.getPerformanceMode();
    const tier = this.resolvePerformanceTier();
    document.documentElement.setAttribute('data-performance-mode', mode);
    document.documentElement.setAttribute('data-perf-tier', tier);
  }

  private resolvePerformanceTier(): 'high' | 'medium' | 'low' {
    const mode = this.store.getPerformanceMode();
    if (mode === 'auto') {
      return detectPerformanceTier();
    }
    return mode;
  }

  private onSettingsChange() {
    const newMode = this.store.getUIMode();
    const newEffects = this.store.getUIEffects();
    const newPerformance = this.store.getPerformanceMode();
    const newLocale = this.store.getLocale();

    this.applyTheme();
    this.applyUIMode();
    this.applyUIEffects();
    this.applyPerformanceMode();

    if (newLocale !== this.lastAppliedLocale) {
      setLocale(newLocale);
      this.lastAppliedLocale = newLocale;
      this.retranslate();
      this.rerenderCurrentView();
    }

    if (newMode !== this.lastAppliedMode) {
      this.lastAppliedMode = newMode;
      this.transitionUIMode();
    } else if (newEffects !== this.lastAppliedEffects || newPerformance !== this.lastAppliedPerformance) {
      this.lastAppliedEffects = newEffects;
      this.lastAppliedPerformance = newPerformance;
      // Effects and performance mode are CSS-driven; no rebuild required.
    }
  }

  private transitionUIMode() {
    const app = document.getElementById('app');
    if (!app) return;
    app.classList.add('ui-mode-transition');
    requestAnimationFrame(() => {
      app.classList.add('ui-mode-transition-active');
      setTimeout(() => {
        this.rebuildUI();
        requestAnimationFrame(() => {
          app.classList.remove('ui-mode-transition-active');
          setTimeout(() => app.classList.remove('ui-mode-transition'), 360);
        });
      }, 220);
    });
  }

  private rebuildUI() {
    const app = document.getElementById('app');
    if (!app) return;
    app.innerHTML = '';
    app.appendChild(this.sidebar.render());
    app.appendChild(this.mobileDrawer.render());
    app.appendChild(this.mainEl);
    app.appendChild(this.bottomNav.render());
    this.sidebar.onNavigate((route) => this.router.navigate(route));
    this.mobileDrawer.onNavigate((route) => {
      this.mobileDrawer.close();
      this.router.navigate(route);
    });
    this.bottomNav.onNavigate((route) => this.router.navigate(route));
    this.sidebar.setActive(this.currentRoute);
    this.mobileDrawer.setActive(this.currentRoute);
    this.bottomNav.setActive(this.currentRoute);
    this.loadStats();
    this.rerenderCurrentView();
  }

  private rerenderCurrentView() {
    const routeMap: Record<string, { title: string; crumbs: string; view: () => Promise<void> }> = {
      '#/': {
        title: t('nav.dashboard'),
        crumbs: 'OrdPaw · Dashboard',
        view: () => new Dashboard(this.api, this.store, () => this.loadStats()).render()
      },
      '#/conversations': {
        title: t('conversation.title'),
        crumbs: 'OrdPaw · Conversations',
        view: () => new ConversationsView(this.api, this.store).render()
      },
      '#/agents': {
        title: t('agent.title'),
        crumbs: 'OrdPaw · Agents',
        view: () => new AgentsView(this.api, this.store, () => this.loadStats()).render()
      },
      '#/plugins': {
        title: t('plugin.title'),
        crumbs: 'OrdPaw · Plugins',
        view: () => new PluginsView(this.api, this.store).render()
      },
      '#/prompts': {
        title: t('prompt.title'),
        crumbs: 'OrdPaw · Prompts',
        view: () => new PromptsView(this.api, this.store).render()
      },
      '#/scripts': {
        title: t('script.title'),
        crumbs: 'OrdPaw · Scripts',
        view: () => new ScriptsView(this.api).render()
      },
      '#/providers': {
        title: t('provider.title'),
        crumbs: 'OrdPaw · Providers',
        view: () => new ProvidersView(this.api).render()
      },
      '#/tests': {
        title: t('test.title'),
        crumbs: 'OrdPaw · Tests',
        view: () => new TestsView(this.api).render()
      },
      '#/debug': {
        title: t('debug.title'),
        crumbs: 'OrdPaw · Debug',
        view: () => new DebugView(this.api, this.store).render()
      },
      '#/settings': {
        title: t('settings.title'),
        crumbs: 'OrdPaw · Settings',
        view: () => new SettingsView(this.api, this.store, () => this.onSettingsChange()).render()
      },
      '#/download': {
        title: t('download.title'),
        crumbs: 'OrdPaw · Downloads',
        view: () => new DownloadManagerView(this.api, this.store, this.downloadManager).render()
      }
    };
    const meta = routeMap[this.currentRoute];
    if (meta) {
      this.renderView(meta.view, meta.title, meta.crumbs).catch(console.error);
    }
  }

  private retranslate() {
    const routeMap: Record<string, { title: string; crumbs: string }> = {
      '#/': { title: t('nav.dashboard'), crumbs: 'OrdPaw · Dashboard' },
      '#/conversations': { title: t('conversation.title'), crumbs: 'OrdPaw · Conversations' },
      '#/agents': { title: t('agent.title'), crumbs: 'OrdPaw · Agents' },
      '#/plugins': { title: t('plugin.title'), crumbs: 'OrdPaw · Plugins' },
      '#/prompts': { title: t('prompt.title'), crumbs: 'OrdPaw · Prompts' },
      '#/scripts': { title: t('script.title'), crumbs: 'OrdPaw · Scripts' },
      '#/providers': { title: t('provider.title'), crumbs: 'OrdPaw · Providers' },
      '#/tests': { title: t('test.title'), crumbs: 'OrdPaw · Tests' },
      '#/debug': { title: t('debug.title'), crumbs: 'OrdPaw · Debug' },
      '#/settings': { title: t('settings.title'), crumbs: 'OrdPaw · Settings' },
      '#/download': { title: t('download.title'), crumbs: 'OrdPaw · Downloads' }
    };
    const meta = routeMap[this.currentRoute];
    if (meta) {
      this.titleEl.textContent = meta.title;
      this.crumbsEl.textContent = meta.crumbs;
    }
  }

  private setupRoutes() {
    const routeMap: Record<string, { title: string; crumbs: string; view: () => Promise<void> }> = {
      '#/': {
        title: t('nav.dashboard'),
        crumbs: 'OrdPaw · Dashboard',
        view: () => new Dashboard(this.api, this.store, () => this.loadStats()).render()
      },
      '#/conversations': {
        title: t('conversation.title'),
        crumbs: 'OrdPaw · Conversations',
        view: () => new ConversationsView(this.api, this.store).render()
      },
      '#/agents': {
        title: t('agent.title'),
        crumbs: 'OrdPaw · Agents',
        view: () => new AgentsView(this.api, this.store, () => this.loadStats()).render()
      },
      '#/plugins': {
        title: t('plugin.title'),
        crumbs: 'OrdPaw · Plugins',
        view: () => new PluginsView(this.api, this.store).render()
      },
      '#/prompts': {
        title: t('prompt.title'),
        crumbs: 'OrdPaw · Prompts',
        view: () => new PromptsView(this.api, this.store).render()
      },
      '#/scripts': {
        title: t('script.title'),
        crumbs: 'OrdPaw · Scripts',
        view: () => new ScriptsView(this.api).render()
      },
      '#/providers': {
        title: t('provider.title'),
        crumbs: 'OrdPaw · Providers',
        view: () => new ProvidersView(this.api).render()
      },
      '#/tests': {
        title: t('test.title'),
        crumbs: 'OrdPaw · Tests',
        view: () => new TestsView(this.api).render()
      },
      '#/debug': {
        title: t('debug.title'),
        crumbs: 'OrdPaw · Debug',
        view: () => new DebugView(this.api, this.store).render()
      },
      '#/settings': {
        title: t('settings.title'),
        crumbs: 'OrdPaw · Settings',
        view: () => new SettingsView(this.api, this.store, () => this.onSettingsChange()).render()
      },
      '#/download': {
        title: t('download.title'),
        crumbs: 'OrdPaw · Downloads',
        view: () => new DownloadManagerView(this.api, this.store, this.downloadManager).render()
      }
    };

    for (const [route, meta] of Object.entries(routeMap)) {
      this.router.on(route, () => this.renderView(meta.view, meta.title, meta.crumbs));
    }
  }

  private async renderView(renderFn: () => Promise<void>, title: string, crumbs: string) {
    this.currentRoute = window.location.hash || '#/';
    this.titleEl.textContent = title;
    this.crumbsEl.textContent = crumbs;
    this.sidebar.setActive(this.currentRoute);
    this.mobileDrawer.setActive(this.currentRoute);
    this.bottomNav.setActive(this.currentRoute);
    try {
      await renderFn();
    } catch (error) {
      console.error('视图渲染失败:', error);
      this.contentEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">⚠</div>
          <div class="empty-state-title">${t('common.loading')} ${t('common.empty')}</div>
          <div class="text-sm text-muted">${error instanceof Error ? error.message : ''}</div>
        </div>
      `;
    }
  }
}
