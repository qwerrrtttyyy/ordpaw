// === Agent ===
export interface Agent {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  providerId: string;
  model: string;
  skills: string[];
  mcpServers: McpConfig[];
  createdAt: number;
  updatedAt: number;
}

// === Provider ===
export interface ModelInfo {
  id: string;
  name: string;
}

export interface Provider {
  id: string;
  name: string;
  type: 'openai' | 'anthropic' | 'ollama' | 'custom';
  baseUrl?: string;
  apiKeyName?: string;
  apiKey?: string;
  models: ModelInfo[];
  enabled: boolean;
  isBuiltIn: boolean;
  config?: Record<string, any>;
  createdAt: number;
  updatedAt: number;
}

export interface CreateProviderRequest {
  name: string;
  type: Provider['type'];
  baseUrl?: string;
  apiKey?: string;
  apiKeyName?: string;
  models?: ModelInfo[];
  config?: Record<string, any>;
}

// === 会话 ===
export interface Conversation {
  id: string;
  agentId: string;
  title: string;
  messages: Message[];
  checkpoints: Checkpoint[];
  variables: Record<string, any>;
  createdAt: number;
  updatedAt: number;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

// === 检查点 ===
export interface Checkpoint {
  id: string;
  conversationId: string;
  messageId: string;
  state: {
    messages: Message[];
    variables: Record<string, any>;
  };
  label?: string;
  createdAt: number;
}

// === 测试套件 ===
export interface TestCase {
  id: string;
  suiteId: string;
  name: string;
  input: string;
  expectedOutput?: string;
  expectedContains?: string[];
  variables?: Record<string, any>;
  createdAt: number;
  updatedAt: number;
}

export interface TestSuite {
  id: string;
  agentId: string;
  name: string;
  description: string;
  cases: TestCase[];
  createdAt: number;
  updatedAt: number;
}

export interface TestRunResult {
  caseId: string;
  passed: boolean;
  output: string;
  duration: number;
  error?: string;
}

export interface TestRun {
  id: string;
  suiteId: string;
  agentId: string;
  results: TestRunResult[];
  passed: number;
  failed: number;
  createdAt: number;
}

export interface CreateTestSuiteRequest {
  agentId: string;
  name: string;
  description?: string;
  cases?: Array<Partial<TestCase>>;
}

// === 插件 ===
// === 前端组件贡献 ===
export interface ComponentContribution {
  type: 'css' | 'script' | 'component';
  name: string;
  src: string;
  slot?: 'header' | 'sidebar' | 'dashboard' | 'settings' | 'view';
  metadata?: Record<string, any>;
}

export interface PluginManifest {
  name: string;
  version: string;
  description: string;
  main: string;
  config?: Record<string, ConfigField>;
  events?: string[];
  frontend?: ComponentContribution[];
}

export interface ConfigField {
  type: 'string' | 'number' | 'boolean';
  default?: any;
  description?: string;
}

export interface PluginInstance {
  id: string;
  manifest: PluginManifest;
  enabled: boolean;
  config: Record<string, any>;
  state: 'loaded' | 'error' | 'disabled';
}

// === 事件总线 ===
export type EventCallback = (payload: any) => void | Promise<void>;

export interface EventBus {
  on(event: string, callback: EventCallback): void;
  off(event: string, callback: EventCallback): void;
  emit(event: string, payload: any): Promise<void>;
}

// === 技能 ===
export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  parameters: any;
  returns?: any;
  execute: (params: any, context: SkillContext) => Promise<any>;
}

export interface SkillContext {
  conversationId: string;
  agentId: string;
  variables: Record<string, any>;
}

// === MCP ===
export interface McpConfig {
  name: string;
  transport: 'stdio' | 'sse' | 'websocket';
  command?: string;
  url?: string;
  env?: Record<string, string>;
}

// === 提示词 ===
export interface PromptTemplate {
  id: string;
  name: string;
  category: string;
  content: string;
  variables: PromptVariable[];
  version: number;
  createdAt: number;
  updatedAt: number;
}

export interface PromptVariable {
  name: string;
  description: string;
  defaultValue?: string;
  required: boolean;
}

// === 调试 ===
export interface DebugLogEntry {
  id: string;
  time: number;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  source?: string;
  metadata?: Record<string, any>;
}

export interface DebugEventEntry {
  id: string;
  time: number;
  type: string;
  payload: any;
}

export type ThemeId = 'ordpaw-light' | 'ordpaw-dark' | 'ordpaw-twilight' | 'minimal' | 'forest' | 'ocean' | 'neon' | 'material';
export type Locale = 'zh-CN' | 'en-US';
export type PerformanceTier = 'auto' | 'high' | 'medium' | 'low';

