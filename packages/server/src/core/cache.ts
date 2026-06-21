interface CacheEntry<V> {
  value: V;
  expiresAt: number;
}

export class Cache<V = any> {
  private store = new Map<string, CacheEntry<V>>();
  private defaultTtl: number;

  constructor(defaultTtlMs = 5 * 60 * 1000) {
    this.defaultTtl = defaultTtlMs;
  }

  get(key: string): V | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: V, ttlMs?: number) {
    const expiresAt = Date.now() + (ttlMs ?? this.defaultTtl);
    this.store.set(key, { value, expiresAt });
  }

  delete(key: string) {
    this.store.delete(key);
  }

  clear() {
    this.store.clear();
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  keys(): string[] {
    return Array.from(this.store.keys()).filter(k => this.has(k));
  }

  size(): number {
    return this.keys().length;
  }
}

export const statsCache = new Cache<any>(30_000);
export const providerModelsCache = new Cache< any[]>(60_000);
export const agentCache = new Cache<any>(60_000);
