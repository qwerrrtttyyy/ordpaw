import type { Agent, Conversation, PromptTemplate, PluginInstance, Settings, Script, ScriptExecutionResult, Provider, TestSuite, TestRun, TestCase, DebugLogEntry, DebugEventEntry, ComponentContribution, DownloadResourceType, DownloadTask, ServerDownloadRequest, McpServer, InstallMcpRequest, InstallSkillRequest, SkillInstallResult, SkillExecuteResult } from '@ordpaw/shared';

export type ErrorCode =
  | 'network'
  | 'parse'
  | 'timeout'
  | 'bad_request'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'rate_limited'
  | 'server'
  | 'unknown';

export class OrdPawApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details?: unknown;
  constructor(message: string, status: number, code?: ErrorCode, details?: unknown) {
    super(message);
    this.name = 'OrdPawApiError';
    this.status = status;
    this.code = code || statusToCode(status);
    this.details = details;
  }
}

function statusToCode(status: number): ErrorCode {
  if (status === 400) return 'bad_request';
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 409) return 'conflict';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'server';
  return 'unknown';
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

class APICache {
  private cache = new Map<string, CacheEntry<any>>();

  set<T>(key: string, data: T, ttl?: number): void {
    this.cache.set(key, { data, timestamp: Date.now(), ttl: ttl || 60_000 });
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }
    return entry.data as T;
  }

  invalidate(key: string): void { this.cache.delete(key); }

  invalidatePattern(pattern: string): void {
    for (const k of Array.from(this.cache.keys())) {
      if (k.includes(pattern)) this.cache.delete(k);
    }
  }

  clear(): void { this.cache.clear(); }

  size(): number { return this.cache.size; }
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  timeout?: number;
  expectJson?: boolean;
};

async function request<T = any>(url: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, headers, timeout = 15_000, expectJson = true } = options;

  const finalHeaders: Record<string, string> = { ...headers };
  if (body && !finalHeaders['Content-Type'] && !(body instanceof FormData)) {
    finalHeaders['Content-Type'] = 'application/json';
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(url, {
      method,
      headers: finalHeaders,
      body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });

    if (!res.ok) {
      let message = `${res.status} ${res.statusText}`;
      let details: unknown;
      try {
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
          const json = await res.json();
          message = (json?.error as string) || (json?.message as string) || message;
          details = json?.details;
        } else {
          const text = await res.text();
          if (text) message = `${message}: ${text.slice(0, 200)}`;
        }
      } catch { /* ignore */ }
      throw new OrdPawApiError(message, res.status, undefined, details);
    }

    if (!expectJson) return undefined as T;
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) return undefined as T;
    return await res.json() as T;
  } catch (err) {
    if (err instanceof OrdPawApiError) throw err;
    if ((err as Error).name === 'AbortError') throw new OrdPawApiError('请求超时', 408, 'timeout');
    const msg = (err as Error).message || String(err);
    if (/network|fetch/i.test(msg)) throw new OrdPawApiError('网络错误：无法连接到服务器', 0, 'network');
    throw new OrdPawApiError(msg, 0, 'unknown');
  } finally {
    clearTimeout(timer);
  }
}

export class API {
  private baseUrl = '/api';
  private cache = new APICache();
  private pendingRequests = new Map<string, Promise<any>>();
  private readonly apiVersion = '0.0.3';

  version() { return this.apiVersion; }
  cacheInfo() { return { size: this.cache.size() }; }

  private async cachedRequest<T>(key: string, fetcher: () => Promise<T>, ttl?: number): Promise<T> {
    const cached = this.cache.get<T>(key);
    if (cached !== null) return cached;
    const pending = this.pendingRequests.get(key);
    if (pending) return pending as Promise<T>;

    const promise = fetcher();
    this.pendingRequests.set(key, promise);
    try {
      const result = await promise;
      this.cache.set(key, result, ttl);
      return result;
    } finally {
      this.pendingRequests.delete(key);
    }
  }

  invalidateCache(pattern?: string): void {
    if (pattern) this.cache.invalidatePattern(pattern);
    else this.cache.clear();
  }

  // === Agent API ===
  async getAgents(): Promise<Agent[]> {
    return this.cachedRequest('agents', () => request<Agent[]>(`${this.baseUrl}/agents`), 30_000);
  }

