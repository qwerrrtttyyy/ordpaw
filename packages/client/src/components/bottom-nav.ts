import { t } from '../i18n';

const ITEMS = [
  { route: '#/', icon: '◇', labelKey: 'nav.dashboard' as const },
  { route: '#/agents', icon: '◉', labelKey: 'nav.agents' as const },
  { route: '#/providers', icon: '⚡', labelKey: 'nav.providers' as const },
  { route: '#/tests', icon: '✓', labelKey: 'nav.tests' as const },
  { route: '#/download', icon: '↓', labelKey: 'nav.download' as const }
];

export class BottomNav {
  private container: HTMLElement;
  private navigateCallback?: (route: string) => void;

  constructor() {
    this.container = document.createElement('nav');
    this.container.className = 'bottom-nav';
  }

  render(): HTMLElement {
    const items = document.createElement('div');
    items.className = 'bottom-nav-items';

    ITEMS.forEach(item => {
      const el = document.createElement('div');
      el.className = 'bottom-nav-item';
      el.setAttribute('data-route', item.route);
      el.innerHTML = `
        <span class="bottom-nav-icon">${item.icon}</span>
        <span>${t(item.labelKey)}</span>
      `;
      el.addEventListener('click', () => {
        if (this.navigateCallback) this.navigateCallback(item.route);
      });
      items.appendChild(el);
    });

    this.container.innerHTML = '';
    this.container.appendChild(items);
    return this.container;
  }

  onNavigate(callback: (route: string) => void) {
    this.navigateCallback = callback;
  }

  setActive(route: string) {
    this.container.querySelectorAll('.bottom-nav-item').forEach(item => {
      if (item.getAttribute('data-route') === route) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
  }

  setCounts(stats: Record<string, number>) {
    // Show a small badge count next to the agents nav item, since agents is
    // a top-level concept users check frequently on mobile.
    this.container.querySelectorAll('.bottom-nav-item').forEach(item => {
      const route = item.getAttribute('data-route');
      const badge = item.querySelector('.bottom-nav-badge') as HTMLElement | null;
      let count: number | undefined;
      if (route === '#/agents') count = stats.agents;
      else if (route === '#/') count = stats.conversations;
      else if (route === '#/tests') count = stats.testSuites;

      if (count !== undefined && count > 0) {
        if (!badge) {
          const b = document.createElement('span');
          b.className = 'bottom-nav-badge';
          item.appendChild(b);
        }
        (item.querySelector('.bottom-nav-badge') as HTMLElement).textContent = String(count);
      } else if (badge) {
        badge.remove();
      }
    });
  }
}
