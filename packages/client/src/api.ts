import type { Agent, Conversation, PromptTemplate, PluginInstance, Settings, Script, ScriptExecutionResult, Provider, TestSuite, TestRun, TestCase, DebugLogEntry, DebugEventEntry, ComponentContribution, DownloadResourceType, DownloadTask, ServerDownloadRequest } from '@ordpaw/shared';

export class API {
  private baseUrl = '/api';

  // Agent API
  async getAgents(): Promise<Agent[]> {
    const res = await fetch(`${this.baseUrl}/agents`);
    return res.json();
  }

  async createAgent(data: Partial<Agent>): Promise<Agent> {
    const res = await fetch(`${this.baseUrl}/agents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  }

  async getAgent(id: string): Promise<Agent> {
    const res = await fetch(`${this.baseUrl}/agents/${id}`);
    return res.json();
  }

  async updateAgent(id: string, data: Partial<Agent>): Promise<Agent> {
    const res = await fetch(`${this.baseUrl}/agents/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  }

  async deleteAgent(id: string): Promise<void> {
    await fetch(`${this.baseUrl}/agents/${id}`, { method: 'DELETE' });
  }

  // Conversation API
  async getConversations(agentId?: string): Promise<Conversation[]> {
    const url = agentId ? `${this.baseUrl}/conversations?agentId=${agentId}` : `${this.baseUrl}/conversations`;
    const res = await fetch(url);
    return res.json();
  }

  async createConversation(agentId: string, title?: string): Promise<Conversation> {
    const res = await fetch(`${this.baseUrl}/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId, title })
    });
    return res.json();
  }

  async getConversation(id: string): Promise<Conversation> {
    const res = await fetch(`${this.baseUrl}/conversations/${id}`);
    return res.json();
  }

  async deleteConversation(id: string): Promise<void> {
    await fetch(`${this.baseUrl}/conversations/${id}`, { method: 'DELETE' });
  }

  async sendMessage(conversationId: string, content: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId, content })
    });
    return res.json();
  }

  // Prompt API
  async getPrompts(): Promise<PromptTemplate[]> {
    const res = await fetch(`${this.baseUrl}/prompts`);
    return res.json();
  }

  async createPrompt(data: Partial<PromptTemplate>): Promise<PromptTemplate> {
    const res = await fetch(`${this.baseUrl}/prompts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  }

  async updatePrompt(id: string, data: Partial<PromptTemplate>): Promise<PromptTemplate> {
    const res = await fetch(`${this.baseUrl}/prompts/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  }

  async deletePrompt(id: string): Promise<void> {
    await fetch(`${this.baseUrl}/prompts/${id}`, { method: 'DELETE' });
  }

  // Plugin API
  async getPlugins(): Promise<PluginInstance[]> {
    const res = await fetch(`${this.baseUrl}/plugins`);
    return res.json();
  }

  async installPlugin(data: any): Promise<PluginInstance> {
    const res = await fetch(`${this.baseUrl}/plugins/install`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  }

  async deletePlugin(id: string): Promise<void> {
    await fetch(`${this.baseUrl}/plugins/${id}`, { method: 'DELETE' });
  }

  // Settings API
  async getSettings(): Promise<Settings> {
    const res = await fetch(`${this.baseUrl}/settings`);
    return res.json();
  }

  async updateSettings(data: Partial<Settings>): Promise<void> {
    await fetch(`${this.baseUrl}/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  }

  // Stats API
  async getStats(): Promise<any> {
    const res = await fetch(`${this.baseUrl}/stats`);
    return res.json();
  }

  // Skills API
  async getSkills(): Promise<any[]> {
    const res = await fetch(`${this.baseUrl}/skills`);
    return res.json();
  }

  // Script API
  async getScripts(): Promise<Script[]> {
    const res = await fetch(`${this.baseUrl}/scripts`);
    return res.json();
  }

  async getScript(id: string): Promise<Script> {
    const res = await fetch(`${this.baseUrl}/scripts/${id}`);
    return res.json();
  }

  async createScript(data: Partial<Script>): Promise<Script> {
    const res = await fetch(`${this.baseUrl}/scripts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  }

  async updateScript(id: string, data: Partial<Script>): Promise<Script> {
    const res = await fetch(`${this.baseUrl}/scripts/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  }

  async deleteScript(id: string): Promise<void> {
    await fetch(`${this.baseUrl}/scripts/${id}`, { method: 'DELETE' });
  }

  async executeScript(id: string, args?: Record<string, any>, context?: Record<string, any>): Promise<ScriptExecutionResult> {
    const res = await fetch(`${this.baseUrl}/scripts/${id}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ args, context })
    });
    return res.json();
  }

  async useScript(name: string, args?: Record<string, any>, context?: Record<string, any>): Promise<ScriptExecutionResult> {
    const res = await fetch(`${this.baseUrl}/scripts/use`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, args, context })
    });
    return res.json();
  }

  // Provider API
  async getProviders(): Promise<Provider[]> {
    const res = await fetch(`${this.baseUrl}/providers`);
    return res.json();
  }

  async getProviderModels(providerId: string) {
    const res = await fetch(`${this.baseUrl}/providers/${providerId}/models`);
    return res.json();
  }

  async createProvider(data: Partial<Provider>): Promise<Provider> {
    const res = await fetch(`${this.baseUrl}/providers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  }

  async updateProvider(id: string, data: Partial<Provider>): Promise<Provider> {
    const res = await fetch(`${this.baseUrl}/providers/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  }

  async deleteProvider(id: string): Promise<void> {
    await fetch(`${this.baseUrl}/providers/${id}`, { method: 'DELETE' });
  }

  // Test Suite API
  async getTestSuites(agentId?: string): Promise<TestSuite[]> {
    const url = agentId ? `${this.baseUrl}/test-suites?agentId=${agentId}` : `${this.baseUrl}/test-suites`;
    const res = await fetch(url);
    return res.json();
  }

  async getTestSuite(id: string): Promise<TestSuite> {
    const res = await fetch(`${this.baseUrl}/test-suites/${id}`);
    return res.json();
  }

  async createTestSuite(data: { agentId: string; name: string; description?: string; cases?: Partial<TestCase>[] }): Promise<TestSuite> {
    const res = await fetch(`${this.baseUrl}/test-suites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  }

  async updateTestSuite(id: string, data: Partial<TestSuite>): Promise<TestSuite> {
    const res = await fetch(`${this.baseUrl}/test-suites/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  }

  async deleteTestSuite(id: string): Promise<void> {
    await fetch(`${this.baseUrl}/test-suites/${id}`, { method: 'DELETE' });
  }

  async runTestSuite(id: string): Promise<TestRun> {
    const res = await fetch(`${this.baseUrl}/test-suites/${id}/run`, { method: 'POST' });
    return res.json();
  }

  async getTestRuns(id: string): Promise<TestRun[]> {
    const res = await fetch(`${this.baseUrl}/test-suites/${id}/runs`);
    return res.json();
  }

  async createTestCase(suiteId: string, data: Partial<TestCase>): Promise<TestCase> {
    const res = await fetch(`${this.baseUrl}/test-suites/${suiteId}/cases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  }

  async updateTestCase(id: string, data: Partial<TestCase>): Promise<TestCase> {
    const res = await fetch(`${this.baseUrl}/test-cases/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  }

  async deleteTestCase(id: string): Promise<void> {
    await fetch(`${this.baseUrl}/test-cases/${id}`, { method: 'DELETE' });
  }

  // Debug API
  async getDebugLogs(level?: string, limit = 100): Promise<DebugLogEntry[]> {
    const url = level ? `${this.baseUrl}/debug/logs?level=${level}&limit=${limit}` : `${this.baseUrl}/debug/logs?limit=${limit}`;
    const res = await fetch(url);
    return res.json();
  }

  async getDebugEvents(type?: string, limit = 100): Promise<DebugEventEntry[]> {
    const url = type ? `${this.baseUrl}/debug/events?type=${type}&limit=${limit}` : `${this.baseUrl}/debug/events?limit=${limit}`;
    const res = await fetch(url);
    return res.json();
  }

  async clearDebug(): Promise<void> {
    await fetch(`${this.baseUrl}/debug/clear`, { method: 'POST' });
  }

  subscribeDebugStream(
    onLog?: (entry: DebugLogEntry) => void,
    onEvent?: (event: DebugEventEntry) => void
  ): EventSource {
    const es = new EventSource(`${this.baseUrl}/debug/stream`);
    if (onLog) es.addEventListener('log', (e: any) => onLog(JSON.parse(e.data)));
    if (onEvent) es.addEventListener('event', (e: any) => onEvent(JSON.parse(e.data)));
    return es;
  }

  // Component API
  async getComponentManifest(): Promise<ComponentContribution[]> {
    const res = await fetch(`${this.baseUrl}/components/manifest`);
    return res.json();
  }

  // Reset / Clear API
  async resetSettings(): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${this.baseUrl}/reset/settings`, { method: 'POST' });
    return res.json();
  }

  async clearData(targets: string[] = ['all']): Promise<{ success: boolean; cleared: string[] }> {
    const res = await fetch(`${this.baseUrl}/clear-data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targets })
    });
    return res.json();
  }

  // Export / Import API
  async exportData(scope: string = 'all'): Promise<any> {
    const res = await fetch(`${this.baseUrl}/export?scope=${scope}`);
    return res.json();
  }

  async exportConversation(id: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/export/conversations/${id}`);
    return res.json();
  }

  async importData(data: any): Promise<{ success: boolean; imported: string[] }> {
    const res = await fetch(`${this.baseUrl}/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  }

  // Download API
  async downloadResource(type: DownloadResourceType, id: string): Promise<Blob> {
    const res = await fetch(`${this.baseUrl}/download/resource?type=${type}&id=${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error(`下载失败 ${res.status}`);
    return res.blob();
  }

  async downloadSource(): Promise<Blob> {
    const res = await fetch(`${this.baseUrl}/download/source`);
    if (!res.ok) throw new Error(`源码下载失败 ${res.status}`);
    return res.blob();
  }

  async prepareServerDownload(body: ServerDownloadRequest): Promise<{ taskId: string }> {
    const res = await fetch(`${this.baseUrl}/download/server`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`创建服务端下载任务失败 ${res.status}`);
    return res.json();
  }

  async getServerDownloadStatus(taskId: string): Promise<DownloadTask> {
    const res = await fetch(`${this.baseUrl}/download/server/${encodeURIComponent(taskId)}/status`);
    if (!res.ok) throw new Error(`获取任务状态失败 ${res.status}`);
    return res.json();
  }

  async controlServerDownload(taskId: string, action: 'pause' | 'resume' | 'cancel'): Promise<DownloadTask> {
    const res = await fetch(`${this.baseUrl}/download/server/${encodeURIComponent(taskId)}/${action}`, {
      method: 'POST'
    });
    if (!res.ok) throw new Error(`控制任务失败 ${res.status}`);
    return res.json();
  }
}
