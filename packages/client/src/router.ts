export class Router {
  private routes: Map<string, (params: Record<string, string>) => void> = new Map();
  private paramRoutes: { pattern: string; keys: string[]; handler: (params: Record<string, string>) => void }[] = [];

  on(path: string, handler: (params: Record<string, string>) => void) {
    if (path.includes(':')) {
      const keys: string[] = [];
      const pattern = path.replace(/:([^/]+)/g, (_, key) => {
        keys.push(key);
        return '([^/]+)';
      });
      this.paramRoutes.push({ pattern, keys, handler });
    } else {
      this.routes.set(path, handler);
    }
  }

  navigate(path: string) {
    window.location.hash = path;
    this.handleRoute();
  }

  private handleRoute() {
    const hash = window.location.hash || '#/';
    const handler = this.routes.get(hash);
    if (handler) {
      handler({});
      return;
    }
    for (const { pattern, keys, handler } of this.paramRoutes) {
      const regex = new RegExp(`^${pattern}$`);
      const match = hash.match(regex);
      if (match) {
        const params: Record<string, string> = {};
        keys.forEach((key, i) => { params[key] = match[i + 1]; });
        handler(params);
        return;
      }
    }
    this.routes.get('#/')?.({});
  }

  init() {
    window.addEventListener('hashchange', () => this.handleRoute());
    this.handleRoute();
  }
}