  async createAgent(data: Partial<Agent>): Promise<Agent> {
    const result = await request<Agent>(`${this.baseUrl}/agents`, { method: 'POST', body: data });
    this.cache.invalidate('agents');
    return result;
  }

  async getAgent(id: string): Promise<Agent> {
    return this.cachedRequest(`agent:${id}`, () => request<Agent>(`${this.baseUrl}/agents/${id}`), 30_000);
  }

  async updateAgent(id: string, data: Partial<Agent>): Promise<Agent> {
    const result = await request<Agent>(`${this.baseUrl}/agents/${id}`, { method: 'PUT', body: data });
    this.cache.invalidate('agents');
    this.cache.invalidate(`agent:${id}`);
    return result;
  }

  async deleteAgent(id: string): Promise<void> {
    await request<void>(`${this.baseUrl}/agents/${id}`, { method: 'DELETE', expectJson: false });
    this.cache.invalidate('agents');
    this.cache.invalidate(`agent:${id}`);
  }

  // === Conversation API ===
  async getConversations(agentId?: string): Promise<Conversation[]> {
    const key = agentId ? `conversations:${agentId}` : 'conversations';
    const url = agentId
      ? `${this.baseUrl}/conversations?agentId=${encodeURIComponent(agentId)}`
      : `${this.baseUrl}/conversations`;
    return this.cachedRequest(key, () => request<Conversation[]>(url), 30_000);
  }

  async createConversation(agentId: string, title?: string): Promise<Conversation> {
    const result = await request<Conversation>(`${this.baseUrl}/conversations`, { method: 'POST', body: { agentId, title } });
    this.cache.invalidatePattern('conversations');
    return result;
  }

  async getConversation(id: string): Promise<Conversation> {
    return this.cachedRequest(`conversation:${id}`, () => request<Conversation>(`${this.baseUrl}/conversations/${id}`), 30_000);
  }

  async deleteConversation(id: string): Promise<void> {
    await request<void>(`${this.baseUrl}/conversations/${id}`, { method: 'DELETE', expectJson: false });
    this.cache.invalidatePattern('conversations');
    this.cache.invalidate(`conversation:${id}`);
  }

  async sendMessage(conversationId: string, content: string): Promise<any> {
    const result = await request(`${this.baseUrl}/chat`, { method: 'POST', body: { conversationId, content } });
    this.cache.invalidate(`conversation:${conversationId}`);
    return result;
  }

  // === Prompt API ===
  async getPrompts(): Promise<PromptTemplate[]> {
    return this.cachedRequest('prompts', () => request<PromptTemplate[]>(`${this.baseUrl}/prompts`), 30_000);
  }
  async createPrompt(data: Partial<PromptTemplate>): Promise<PromptTemplate> {
    const result = await request<PromptTemplate>(`${this.baseUrl}/prompts`, { method: 'POST', body: data });
    this.cache.invalidate('prompts');
    return result;
  }
  async updatePrompt(id: string, data: Partial<PromptTemplate>): Promise<PromptTemplate> {
    const result = await request<PromptTemplate>(`${this.baseUrl}/prompts/${id}`, { method: 'PUT', body: data });
    this.cache.invalidate('prompts');
    return result;
  }
  async deletePrompt(id: string): Promise<void> {
    await request<void>(`${this.baseUrl}/prompts/${id}`, { method: 'DELETE', expectJson: false });
    this.cache.invalidate('prompts');
  }

  // === Plugin API ===
  async getPlugins(): Promise<PluginInstance[]> {
    return this.cachedRequest('plugins', () => request<PluginInstance[]>(`${this.baseUrl}/plugins`), 30_000);
  }
  async installPlugin(data: any): Promise<PluginInstance> {
    const result = await request<PluginInstance>(`${this.baseUrl}/plugins/install`, { method: 'POST', body: data });
    this.cache.invalidate('plugins');
    return result;
  }
  async updatePluginConfig(id: string, config: Record<string, any>): Promise<void> {
    await request<void>(`${this.baseUrl}/plugins/${id}/config`, { method: 'PUT', body: { config }, expectJson: false });
    this.cache.invalidate('plugins');
  }
  async deletePlugin(id: string): Promise<void> {
    await request<void>(`${this.baseUrl}/plugins/${id}`, { method: 'DELETE', expectJson: false });
    this.cache.invalidate('plugins');
  }

