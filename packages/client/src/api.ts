import type { Agent, Conversation, PromptTemplate, PluginInstance, Settings, Script, ScriptExecutionResult, Provider, TestSuite, TestRun, TestCase, DebugLogEntry, DebugEventEntry, ComponentContribution, DownloadResourceType, DownloadTask, ServerDownloadRequest, McpServer, InstallMcpRequest, InstallSkillRequest, SkillInstallResult, SkillExecuteResult } from '@ordpaw/shared';

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

  private url(path: string): string {
    return `${this.baseUrl}${path}`;
  }

  // Agent API
  async getAgents(): Promise<Agent[]> {
    return request<Agent[]>(this.url('/agents'));
  }
  async createAgent(data: Partial<Agent>): Promise<Agent> {
    return request<Agent>(this.url('/agents'), { method: 'POST', body: JSON.stringify(data) });
  }
  async getAgent(id: string): Promise<Agent> {
    return request<Agent>(this.url(`/agents/${id}`));
  }
  async updateAgent(id: string, data: Partial<Agent>): Promise<Agent> {
    return request<Agent>(this.url(`/agents/${id}`), { method: 'PUT', body: JSON.stringify(data) });
  }
  async deleteAgent(id: string): Promise<void> {
    await request<void>(this.url(`/agents/${id}`), { method: 'DELETE' }, 'void');
  }
  // Conversation API
  async getConversations(agentId?: string): Promise<Conversation[]> {
    const url = agentId ? this.url(`/conversations?agentId=${encodeURIComponent(agentId)}`) : this.url('/conversations');
    return request<Conversation[]>(url);
  }
  async createConversation(agentId: string, title?: string): Promise<Conversation> {
    return request<Conversation>(this.url('/conversations'), { method: 'POST', body: JSON.stringify({ agentId, title }) });
  }
  async getConversation(id: string): Promise<Conversation> {
    return request<Conversation>(this.url(`/conversations/${id}`));
  }
  async deleteConversation(id: string): Promise<void> {
    await request<void>(this.url(`/conversations/${id}`), { method: 'DELETE' }, 'void');
  }
  async sendMessage(conversationId: string, content: string): Promise<any> {
    return request(this.url('/chat'), { method: 'POST', body: JSON.stringify({ conversationId, content }) });
  }
  // Prompt API
  async getPrompts(): Promise<PromptTemplate[]> {
    return request<PromptTemplate[]>(this.url('/prompts'));
  }
  async createPrompt(data: Partial<PromptTemplate>): Promise<PromptTemplate> {
    return request<PromptTemplate>(this.url('/prompts'), { method: 'POST', body: JSON.stringify(data) });
  }
  async updatePrompt(id: string, data: Partial<PromptTemplate>): Promise<PromptTemplate> {
    return request<PromptTemplate>(this.url(`/prompts/${id}`), { method: 'PUT', body: JSON.stringify(data) });
  }
  async deletePrompt(id: string): Promise<void> {
    await request<void>(this.url(`/prompts/${id}`), { method: 'DELETE' }, 'void');
  }
  // Plugin API
  async getPlugins(): Promise<PluginInstance[]> {
    return request<PluginInstance[]>(this.url('/plugins'));
  }
  async installPlugin(data: any): Promise<PluginInstance> {
    return request<PluginInstance>(this.url('/plugins/install'), { method: 'POST', body: JSON.stringify(data) });
  }
  async updatePluginConfig(id: string, config: Record<string, any>): Promise<void> {
    await request<void>(this.url(`/plugins/${id}/config`), { method: 'PUT', body: JSON.stringify({ config }) }, 'void');
  }
  async deletePlugin(id: string): Promise<void> {
    await request<void>(this.url(`/plugins/${id}`), { method: 'DELETE' }, 'void');
  }
  // Settings API
  async getSettings(): Promise<Settings> {
    return request<Settings>(this.url('/settings'));
  }
  async updateSettings(data: Partial<Settings>): Promise<void> {
    await request<void>(this.url('/settings'), { method: 'PUT', body: JSON.stringify(data) }, 'void');
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
    return request<Script[]>(this.url('/scripts'));
  }
  async getScript(id: string): Promise<Script> {
    return request<Script>(this.url(`/scripts/${id}`));
  }
  async createScript(data: Partial<Script>): Promise<Script> {
    return request<Script>(this.url('/scripts'), { method: 'POST', body: JSON.stringify(data) });
  }
  async updateScript(id: string, data: Partial<Script>): Promise<Script> {
    return request<Script>(this.url(`/scripts/${id}`), { method: 'PUT', body: JSON.stringify(data) });
  }
  async deleteScript(id: string): Promise<void> {
    await request<void>(this.url(`/scripts/${id}`), { method: 'DELETE' }, 'void');
  }
  async executeScript(id: string, args?: Record<string, any>, context?: Record<string, any>): Promise<ScriptExecutionResult> {
    return request<ScriptExecutionResult>(this.url(`/scripts/${id}/execute`), { method: 'POST', body: JSON.stringify({ args, context }) });
  }
  async useScript(name: string, args?: Record<string, any>, context?: Record<string, any>): Promise<ScriptExecutionResult> {
    return request<ScriptExecutionResult>(this.url('/scripts/use'), { method: 'POST', body: JSON.stringify({ name, args, context }) });
  }
  // Provider API
  async getProviders(): Promise<Provider[]> {
    return request<Provider[]>(this.url('/providers'));
  }
  async getProviderModels(providerId: string) {
    return request(this.url(`/providers/${providerId}/models`));
  }
  async createProvider(data: Partial<Provider>): Promise<Provider> {
    return request<Provider>(this.url('/providers'), { method: 'POST', body: JSON.stringify(data) });
  }
  async updateProvider(id: string, data: Partial<Provider>): Promise<Provider> {
    return request<Provider>(this.url(`/providers/${id}`), { method: 'PUT', body: JSON.stringify(data) });
  }
  async deleteProvider(id: string): Promise<void> {
    await request<void>(this.url(`/providers/${id}`), { method: 'DELETE' }, 'void');
  }
  // Test Suite API
  async getTestSuites(agentId?: string): Promise<TestSuite[]> {
    const url = agentId ? this.url(`/test-suites?agentId=${encodeURIComponent(agentId)}`) : this.url('/test-suites');
    return request<TestSuite[]>(url);
  }
  async getTestSuite(id: string): Promise<TestSuite> {
    return request<TestSuite>(this.url(`/test-suites/${id}`));
  }
  async createTestSuite(data: { agentId: string; name: string; description?: string; cases?: Partial<TestCase>[] }): Promise<TestSuite> {
    return request<TestSuite>(this.url('/test-suites'), { method: 'POST', body: JSON.stringify(data) });
  }
  async updateTestSuite(id: string, data: Partial<TestSuite>): Promise<TestSuite> {
    return request<TestSuite>(this.url(`/test-suites/${id}`), { method: 'PUT', body: JSON.stringify(data) });
  }
  async deleteTestSuite(id: string): Promise<void> {
    await request<void>(this.url(`/test-suites/${id}`), { method: 'DELETE' }, 'void');
  }
  async runTestSuite(id: string): Promise<TestRun> {
    return request<TestRun>(this.url(`/test-suites/${id}/run`), { method: 'POST' });
  }
  async getTestRuns(id: string): Promise<TestRun[]> {
    return request<TestRun[]>(this.url(`/test-suites/${id}/runs`));
  }
  async createTestCase(suiteId: string, data: Partial<TestCase>): Promise<TestCase> {
    return request<TestCase>(this.url(`/test-suites/${suiteId}/cases`), { method: 'POST', body: JSON.stringify(data) });
  }
  async updateTestCase(id: string, data: Partial<TestCase>): Promise<TestCase> {
    return request<TestCase>(this.url(`/test-cases/${id}`), { method: 'PUT', body: JSON.stringify(data) });
  }
  async deleteTestCase(id: string): Promise<void> {
    await request<void>(this.url(`/test-cases/${id}`), { method: 'DELETE' }, 'void');
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
    return request<ComponentContribution[]>(this.url('/components/manifest'));
  }
  // Reset / Clear API
  async resetSettings(): Promise<{ success: boolean; message: string }> {
    return request(this.url('/reset/settings'), { method: 'POST' });
  }
  async clearData(targets: string[] = ['all']): Promise<{ success: boolean; cleared: string[] }> {
    return request(this.url('/clear-data'), { method: 'POST', body: JSON.stringify({ targets }) });
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