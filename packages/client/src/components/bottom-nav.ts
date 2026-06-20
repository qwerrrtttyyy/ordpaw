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

  setCounts(_stats: Record<string, number>) {
    // counts are shown in drawer/sidebar, not bottom nav
  }
}
