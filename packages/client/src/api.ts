import type { Agent, Conversation, PromptTemplate, PluginInstance, Settings, Script, ScriptExecutionResult, Provider, TestSuite, TestRun, TestCase, DebugLogEntry, DebugEventEntry, ComponentContribution, DownloadResourceType, DownloadTask, ServerDownloadRequest, McpServer, InstallMcpRequest, InstallSkillRequest, SkillInstallResult, SkillExecuteResult } from '@ordpaw/shared';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

class APICache {
  private cache = new Map<string, CacheEntry<any>>();
  private defaultTTL = 60000; // 1 minute

  set<T>(key: string, data: T, ttl?: number): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTTL
    });
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

  invalidate(key: string): void {
    this.cache.delete(key);
  }

  invalidatePattern(pattern: string): void {
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }
  }

  clear(): void {
    this.cache.clear();
  }
}

async function request<T = any>(
  url: string,
  options: RequestInit = {},
  expect: 'json' | 'blob' | 'void' = 'json'
): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {})
  };
  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    let details: any;
    try {
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        const body = await res.json();
        msg = body?.error || body?.message || msg;
        details = body?.details;
      } else {
        const text = await res.text();
        if (text) msg = `${msg}: ${text.slice(0, 200)}`;
      }
    } catch { /* ignore parse error */ }
    const err = new Error(`[API ${res.status}] ${msg}`) as Error & { status?: number; details?: any };
    err.status = res.status;
    err.details = details;
    throw err;
  }
  if (expect === 'blob') return res.blob() as unknown as T;
  if (expect === 'void') return undefined as unknown as T;
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) return undefined as unknown as T;
  const text = await res.text();
  if (!text) return undefined as unknown as T;
  return JSON.parse(text) as T;
}

export class API {
  private baseUrl = '/api';
  private cache = new APICache();
  private pendingRequests = new Map<string, Promise<any>>();

  private url(path: string): string {
    return `${this.baseUrl}${path}`;
  }

  private async cachedRequest<T>(key: string, fetcher: () => Promise<T>, ttl?: number): Promise<T> {
    const cached = this.cache.get<T>(key);
    if (cached) return cached;

    // 防止重复请求
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
    if (pattern) {
      this.cache.invalidatePattern(pattern);
    } else {
      this.cache.clear();
    }
  }

