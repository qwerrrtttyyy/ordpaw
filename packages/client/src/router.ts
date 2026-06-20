export class Router {
  private routes: Map<string, () => void> = new Map();

  on(path: string, handler: () => void) {
    this.routes.set(path, handler);
  }

  navigate(path: string) {
    window.location.hash = path;
    this.handleRoute();
  }

  private handleRoute() {
    const hash = window.location.hash || '#/';
    const handler = this.routes.get(hash);
    if (handler) {
      handler();
    } else {
      // 默认路由
      this.routes.get('#/')?.();
    }
  }

  init() {
    window.addEventListener('hashchange', () => this.handleRoute());
    this.handleRoute();
  }
}
