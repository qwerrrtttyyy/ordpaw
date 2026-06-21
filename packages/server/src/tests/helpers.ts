import initSqlJs, { Database } from 'sql.js';

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    system_prompt TEXT DEFAULT '',
    provider_id TEXT DEFAULT 'openai',
    model TEXT DEFAULT 'gpt-4',
    skills_json TEXT DEFAULT '[]',
    mcp_json TEXT DEFAULT '[]',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS providers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    base_url TEXT,
    api_key_name TEXT,
    api_key TEXT,
    models_json TEXT NOT NULL,
    enabled INTEGER DEFAULT 1,
    is_built_in INTEGER DEFAULT 0,
    config_json TEXT DEFAULT '{}',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS test_suites (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS test_cases (
    id TEXT PRIMARY KEY,
    suite_id TEXT NOT NULL REFERENCES test_suites(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    input TEXT NOT NULL,
    expected_output TEXT,
    expected_contains_json TEXT DEFAULT '[]',
    variables_json TEXT DEFAULT '{}',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS test_runs (
    id TEXT PRIMARY KEY,
    suite_id TEXT NOT NULL REFERENCES test_suites(id) ON DELETE CASCADE,
    agent_id TEXT NOT NULL,
    results_json TEXT NOT NULL,
    passed INTEGER DEFAULT 0,
    failed INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS components (
    id TEXT PRIMARY KEY,
    plugin_name TEXT NOT NULL,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    src TEXT NOT NULL,
    slot TEXT,
    metadata_json TEXT DEFAULT '{}',
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT '新会话',
    variables_json TEXT DEFAULT '{}',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK(role IN ('user','assistant','system','tool')),
    content TEXT NOT NULL,
    metadata_json TEXT DEFAULT '{}',
    "timestamp" INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS checkpoints (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    message_id TEXT NOT NULL REFERENCES messages(id),
    state_json TEXT NOT NULL,
    label TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS plugins (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    version TEXT NOT NULL,
    description TEXT DEFAULT '',
    manifest_json TEXT NOT NULL,
    config_json TEXT DEFAULT '{}',
    state TEXT DEFAULT 'loaded',
    enabled INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS prompts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT DEFAULT '通用',
    content TEXT NOT NULL,
    variables_json TEXT DEFAULT '[]',
    version INTEGER DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS scripts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT DEFAULT '',
    code TEXT NOT NULL,
    language TEXT DEFAULT 'javascript',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS mcp_servers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    transport TEXT NOT NULL CHECK(transport IN ('stdio','sse','websocket')),
    command TEXT,
    url TEXT,
    env_json TEXT DEFAULT '{}',
    enabled INTEGER DEFAULT 1,
    connected INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS installed_skills (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT DEFAULT '',
    parameters_json TEXT DEFAULT '{}',
    code TEXT NOT NULL,
    source TEXT DEFAULT 'user' CHECK(source IN ('builtin','user')),
    enabled INTEGER DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS plugin_storage (
    plugin_name TEXT NOT NULL,
    key TEXT NOT NULL,
    value_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (plugin_name, key)
  );

  CREATE INDEX IF NOT EXISTS idx_plugin_storage_plugin ON plugin_storage(plugin_name);
  CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id);
  CREATE INDEX IF NOT EXISTS idx_checkpoints_conv ON checkpoints(conversation_id);
  CREATE INDEX IF NOT EXISTS idx_conversations_agent ON conversations(agent_id);
`;

export async function createMemoryDb(): Promise<Database> {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.exec(SCHEMA);
  return db;
}