  // Agent API
  async getAgents(): Promise<Agent[]> {
    return this.cachedRequest('agents', () => request<Agent[]>(this.url('/agents')), 30000);
  }
  async createAgent(data: Partial<Agent>): Promise<Agent> {
    const result = await request<Agent>(this.url('/agents'), { method: 'POST', body: JSON.stringify(data) });
    this.cache.invalidate('agents');
    return result;
  }
  async getAgent(id: string): Promise<Agent> {
    return this.cachedRequest(`agent:${id}`, () => request<Agent>(this.url(`/agents/${id}`)), 30000);
  }
  async updateAgent(id: string, data: Partial<Agent>): Promise<Agent> {
    const result = await request<Agent>(this.url(`/agents/${id}`), { method: 'PUT', body: JSON.stringify(data) });
    this.cache.invalidate('agents');
    this.cache.invalidate(`agent:${id}`);
    return result;
  }
  async deleteAgent(id: string): Promise<void> {
    await request<void>(this.url(`/agents/${id}`), { method: 'DELETE' }, 'void');
    this.cache.invalidate('agents');
    this.cache.invalidate(`agent:${id}`);
  }
  // Conversation API
  async getConversations(agentId?: string): Promise<Conversation[]> {
    const key = agentId ? `conversations:${agentId}` : 'conversations';
    const fetcher = () => {
      const url = agentId ? this.url(`/conversations?agentId=${encodeURIComponent(agentId)}`) : this.url('/conversations');
      return request<Conversation[]>(url);
    };
    return this.cachedRequest(key, fetcher, 30000);
  }
  async createConversation(agentId: string, title?: string): Promise<Conversation> {
    const result = await request<Conversation>(this.url('/conversations'), { method: 'POST', body: JSON.stringify({ agentId, title }) });
    this.cache.invalidatePattern('conversations');
    return result;
  }
  async getConversation(id: string): Promise<Conversation> {
    return this.cachedRequest(`conversation:${id}`, () => request<Conversation>(this.url(`/conversations/${id}`)), 30000);
  }
  async deleteConversation(id: string): Promise<void> {
    await request<void>(this.url(`/conversations/${id}`), { method: 'DELETE' }, 'void');
    this.cache.invalidatePattern('conversations');
    this.cache.invalidate(`conversation:${id}`);
  }
  async sendMessage(conversationId: string, content: string): Promise<any> {
    const result = await request(this.url('/chat'), { method: 'POST', body: JSON.stringify({ conversationId, content }) });
    this.cache.invalidate(`conversation:${conversationId}`);
    return result;
  }
  // Prompt API
  async getPrompts(): Promise<PromptTemplate[]> {
    return this.cachedRequest('prompts', () => request<PromptTemplate[]>(this.url('/prompts')), 30000);
  }
  async createPrompt(data: Partial<PromptTemplate>): Promise<PromptTemplate> {
    const result = await request<PromptTemplate>(this.url('/prompts'), { method: 'POST', body: JSON.stringify(data) });
    this.cache.invalidate('prompts');
    return result;
  }
  async updatePrompt(id: string, data: Partial<PromptTemplate>): Promise<PromptTemplate> {
    const result = await request<PromptTemplate>(this.url(`/prompts/${id}`), { method: 'PUT', body: JSON.stringify(data) });
    this.cache.invalidate('prompts');
    return result;
  }
  async deletePrompt(id: string): Promise<void> {
    await request<void>(this.url(`/prompts/${id}`), { method: 'DELETE' }, 'void');
    this.cache.invalidate('prompts');
  }
  // Plugin API
  async getPlugins(): Promise<PluginInstance[]> {
    return this.cachedRequest('plugins', () => request<PluginInstance[]>(this.url('/plugins')), 30000);
  }
  async installPlugin(data: any): Promise<PluginInstance> {
    const result = await request<PluginInstance>(this.url('/plugins/install'), { method: 'POST', body: JSON.stringify(data) });
    this.cache.invalidate('plugins');
    return result;
  }
  async updatePluginConfig(id: string, config: Record<string, any>): Promise<void> {
    await request<void>(this.url(`/plugins/${id}/config`), { method: 'PUT', body: JSON.stringify({ config }) }, 'void');
    this.cache.invalidate('plugins');
  }
  async deletePlugin(id: string): Promise<void> {
    await request<void>(this.url(`/plugins/${id}`), { method: 'DELETE' }, 'void');
    this.cache.invalidate('plugins');
  }
  // Settings API
  async getSettings(): Promise<Settings> {
    return this.cachedRequest('settings', () => request<Settings>(this.url('/settings')), 60000);
  }
  async updateSettings(data: Partial<Settings>): Promise<void> {
    await request<void>(this.url('/settings'), { method: 'PUT', body: JSON.stringify(data) }, 'void');
    this.cache.invalidate('settings');
  }
  // Stats API
  async getStats(): Promise<any> {
    return request(this.url('/stats'));
  }
  // Skills API
  async getSkills(): Promise<any[]> {
    return request<any[]>(this.url('/skills'));
  }
  // Skill Install API
  async installSkill(data: InstallSkillRequest): Promise<SkillInstallResult> {
    return request<SkillInstallResult>(this.url('/skills/install'), { method: 'POST', body: JSON.stringify(data) });
  }
  async executeSkill(id: string, params?: Record<string, any>): Promise<SkillExecuteResult> {
    return request<SkillExecuteResult>(this.url(`/skills/${id}/execute`), { method: 'POST', body: JSON.stringify({ params: params || {} }) });
  }
  async uninstallSkill(id: string): Promise<void> {
    await request<void>(this.url(`/skills/${id}`), { method: 'DELETE' }, 'void');
  }
  // MCP Server API
  async getMcpServers(): Promise<McpServer[]> {
    return request<McpServer[]>(this.url('/mcp'));
  }
  async installMcpServer(data: InstallMcpRequest): Promise<McpServer> {
    return request<McpServer>(this.url('/mcp'), { method: 'POST', body: JSON.stringify(data) });
  }
  async connectMcpServer(id: string): Promise<McpServer> {
    return request<McpServer>(this.url(`/mcp/${id}/connect`), { method: 'POST' });
  }
  async disconnectMcpServer(id: string): Promise<McpServer> {
    return request<McpServer>(this.url(`/mcp/${id}/disconnect`), { method: 'POST' });
  }
  async uninstallMcpServer(id: string): Promise<void> {
    await request<void>(this.url(`/mcp/${id}`), { method: 'DELETE' }, 'void');
  }
  // Script API
  async getScripts(): Promise<Script[]> {
    return this.cachedRequest('scripts', () => request<Script[]>(this.url('/scripts')), 30000);
  }
  async getScript(id: string): Promise<Script> {
    return this.cachedRequest(`script:${id}`, () => request<Script>(this.url(`/scripts/${id}`)), 30000);
  }
  async createScript(data: Partial<Script>): Promise<Script> {
    const result = await request<Script>(this.url('/scripts'), { method: 'POST', body: JSON.stringify(data) });
    this.cache.invalidate('scripts');
    return result;
  }
  async updateScript(id: string, data: Partial<Script>): Promise<Script> {
    const result = await request<Script>(this.url(`/scripts/${id}`), { method: 'PUT', body: JSON.stringify(data) });
    this.cache.invalidate('scripts');
    this.cache.invalidate(`script:${id}`);
    return result;
  }
  async deleteScript(id: string): Promise<void> {
    await request<void>(this.url(`/scripts/${id}`), { method: 'DELETE' }, 'void');
    this.cache.invalidate('scripts');
    this.cache.invalidate(`script:${id}`);
  }
  async executeScript(id: string, args?: Record<string, any>, context?: Record<string, any>): Promise<ScriptExecutionResult> {
    return request<ScriptExecutionResult>(this.url(`/scripts/${id}/execute`), { method: 'POST', body: JSON.stringify({ args, context }) });
  }
  async useScript(name: string, args?: Record<string, any>, context?: Record<string, any>): Promise<ScriptExecutionResult> {
    return request<ScriptExecutionResult>(this.url('/scripts/use'), { method: 'POST', body: JSON.stringify({ name, args, context }) });
  }
  // Provider API
  async getProviders(): Promise<Provider[]> {
    return this.cachedRequest('providers', () => request<Provider[]>(this.url('/providers')), 30000);
  }
  async getProviderModels(providerId: string) {
    return this.cachedRequest(`provider-models:${providerId}`, () => request(this.url(`/providers/${providerId}/models`)), 30000);
  }
  async createProvider(data: Partial<Provider>): Promise<Provider> {
    const result = await request<Provider>(this.url('/providers'), { method: 'POST', body: JSON.stringify(data) });
    this.cache.invalidate('providers');
    return result;
  }
  async updateProvider(id: string, data: Partial<Provider>): Promise<Provider> {
    const result = await request<Provider>(this.url(`/providers/${id}`), { method: 'PUT', body: JSON.stringify(data) });
    this.cache.invalidate('providers');
    this.cache.invalidate(`provider-models:${id}`);
    return result;
  }
  async deleteProvider(id: string): Promise<void> {
    await request<void>(this.url(`/providers/${id}`), { method: 'DELETE' }, 'void');
    this.cache.invalidate('providers');
    this.cache.invalidate(`provider-models:${id}`);
  }
  // Test Suite API
  async getTestSuites(agentId?: string): Promise<TestSuite[]> {
    const key = agentId ? `test-suites:${agentId}` : 'test-suites';
    const fetcher = () => {
      const url = agentId ? this.url(`/test-suites?agentId=${encodeURIComponent(agentId)}`) : this.url('/test-suites');
      return request<TestSuite[]>(url);
    };
    return this.cachedRequest(key, fetcher, 30000);
  }
  async getTestSuite(id: string): Promise<TestSuite> {
    return this.cachedRequest(`test-suite:${id}`, () => request<TestSuite>(this.url(`/test-suites/${id}`)), 30000);
  }
  async createTestSuite(data: { agentId: string; name: string; description?: string; cases?: Partial<TestCase>[] }): Promise<TestSuite> {
    const result = await request<TestSuite>(this.url('/test-suites'), { method: 'POST', body: JSON.stringify(data) });
    this.cache.invalidatePattern('test-suites');
    return result;
  }
  async updateTestSuite(id: string, data: Partial<TestSuite>): Promise<TestSuite> {
    const result = await request<TestSuite>(this.url(`/test-suites/${id}`), { method: 'PUT', body: JSON.stringify(data) });
    this.cache.invalidatePattern('test-suites');
    this.cache.invalidate(`test-suite:${id}`);
    return result;
  }
  async deleteTestSuite(id: string): Promise<void> {
    await request<void>(this.url(`/test-suites/${id}`), { method: 'DELETE' }, 'void');
    this.cache.invalidatePattern('test-suites');
    this.cache.invalidate(`test-suite:${id}`);
  }
  async runTestSuite(id: string): Promise<TestRun> {
    const result = await request<TestRun>(this.url(`/test-suites/${id}/run`), { method: 'POST' });
    this.cache.invalidate(`test-suite:${id}`);
    return result;
  }
  async getTestRuns(id: string): Promise<TestRun[]> {
    return this.cachedRequest(`test-runs:${id}`, () => request<TestRun[]>(this.url(`/test-suites/${id}/runs`)), 30000);
  }
  async createTestCase(suiteId: string, data: Partial<TestCase>): Promise<TestCase> {
    const result = await request<TestCase>(this.url(`/test-suites/${suiteId}/cases`), { method: 'POST', body: JSON.stringify(data) });
    this.cache.invalidate(`test-suite:${suiteId}`);
    return result;
  }
  async updateTestCase(id: string, data: Partial<TestCase>): Promise<TestCase> {
    const result = await request<TestCase>(this.url(`/test-cases/${id}`), { method: 'PUT', body: JSON.stringify(data) });
    this.cache.invalidatePattern('test-');
    return result;
  }
  async deleteTestCase(id: string): Promise<void> {
    await request<void>(this.url(`/test-cases/${id}`), { method: 'DELETE' }, 'void');
    this.cache.invalidatePattern('test-');
  }
  // Debug API
  async getDebugLogs(level?: string, limit = 100): Promise<DebugLogEntry[]> {
    const url = level ? this.url(`/debug/logs?level=${level}&limit=${limit}`) : this.url(`/debug/logs?limit=${limit}`);
    return request<DebugLogEntry[]>(url);
  }
  async getDebugEvents(type?: string, limit = 100): Promise<DebugEventEntry[]> {
    const url = type ? this.url(`/debug/events?type=${type}&limit=${limit}`) : this.url(`/debug/events?limit=${limit}`);
    return request<DebugEventEntry[]>(url);
  }
  async clearDebug(): Promise<void> {
    await request<void>(this.url('/debug/clear'), { method: 'POST' }, 'void');
  }
  subscribeDebugStream(onLog?: (entry: DebugLogEntry) => void, onEvent?: (event: DebugEventEntry) => void): EventSource {
    const es = new EventSource(this.url('/debug/stream'));
    if (onLog) es.addEventListener('log', (e: any) => onLog(JSON.parse(e.data)));
    if (onEvent) es.addEventListener('event', (e: any) => onEvent(JSON.parse(e.data)));
    return es;
  }
  // Component API
  async getComponentManifest(): Promise<ComponentContribution[]> {
    return this.cachedRequest('components', () => request<ComponentContribution[]>(this.url('/components/manifest')), 60000);
  }
  async getComponentTree(): Promise<any> {
    return this.cachedRequest('component-tree', () => request(this.url('/components/tree')), 60000);
  }
  async getComponentRelationships(): Promise<any[]> {
    return this.cachedRequest('component-relationships', () => request<any[]>(this.url('/components/relationships')), 60000);
  }
  // Reset / Clear API
  async resetSettings(): Promise<{ success: boolean; message: string }> {
    const result = await request(this.url('/reset/settings'), { method: 'POST' });
    this.cache.invalidate('settings');
    return result;
  }
  async clearData(targets: string[] = ['all']): Promise<{ success: boolean; cleared: string[] }> {
    const result = await request(this.url('/clear-data'), { method: 'POST', body: JSON.stringify({ targets }) });
    this.cache.clear();
    return result;
  }
  // Export / Import API
  async exportData(scope: string = 'all'): Promise<any> {
    return request(this.url(`/export?scope=${scope}`));
  }
  async exportConversation(id: string): Promise<any> {
    return request(this.url(`/export/conversations/${id}`));
  }
  async importData(data: any): Promise<{ success: boolean; imported: string[] }> {
    return request(this.url('/import'), { method: 'POST', body: JSON.stringify(data) });
  }
  // Download API
  async downloadResource(type: DownloadResourceType, id: string): Promise<Blob> {
    return request<Blob>(this.url(`/download/resource?type=${type}&id=${encodeURIComponent(id)}`), {}, 'blob');
  }
  async downloadSource(): Promise<Blob> {
    return request<Blob>(this.url('/download/source'), {}, 'blob');
  }
  async prepareServerDownload(body: ServerDownloadRequest): Promise<{ taskId: string }> {
    return request<{ taskId: string }>(this.url('/download/server'), { method: 'POST', body: JSON.stringify(body) });
  }
  async getServerDownloadStatus(taskId: string): Promise<DownloadTask> {
    return request<DownloadTask>(this.url(`/download/server/${encodeURIComponent(taskId)}/status`));
  }
  async controlServerDownload(taskId: string, action: 'pause' | 'resume' | 'cancel'): Promise<DownloadTask> {
    return request<DownloadTask>(this.url(`/download/server/${encodeURIComponent(taskId)}/${action}`), { method: 'POST' });
  }
}