  // === Settings API ===
  async getSettings(): Promise<Settings> {
    return this.cachedRequest('settings', () => request<Settings>(`${this.baseUrl}/settings`), 60_000);
  }
  async updateSettings(data: Partial<Settings>): Promise<void> {
    await request<void>(`${this.baseUrl}/settings`, { method: 'PUT', body: data, expectJson: false });
    this.cache.invalidate('settings');
  }

  // === Stats API ===
  async getStats(): Promise<any> { return request(`${this.baseUrl}/stats`); }

  // === Skill / MCP API ===
  async getSkills(): Promise<any[]> { return request<any[]>(`${this.baseUrl}/skills`); }
  async installSkill(data: InstallSkillRequest): Promise<SkillInstallResult> {
    return request<SkillInstallResult>(`${this.baseUrl}/skills/install`, { method: 'POST', body: data });
  }
  async executeSkill(id: string, params?: Record<string, any>): Promise<SkillExecuteResult> {
    return request<SkillExecuteResult>(`${this.baseUrl}/skills/${id}/execute`, { method: 'POST', body: { params: params || {} } });
  }
  async uninstallSkill(id: string): Promise<void> {
    await request<void>(`${this.baseUrl}/skills/${id}`, { method: 'DELETE', expectJson: false });
  }
  async getMcpServers(): Promise<McpServer[]> { return request<McpServer[]>(`${this.baseUrl}/mcp`); }
  async installMcpServer(data: InstallMcpRequest): Promise<McpServer> {
    return request<McpServer>(`${this.baseUrl}/mcp`, { method: 'POST', body: data });
  }
  async connectMcpServer(id: string): Promise<McpServer> {
    return request<McpServer>(`${this.baseUrl}/mcp/${id}/connect`, { method: 'POST' });
  }
  async disconnectMcpServer(id: string): Promise<McpServer> {
    return request<McpServer>(`${this.baseUrl}/mcp/${id}/disconnect`, { method: 'POST' });
  }
  async uninstallMcpServer(id: string): Promise<void> {
    await request<void>(`${this.baseUrl}/mcp/${id}`, { method: 'DELETE', expectJson: false });
  }

  // === Script API ===
  async getScripts(): Promise<Script[]> {
    return this.cachedRequest('scripts', () => request<Script[]>(`${this.baseUrl}/scripts`), 30_000);
  }
  async getScript(id: string): Promise<Script> {
    return this.cachedRequest(`script:${id}`, () => request<Script>(`${this.baseUrl}/scripts/${id}`), 30_000);
  }
  async createScript(data: Partial<Script>): Promise<Script> {
    const result = await request<Script>(`${this.baseUrl}/scripts`, { method: 'POST', body: data });
    this.cache.invalidate('scripts');
    return result;
  }
  async updateScript(id: string, data: Partial<Script>): Promise<Script> {
    const result = await request<Script>(`${this.baseUrl}/scripts/${id}`, { method: 'PUT', body: data });
    this.cache.invalidate('scripts');
    this.cache.invalidate(`script:${id}`);
    return result;
  }
  async deleteScript(id: string): Promise<void> {
    await request<void>(`${this.baseUrl}/scripts/${id}`, { method: 'DELETE', expectJson: false });
    this.cache.invalidate('scripts');
    this.cache.invalidate(`script:${id}`);
  }
  async executeScript(id: string, args?: Record<string, any>, context?: Record<string, any>): Promise<ScriptExecutionResult> {
    return request<ScriptExecutionResult>(`${this.baseUrl}/scripts/${id}/execute`, { method: 'POST', body: { args, context } });
  }
  async useScript(name: string, args?: Record<string, any>, context?: Record<string, any>): Promise<ScriptExecutionResult> {
    return request<ScriptExecutionResult>(`${this.baseUrl}/scripts/use`, { method: 'POST', body: { name, args, context } });
  }