// === 设置 ===
export interface Settings {
  theme: ThemeId;
  uiMode?: 'classic' | 'modern';
  uiEffects?: 'minimal' | 'balanced' | 'expressive';
  performanceMode?: PerformanceTier;
  customTheme?: ThemeConfig;
  locale: Locale;
  debugMode: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  checkpointStrategy: 'every-message' | 'every-n' | 'manual';
  checkpointInterval?: number;
  apiKeys: Record<string, string>;
  apiEndpoints: Record<string, string>;
  /** 默认下载存储位置 */
  downloadStorage?: StorageLocation;
  /** 浏览器端存储后端 */
  browserStorageBackend?: BrowserStorageBackend;
  /** 存储配额与约束 */
  storageQuota?: StorageQuota;
}

// === 脚本 ===
export interface Script {
  id: string;
  name: string;
  description: string;
  code: string;
  language: 'javascript' | 'typescript' | 'python';
  createdAt: number;
  updatedAt: number;
}

export interface ScriptExecutionResult {
  success: boolean;
  output?: any;
  error?: string;
  logs: string[];
  duration: number;
}

export interface ScriptToolCall {
  tool: string;
  params: Record<string, any>;
}

export interface ThemeConfig {
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
}

// === 下载管理 ===
export type DownloadResourceType =
  | 'conversation'
  | 'code'
  | 'file'
  | 'skill'
  | 'mcp'
  | 'script'
  | 'source';

export type StorageLocation = 'browser' | 'server';
export type BrowserStorageBackend = 'indexeddb' | 'fsa' | 'localstorage';

export interface StorageQuota {
  /** 浏览器端可用最大字节数（默认 500MB） */
  browserMaxBytes?: number;
  /** 服务端可用最大字节数（默认 2GB） */
  serverMaxBytes?: number;
  /** 是否在超出配额时拒绝下载 */
  enforce: boolean;
  /** 服务端下载根目录 */
  serverPath?: string;
}

export type DownloadTaskStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

export interface DownloadItem {
  id: string;
  type: DownloadResourceType;
  name?: string;
  /** 预估字节数，用于前端配额预检 */
  size?: number;
  meta?: Record<string, any>;
}

export interface DownloadTask {
  id: string;
  status: DownloadTaskStatus;
  items: DownloadItem[];
  storage: StorageLocation;
  /** 总进度 0-100 */
  progress: number;
  downloadedBytes: number;
  totalBytes: number;
  error?: string;
  /** 服务端下载目录 */
  serverPath?: string;
  /** 任务级配额覆盖 */
  storageQuota?: StorageQuota;
  /** 已完成子项 ID，用于断点续传 */
  completedItemIds?: string[];
  /** 最终文件名（浏览器下载触发时使用） */
  fileName?: string;
  createdAt: number;
  updatedAt: number;
}

export interface DownloadOptions {
  storage: StorageLocation;
  serverPath?: string;
  quota?: StorageQuota;
}

export interface ServerDownloadRequest {
  items: DownloadItem[];
  serverPath: string;
  quota?: StorageQuota;
}

export interface ServerDownloadStatusResponse {
  task: DownloadTask;
}

// === API 请求/响应 ===
export interface CreateAgentRequest {
  name: string;
  description?: string;
  systemPrompt?: string;
  model?: string;
}

export interface CreateConversationRequest {
  agentId: string;
  title?: string;
}

export interface SendMessageRequest {
  conversationId: string;
  content: string;
}

export interface CreatePromptRequest {
  name: string;
  category?: string;
  content: string;
  variables?: PromptVariable[];
}

export interface CreateScriptRequest {
  name: string;
  description?: string;
  code: string;
  language?: 'javascript' | 'typescript' | 'python';
}

export interface UpdateScriptRequest {
  name?: string;
  description?: string;
  code?: string;
  language?: 'javascript' | 'typescript' | 'python';
}

export interface ExecuteScriptRequest {
  args?: Record<string, any>;
  context?: Record<string, any>;
}

export interface ScriptTool {
  name: string;
  description: string;
  parameters: any;
}

// === 自动操作序列 ===
export type OperationType =
  | 'ui:click'
  | 'ui:navigate'
  | 'ui:theme'
  | 'ui:input'
  | 'ui:scroll'
  | 'ui:highlight'
  | 'chat:send'
  | 'chat:clear'
  | 'animation:play'
  | 'notification:show'
  | 'custom:trigger';

export interface Operation {
  id: string;
  type: OperationType;
  params: Record<string, any>;
  timeout?: number;
  retryPolicy?: {
    maxRetries: number;
    backoffMs: number;
  };
  dependsOn?: string[];
}

export interface OperationSequence {
  id: string;
  version: string;
  source: 'agent' | 'system';
  operations: Operation[];
  metadata: {
    createdAt: number;
    ttl?: number;
    priority: 'low' | 'normal' | 'high';
    requiresConfirmation?: boolean;
  };
}

export interface OperationResult {
  operationId: string;
  sequenceId: string;
  status: 'success' | 'failed' | 'skipped' | 'timeout';
  duration: number;
  error?: string;
  result?: any;
}
