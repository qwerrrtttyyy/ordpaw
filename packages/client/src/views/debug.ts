import { API } from '../api';
import { Store } from '../store';
import { t } from '../i18n';
import type { DebugLogEntry, DebugEventEntry } from '@ordpaw/shared';
import { animationManager, AnimationManager } from '../animation-manager';

export class DebugView {
  private api: API;
  private store: Store;
  private activeTab: 'logs' | 'events' | 'metrics' | 'animation' = 'logs';
  private logs: DebugLogEntry[] = [];
  private events: DebugEventEntry[] = [];
  private eventSource: EventSource | null = null;
  private filterLevel: string = '';

  constructor(api: API, store: Store) {
    this.api = api;
    this.store = store;
  }

  async render() {
    const content = document.getElementById('view-content');
    if (!content) return;

    const settings = this.store.getSettings();

    content.innerHTML = `
      <div class="slide-up">
        <div class="section-header">
          <div>
            <div class="section-title">${t('debug.title')}</div>
            <div class="text-sm text-muted mt-2">${t('debug.subtitle')}</div>
          </div>
          <div class="flex items-center gap-3">
            <span class="text-sm text-muted">${t('debug.mode')}</span>
            <label class="switch">
              <input type="checkbox" id="debugToggle" ${settings.debugMode ? 'checked' : ''}>
              <span class="switch-slider"></span>
            </label>
          </div>
        </div>

        <div class="tabs">
          <div class="tab ${this.activeTab === 'logs' ? 'active' : ''}" data-tab="logs">${t('debug.logs')}</div>
          <div class="tab ${this.activeTab === 'events' ? 'active' : ''}" data-tab="events">${t('debug.events')}</div>
          <div class="tab ${this.activeTab === 'metrics' ? 'active' : ''}" data-tab="metrics">${t('debug.metrics')}</div>
          <div class="tab ${this.activeTab === 'animation' ? 'active' : ''}" data-tab="animation">动画</div>
        </div>

        <div id="tabContent"></div>
      </div>
    `;

    this.renderTab();
    this.startStream();

    content.querySelectorAll('.tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        const tName = tab.getAttribute('data-tab') as 'logs' | 'events' | 'metrics' | 'animation';
        this.activeTab = tName;
        content.querySelectorAll('.tab').forEach((x) => x.classList.remove('active'));
        tab.classList.add('active');
        this.renderTab();
      });
    });

    document.getElementById('debugToggle')?.addEventListener('change', async (e) => {
      const debugMode = (e.target as HTMLInputElement).checked;
      await this.api.updateSettings({ debugMode });
      this.store.setSettings({ debugMode });
      if (debugMode) this.startStream();
      else this.stopStream();
      this.renderTab();
    });
  }

  private async renderTab() {
    const tabContent = document.getElementById('tabContent');
    if (!tabContent) return;

    if (this.activeTab === 'logs') {
      await this.loadLogs();
      tabContent.innerHTML = `
        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">${t('debug.logs')}</div>
              <div class="card-subtitle">${t('debug.logsSubtitle')}</div>
            </div>
            <div class="flex gap-2">
              <select class="input input-sm" id="logFilter">
                <option value="">${t('debug.allLevels')}</option>
                <option value="debug" ${this.filterLevel === 'debug' ? 'selected' : ''}>DEBUG</option>
                <option value="info" ${this.filterLevel === 'info' ? 'selected' : ''}>INFO</option>
                <option value="warn" ${this.filterLevel === 'warn' ? 'selected' : ''}>WARN</option>
                <option value="error" ${this.filterLevel === 'error' ? 'selected' : ''}>ERROR</option>
              </select>
              <button class="btn btn-ghost btn-sm" id="refreshLogsBtn">${t('common.refresh')}</button>
              <button class="btn btn-ghost btn-sm" id="clearLogBtn">${t('common.clear')}</button>
            </div>
          </div>
          <div class="log-stream" id="logStream">
            ${this.logs.length === 0 ? `<div class="text-muted text-sm">${t('common.empty')}</div>` : this.logs.map((log) => this.renderLogLine(log)).join('')}
          </div>
        </div>
      `;
      document.getElementById('logFilter')?.addEventListener('change', async (e) => {
        this.filterLevel = (e.target as HTMLSelectElement).value;
        await this.loadLogs();
        this.renderTab();
      });
      document.getElementById('refreshLogsBtn')?.addEventListener('click', async () => {
        await this.loadLogs();
        this.renderTab();
      });
      document.getElementById('clearLogBtn')?.addEventListener('click', async () => {
        await this.api.clearDebug();
        this.logs = [];
        this.renderTab();
      });
    } else if (this.activeTab === 'events') {
      await this.loadEvents();
      tabContent.innerHTML = `
        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">${t('debug.events')}</div>
              <div class="card-subtitle">${t('debug.eventsSubtitle')}</div>
            </div>
            <button class="btn btn-ghost btn-sm" id="refreshEventsBtn">${t('common.refresh')}</button>
          </div>
          ${
            this.events.length === 0
              ? `
            <div class="empty-state" style="padding: 40px 20px;">
              <div class="empty-state-icon">◉</div>
              <div class="empty-state-title">${t('common.empty')}</div>
            </div>
          `
              : `
            <div class="timeline" id="eventTimeline">
              ${this.events.map((e) => this.renderEvent(e)).join('')}
            </div>
          `
          }
        </div>
      `;
      document.getElementById('refreshEventsBtn')?.addEventListener('click', async () => {
        await this.loadEvents();
        this.renderTab();
      });
    } else if (this.activeTab === 'animation') {
      const stats = animationManager.getStats();
      tabContent.innerHTML = `
        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">动画管理器</div>
              <div class="card-subtitle">FPS控制与动画性能监控</div>
            </div>
            <div class="flex gap-2 items-center">
              <label class="switch">
                <input type="checkbox" id="animToggle" ${stats.enabled ? 'checked' : ''}>
                <span class="switch-slider"></span>
              </label>
              <span class="text-sm">${stats.enabled ? '已启用' : '已禁用'}</span>
            </div>
          </div>
          <div class="grid grid-3" style="padding: 20px;">
            <div class="stat-card">
              <div class="stat-header">
                <span class="stat-label">当前FPS</span>
                <div class="stat-icon">◈</div>
              </div>
              <div class="stat-value" id="fpsValue">${stats.fps}</div>
            </div>
            <div class="stat-card sage">
              <div class="stat-header">
                <span class="stat-label">目标FPS</span>
                <div class="stat-icon">◈</div>
              </div>
              <div class="stat-value" id="targetFpsValue">${stats.targetFps}</div>
            </div>
            <div class="stat-card amber">
              <div class="stat-header">
                <span class="stat-label">活跃动画</span>
                <div class="stat-icon">◈</div>
              </div>
              <div class="stat-value" id="activeAnims">${stats.activeTasks}</div>
            </div>
          </div>
          <div style="padding: 0 20px 20px;">
            <div class="form-group">
              <label class="form-label">目标FPS</label>
              <div class="flex gap-2">
                <input type="range" id="fpsSlider" min="10" max="120" value="${stats.targetFps}" class="input" style="flex:1;">
                <span id="fpsSliderValue" class="text-sm" style="min-width:40px;">${stats.targetFps}</span>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">动画测试</label>
              <div class="flex gap-2 flex-wrap">
                <button class="btn btn-ghost btn-sm" id="testFade">淡入淡出</button>
                <button class="btn btn-ghost btn-sm" id="testSlide">滑入</button>
                <button class="btn btn-ghost btn-sm" id="testBounce">弹跳</button>
                <button class="btn btn-ghost btn-sm" id="cancelAll">取消全部</button>
              </div>
            </div>
            <div id="animPreview" style="margin-top:20px; padding:40px; background:var(--ord-bg-secondary); border-radius:var(--ord-radius); display:flex; align-items:center; justify-content:center; min-height:100px;">
              <div id="animBox" style="width:60px; height:60px; background:var(--ord-accent); border-radius:var(--ord-radius);"></div>
            </div>
          </div>
        </div>
      `;

      // FPS更新
      animationManager.onFpsUpdate((fps) => {
        const el = document.getElementById('fpsValue');
        if (el) el.textContent = String(fps);
      });

      // 动画开关
      document.getElementById('animToggle')?.addEventListener('change', (e) => {
        const enabled = (e.target as HTMLInputElement).checked;
        animationManager.setEnabled(enabled);
        this.renderTab();
      });

      // FPS滑块
      const slider = document.getElementById('fpsSlider') as HTMLInputElement;
      const sliderValue = document.getElementById('fpsSliderValue');
      slider?.addEventListener('input', () => {
        const val = parseInt(slider.value);
        animationManager.setTargetFps(val);
        if (sliderValue) sliderValue.textContent = String(val);
        const targetEl = document.getElementById('targetFpsValue');
        if (targetEl) targetEl.textContent = String(val);
      });

      // 动画测试
      document.getElementById('testFade')?.addEventListener('click', () => {
        const box = document.getElementById('animBox');
        if (box) {
          animationManager.fadeOut(box, 300).then(() => animationManager.fadeIn(box, 300));
        }
      });

      document.getElementById('testSlide')?.addEventListener('click', () => {
        const box = document.getElementById('animBox');
        if (box) {
          animationManager.slideIn(box, 'up', 400);
        }
      });

      document.getElementById('testBounce')?.addEventListener('click', () => {
        const box = document.getElementById('animBox');
        if (box) {
          animationManager.animate({
            duration: 600,
            onFrame: (progress) => {
              const eased = AnimationManager.easings.bounce(progress);
              box.style.transform = `translateY(${(1 - eased) * -30}px)`;
            },
            onComplete: () => {
              box.style.transform = '';
            },
          });
        }
      });

      document.getElementById('cancelAll')?.addEventListener('click', () => {
        animationManager.cancelAll();
        const box = document.getElementById('animBox');
        if (box) {
          box.style.transform = '';
          box.style.opacity = '';
        }
      });

      // 定时更新活跃动画数
      const updateActive = () => {
        const el = document.getElementById('activeAnims');
        if (el) {
          el.textContent = String(animationManager.getStats().activeTasks);
        }
        if (this.activeTab === 'animation') {
          requestAnimationFrame(updateActive);
        }
      };
      updateActive();
    } else {
      tabContent.innerHTML = `
        <div class="grid grid-3">
          <div class="stat-card">
            <div class="stat-header">
              <span class="stat-label">${t('debug.logCount')}</span>
              <div class="stat-icon">◈</div>
            </div>
            <div class="stat-value">${this.logs.length}</div>
          </div>
          <div class="stat-card sage">
            <div class="stat-header">
              <span class="stat-label">${t('debug.eventCount')}</span>
              <div class="stat-icon">◈</div>
            </div>
            <div class="stat-value">${this.events.length}</div>
          </div>
          <div class="stat-card amber">
            <div class="stat-header">
              <span class="stat-label">${t('debug.status')}</span>
              <div class="stat-icon">!</div>
            </div>
            <div class="stat-value">${this.store.getSettings().debugMode ? t('debug.on') : t('debug.off')}</div>
          </div>
        </div>
      `;
    }
  }

  private async loadLogs() {
    this.logs = await this.api.getDebugLogs(this.filterLevel || undefined, 100);
  }

  private async loadEvents() {
    this.events = await this.api.getDebugEvents(undefined, 100);
  }

  private startStream() {
    if (this.eventSource) return;
    try {
      this.eventSource = this.api.subscribeDebugStream(
        (entry) => {
          this.logs.unshift(entry);
          if (this.activeTab === 'logs') this.renderTab();
        },
        (event) => {
          this.events.unshift(event);
          if (this.activeTab === 'events') this.renderTab();
        }
      );
    } catch {
      // 浏览器可能不支持 EventSource 或连接失败
    }
  }

  private stopStream() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  private renderLogLine(log: DebugLogEntry) {
    const time = new Date(log.time).toTimeString().split(' ')[0];
    return `
      <div class="log-line">
        <span class="log-time">${time}</span>
        <span class="log-level ${log.level}">${log.level.toUpperCase()}</span>
        <span class="log-source">[${this.escapeHtml(log.source || '-')}]</span>
        <span class="log-message">${this.escapeHtml(log.message)}</span>
      </div>
    `;
  }

  private renderEvent(event: DebugEventEntry) {
    const time = new Date(event.time).toTimeString().split(' ')[0];
    return `
      <div class="timeline-item active">
        <div class="timeline-marker"></div>
        <div class="timeline-time">${time}</div>
        <div class="timeline-content">${this.escapeHtml(event.type)}</div>
      </div>
    `;
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