  // === Provider API ===
  async getProviders(): Promise<Provider[]> {
    return this.cachedRequest('providers', () => request<Provider[]>(`${this.baseUrl}/providers`), 30_000);
  }
  async getProviderModels(providerId: string): Promise<any> {
    return this.cachedRequest(`provider-models:${providerId}`, () => request(`${this.baseUrl}/providers/${providerId}/models`), 30_000);
  }
  async createProvider(data: Partial<Provider>): Promise<Provider> {
    const result = await request<Provider>(`${this.baseUrl}/providers`, { method: 'POST', body: data });
    this.cache.invalidate('providers');
    return result;
  }
  async updateProvider(id: string, data: Partial<Provider>): Promise<Provider> {
    const result = await request<Provider>(`${this.baseUrl}/providers/${id}`, { method: 'PUT', body: data });
    this.cache.invalidate('providers');
    this.cache.invalidate(`provider-models:${id}`);
    return result;
  }
  async deleteProvider(id: string): Promise<void> {
    await request<void>(`${this.baseUrl}/providers/${id}`, { method: 'DELETE', expectJson: false });
    this.cache.invalidate('providers');
    this.cache.invalidate(`provider-models:${id}`);
  }

  // === Test Suite API ===
  async getTestSuites(agentId?: string): Promise<TestSuite[]> {
    const key = agentId ? `test-suites:${agentId}` : 'test-suites';
    const url = agentId
      ? `${this.baseUrl}/test-suites?agentId=${encodeURIComponent(agentId)}`
      : `${this.baseUrl}/test-suites`;
    return this.cachedRequest(key, () => request<TestSuite[]>(url), 30_000);
  }
  async getTestSuite(id: string): Promise<TestSuite> {
    return this.cachedRequest(`test-suite:${id}`, () => request<TestSuite>(`${this.baseUrl}/test-suites/${id}`), 30_000);
  }
  async createTestSuite(data: { agentId: string; name: string; description?: string; cases?: Partial<TestCase>[] }): Promise<TestSuite> {
    const result = await request<TestSuite>(`${this.baseUrl}/test-suites`, { method: 'POST', body: data });
    this.cache.invalidatePattern('test-suites');
    return result;
  }
  async updateTestSuite(id: string, data: Partial<TestSuite>): Promise<TestSuite> {
    const result = await request<TestSuite>(`${this.baseUrl}/test-suites/${id}`, { method: 'PUT', body: data });
    this.cache.invalidatePattern('test-suites');
    this.cache.invalidate(`test-suite:${id}`);
    return result;
  }
  async deleteTestSuite(id: string): Promise<void> {
    await request<void>(`${this.baseUrl}/test-suites/${id}`, { method: 'DELETE', expectJson: false });
    this.cache.invalidatePattern('test-suites');
    this.cache.invalidate(`test-suite:${id}`);
  }
  async runTestSuite(id: string): Promise<TestRun> {
    const result = await request<TestRun>(`${this.baseUrl}/test-suites/${id}/run`, { method: 'POST' });
    this.cache.invalidate(`test-suite:${id}`);
    return result;
  }
  async getTestRuns(id: string): Promise<TestRun[]> {
    return this.cachedRequest(`test-runs:${id}`, () => request<TestRun[]>(`${this.baseUrl}/test-suites/${id}/runs`), 30_000);
  }
  async createTestCase(suiteId: string, data: Partial<TestCase>): Promise<TestCase> {
    const result = await request<TestCase>(`${this.baseUrl}/test-suites/${suiteId}/cases`, { method: 'POST', body: data });
    this.cache.invalidate(`test-suite:${suiteId}`);
    return result;
  }
  async updateTestCase(id: string, data: Partial<TestCase>): Promise<TestCase> {
    const result = await request<TestCase>(`${this.baseUrl}/test-cases/${id}`, { method: 'PUT', body: data });
    this.cache.invalidatePattern('test-');
    return result;
  }
  async deleteTestCase(id: string): Promise<void> {
    await request<void>(`${this.baseUrl}/test-cases/${id}`, { method: 'DELETE', expectJson: false });
    this.cache.invalidatePattern('test-');
  }

