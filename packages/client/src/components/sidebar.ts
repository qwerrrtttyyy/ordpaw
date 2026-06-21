import { t } from '../i18n';
import type { StatsResponse } from '@ordpaw/shared';

export class Sidebar {
  private container: HTMLElement;
  private navigateCallback?: (route: string) => void;
  private stats: StatsResponse = {
    agents: 0,
    conversations: 0,
    plugins: 0,
    prompts: 0,
    scripts: 0,
    providers: 0,
    testSuites: 0,
    mcpServers: 0,
    installedSkills: 0,
    skills: 0,
  };

  constructor() {
    this.container = document.createElement('aside');
    this.container.className = 'sidebar';
  }

  setStats(stats: StatsResponse) {
    this.stats = stats;
    this.render();
  }

  render(): HTMLElement {
    const mcpSkillsCount = (this.stats.mcpServers || 0) + (this.stats.installedSkills || 0);

    this.container.innerHTML = `
      <div class="sidebar-header">
        <div class="brand">
          <div class="brand-mark">A</div>
          <div class="brand-text">
            <div class="brand-name">${t('app.name')}</div>
            <div class="brand-tag">${t('app.tag')}</div>
          </div>
        </div>
      </div>

      <nav class="nav-section">
        <div class="nav-label">${t('nav.workspace')}</div>
        <div class="nav-item" data-route="#/">
          <span class="nav-icon">◇</span>
          <span>${t('nav.dashboard')}</span>
        </div>
        <div class="nav-item" data-route="#/conversations">
          <span class="nav-icon">◈</span>
          <span>${t('nav.conversations')}</span>
          <span class="nav-badge">${this.stats.conversations || 0}</span>
        </div>
        <div class="nav-item" data-route="#/agents">
          <span class="nav-icon">◉</span>
          <span>${t('nav.agents')}</span>
          <span class="nav-badge">${this.stats.agents || 0}</span>
        </div>
      </nav>

      <nav class="nav-section">
        <div class="nav-label">${t('nav.extensions')}</div>
        <div class="nav-item" data-route="#/mcp-skills">
          <span class="nav-icon">⚡</span>
          <span>${t('nav.mcpSkills')}</span>
          <span class="nav-badge">${mcpSkillsCount}</span>
        </div>
        <div class="nav-item" data-route="#/plugins">
          <span class="nav-icon">◇</span>
          <span>${t('nav.plugins')}</span>
          <span class="nav-badge">${this.stats.plugins || 0}</span>
        </div>
        <div class="nav-item" data-route="#/prompts">
          <span class="nav-icon">◈</span>
          <span>${t('nav.prompts')}</span>
          <span class="nav-badge">${this.stats.prompts || 0}</span>
        </div>
        <div class="nav-item" data-route="#/scripts">
          <span class="nav-icon">▣</span>
          <span>${t('nav.scripts')}</span>
          <span class="nav-badge">${this.stats.scripts || 0}</span>
        </div>
        <div class="nav-item" data-route="#/providers">
          <span class="nav-icon">⚡</span>
          <span>${t('nav.providers')}</span>
          <span class="nav-badge">${this.stats.providers || 0}</span>
        </div>
        <div class="nav-item" data-route="#/tests">
          <span class="nav-icon">✓</span>
          <span>${t('nav.tests')}</span>
          <span class="nav-badge">${this.stats.testSuites || 0}</span>
        </div>
      </nav>

      <nav class="nav-section">
        <div class="nav-label">${t('nav.system')}</div>
        <div class="nav-item" data-route="#/download">
          <span class="nav-icon">↓</span>
          <span>${t('nav.download')}</span>
        </div>
        <div class="nav-item" data-route="#/debug">
          <span class="nav-icon">◍</span>
          <span>${t('nav.debug')}</span>
        </div>
        <div class="nav-item" data-route="#/settings">
          <span class="nav-icon">◎</span>
          <span>${t('nav.settings')}</span>
        </div>
      </nav>

      <div class="sidebar-footer">
        <div class="status-pill">
          <span class="status-dot"></span>
          <span>${t('status.running')}</span>
        </div>
      </div>
    `;

    this.container.querySelectorAll('.nav-item').forEach((item) => {
      item.addEventListener('click', () => {
        const route = item.getAttribute('data-route');
        if (route && this.navigateCallback) {
          this.navigateCallback(route);
        }
      });
    });

    return this.container;
  }

  onNavigate(callback: (route: string) => void) {
    this.navigateCallback = callback;
  }

  setActive(route: string) {
    this.container.querySelectorAll('.nav-item').forEach((item) => {
      if (item.getAttribute('data-route') === route) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
  }
}