  // === Debug API ===
  async getDebugLogs(level?: string, limit = 100): Promise<DebugLogEntry[]> {
    const url = level
      ? `${this.baseUrl}/debug/logs?level=${level}&limit=${limit}`
      : `${this.baseUrl}/debug/logs?limit=${limit}`;
    return request<DebugLogEntry[]>(url);
  }
  async getDebugEvents(type?: string, limit = 100): Promise<DebugEventEntry[]> {
    const url = type
      ? `${this.baseUrl}/debug/events?type=${type}&limit=${limit}`
      : `${this.baseUrl}/debug/events?limit=${limit}`;
    return request<DebugEventEntry[]>(url);
  }
  async clearDebug(): Promise<void> {
    await request<void>(`${this.baseUrl}/debug/clear`, { method: 'POST', expectJson: false });
  }
  subscribeDebugStream(onLog?: (entry: DebugLogEntry) => void, onEvent?: (event: DebugEventEntry) => void): EventSource {
    const es = new EventSource(`${this.baseUrl}/debug/stream`);
    if (onLog) es.addEventListener('log', (e: any) => onLog(JSON.parse(e.data)));
    if (onEvent) es.addEventListener('event', (e: any) => onEvent(JSON.parse(e.data)));
    return es;
  }

  // === Component Server API ===
  async getComponentManifest(): Promise<{ version: string; items: ComponentContribution[] }> {
    return this.cachedRequest('components', () => request<{ version: string; items: ComponentContribution[] }>(`${this.baseUrl}/components/manifest`), 60_000);
  }
  async getComponentTree(): Promise<{ root: any[]; relationships: Array<{ from: string; to: string }> }> {
    return this.cachedRequest('component-tree', () => request(`${this.baseUrl}/components/tree`), 60_000);
  }
  async getComponentRelationships(): Promise<{ relationships: Array<{ from: string; to: string }> }> {
    return this.cachedRequest('component-relationships', () => request(`${this.baseUrl}/components/relationships`), 60_000);
  }
  async getComponentPlugins(): Promise<{ plugins: string[]; stats: any }> {
    return request(`${this.baseUrl}/components/plugins`);
  }
  async getPluginComponents(name: string): Promise<{ plugin: string; components: ComponentContribution[] }> {
    return request(`${this.baseUrl}/components/plugins/${name}`);
  }
  async registerComponents(plugin: string, contributions: ComponentContribution[]): Promise<{ registered: string; count: number }> {
    const result = await request(`${this.baseUrl}/components/register`, { method: 'POST', body: { plugin, contributions } });
    this.cache.invalidatePattern('component');
    return result;
  }
  async unregisterPluginComponents(plugin: string): Promise<{ plugin: string; removed: boolean }> {
    const result = await request(`${this.baseUrl}/components/plugins/${plugin}`, { method: 'DELETE' });
    this.cache.invalidatePattern('component');
    return result;
  }

  // === Reset / Clear API ===
  async resetSettings(): Promise<{ success: boolean; message: string }> {
    const result = await request(`${this.baseUrl}/reset/settings`, { method: 'POST' });
    this.cache.invalidate('settings');
    return result;
  }
  async clearData(targets: string[] = ['all']): Promise<{ success: boolean; cleared: string[] }> {
    const result = await request(`${this.baseUrl}/clear-data`, { method: 'POST', body: { targets } });
    this.cache.clear();
    return result;
  }

  // === Export / Import API ===
  async exportData(scope: string = 'all'): Promise<any> {
    return request(`${this.baseUrl}/export?scope=${scope}`);
  }
  async exportConversation(id: string): Promise<any> {
    return request(`${this.baseUrl}/export/conversations/${id}`);
  }
  async importData(data: any): Promise<{ success: boolean; imported: string[] }> {
    return request(`${this.baseUrl}/import`, { method: 'POST', body: data });
  }

  // === Download API ===
  async downloadResource(type: DownloadResourceType, id: string): Promise<Blob> {
    return request<Blob>(`${this.baseUrl}/download/resource?type=${type}&id=${encodeURIComponent(id)}`);
  }
  async downloadSource(): Promise<Blob> {
    return request<Blob>(`${this.baseUrl}/download/source`);
  }
  async prepareServerDownload(body: ServerDownloadRequest): Promise<{ taskId: string }> {
    return request<{ taskId: string }>(`${this.baseUrl}/download/server`, { method: 'POST', body });
  }
  async getServerDownloadStatus(taskId: string): Promise<DownloadTask> {
    return request<DownloadTask>(`${this.baseUrl}/download/server/${encodeURIComponent(taskId)}/status`);
  }
  async controlServerDownload(taskId: string, action: 'pause' | 'resume' | 'cancel'): Promise<DownloadTask> {
    return request<DownloadTask>(`${this.baseUrl}/download/server/${encodeURIComponent(taskId)}/${action}`, { method: 'POST' });
  }
}

export const api = new API();
