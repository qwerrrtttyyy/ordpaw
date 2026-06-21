# OrdPaw — A powerful AI/Agent client

OrdPaw is a full-stack AI Agent development and debugging platform with a focus on developer UX, plugin extensibility, and protocol interoperability.

**Version: v0.0.1** (reset)

## Architecture

```
ordpaw/
├── packages/
│   ├── client/        # Frontend SPA (TypeScript + Vite, no framework)
│   ├── server/        # Backend (Node.js + Express + WebSocket)
│   └── shared/        # Shared TypeScript types
├── data/              # SQLite database + scripts (auto-created)
├── plugins/           # User plugin directory
└── pnpm-workspace.yaml
```

## Features

- **Agent Workbench** — Build, configure, and manage AI agents
- **Real LLM Calls** — OpenAI-compatible and Anthropic Messages API support
- **Conversation Management** — Session history, checkpoints, time-travel rollback
- **Plugin System** — JavaScript plugins with event-driven hooks + frontend contributions
- **Skills Engine** — Pluggable skill definitions with JSON Schema
- **MCP Client** — Model Context Protocol (stdio/SSE/WebSocket)
- **ScriptMCP** — User JS scripts executed in an isolated `node:vm` sandbox
- **Debug Center** — Real-time logs, event tracing, performance analysis
- **Prompt Library** — Template management with variable interpolation
- **Multi-theme** — 8 themes (Deep Space, Aurora, Cyber, etc.) + Classic / Modern UI modes
- **Download Manager** — Browser (IndexedDB/FSA/localStorage) + server-side downloads with quota

## What's Fixed in v0.0.1

This release rebuilds the codebase from the legacy `agent-studio` snapshot and addresses every issue identified in the deep-read audit:

### Backend
1. **Real LLM calls** — `agentRuntime.processMessage` now actually calls the provider (OpenAI-compatible `/v1/chat/completions` or Anthropic `/v1/messages`). Falls back to a diagnostic message when the provider or API key is missing.
2. **Sandboxed script execution** — `scriptMcp` switched from `new Function + eval` (trivially escapable to `process.exit()`) to `node:vm.createContext` with an allow-list of safe globals and a 5-second wall-clock timeout. Verified: `typeof process === 'undefined'` inside user scripts.
3. **WebSocket listener leak fixed** — `ws/handler.ts` now properly calls `eventBus.off(...)` on `ws.close` instead of relying on `readyState` short-circuits.
4. **CJK-friendly streaming** — the chat-stream chunker now respects CJK characters (one char per chunk) instead of splitting on ASCII spaces only.
5. **Checkpoint rollback repaired** — uses snapshot restoration (delete all + re-insert from `state_json`) instead of fragile timestamp-`>` deletion that lost same-millisecond messages; also deletes future checkpoints after a rollback.
6. **API key obfuscation** — `providers.api_key` no longer stores plaintext. XOR+base64 obfuscation keyed by `ORDPAW_DB_SECRET` env var; responses strip the key and return only `hasApiKey: boolean`.
7. **DB filename** — `agent-studio.db` (legacy rename artifact) → `ordpaw.db`. Auto-migrates the legacy file on first run.
8. **Shared DB helpers** — `safeJsonParse`, `rowToObject`, `queryAll`, `queryOne`, `safeCount` extracted to `db/utils.ts`, removing 8 copies of the same code.
9. **Cache key namespace fix** — `componentServer` no longer pollutes `providerModelsCache` key space (uses `__components__:<plugin>` prefix).
10. **Export filename** — `agent-studio-export-*.json` → `ordpaw-export-*.json`.

### Frontend
1. **Unified fetch wrapper** — `api.ts` now uses a single `request()` helper that checks `res.ok`, parses JSON safely (tolerates empty bodies), and throws typed errors with status code and server-provided message. No more silent 4xx/5xx responses being rendered as fake data.
2. **Plugin registry** — new `plugin-registry.ts` exposes `window.OrdPaw` (registered by `App.init`) with `registerActionHandler`, `emit`, `on`, `toast`, `getSettings`. Plugins can finally extend the SPA without monkey-patching internals.
3. **Live plugin reload** — `PluginsView` now calls `reloadPluginComponents()` after install/uninstall, so newly-installed plugin CSS/scripts are injected without a page refresh.
4. **Vite dev-proxy friendly WebSocket** — `App.initWebSocket` honors the dev server port instead of hard-coding `:3000`, so the proxy actually works.
5. **Shared utilities** — `utils.ts` provides `escapeHtml`, `formatRelativeTime`, `showToast`, `createModal`, deduplicating 5+ copies across views.
6. **i18n consistency** — `ConversationsView` and `PluginsView` now use `t()` for all strings; new locale-aware `formatRelativeTime` replaces hardcoded Chinese relative time.
7. **`BottomNav.setCounts` is no longer a stub** — shows a small badge with the agent / conversation / test-suite count next to the relevant tab.
8. **`styles-modern.css` cleanup** — removed 70+ duplicated v3.0 revision blocks (file went from 11,220 lines to ~1,748 lines, an 84% reduction) while preserving the v2.5 base + a consolidated v3.0 palette overlay.

## Quick Start

```bash
# Install dependencies
pnpm install

# Start both server and client in dev mode
pnpm dev

# Or start individually
pnpm dev:server
pnpm dev:client
```

The server listens on `http://localhost:3000`, the Vite dev server on `http://localhost:5173` (proxies `/api` and `/ws` to the backend).

### Configuring an LLM provider

1. Open **Settings → API Keys** and add a key for `openai` (or `anthropic`).
2. Or: edit the provider directly under **Providers** and paste your API key — it will be obfuscated on save.
3. Create an agent that uses that provider + model.
4. Start a conversation and chat — real LLM responses will stream back over WebSocket.

For OpenAI-compatible endpoints (Ollama, vLLM, etc.), set the provider's `baseUrl` to your endpoint.

## Development

```bash
# Type-check client
cd packages/client && npx tsc --noEmit

# Type-check server
cd packages/server && npx tsc --noEmit
```

## Project Layout

```
packages/server/src/
├── index.ts              # Express + WS bootstrap
├── api/index.ts          # REST routes (/api/*)
├── ws/handler.ts         # WebSocket handler
├── middleware.ts         # asyncHandler, ApiError, validateBody
├── db/
│   ├── index.ts          # sql.js init, debounced save
│   └── utils.ts          # safeJsonParse / rowToObject / queryAll / queryOne / safeCount
├── plugin/loader.ts      # Filesystem plugin discovery
└── core/
    ├── agent-runtime.ts  # processMessage: real LLM calls
    ├── session.ts        # Conversations + messages
    ├── checkpoint.ts     # Time-travel snapshots + rollback
    ├── skill-runner.ts   # In-memory skill registry
    ├── script-mcp.ts     # ScriptMCP + vm sandbox
    ├── mcp-client.ts     # External MCP client
    ├── provider-service.ts # Provider CRUD + key obfuscation
    ├── api-key-crypto.ts # XOR+base64 obfuscation
    ├── event-bus.ts      # Async pub/sub with '*' wildcard
    ├── debug-logger.ts   # Ring-buffered logs/events
    ├── test-suite.ts     # Test suites + run history
    ├── sequence-generator.ts # RBAC + rate-limit for UI ops
    ├── download-service.ts # /api/download/* routes
    ├── component-server.ts # Plugin frontend component registry
    └── cache.ts          # TTL caches

packages/client/src/
├── main.ts               # Entry
├── app.ts                # Top-level orchestrator
├── router.ts             # Hash router
├── store.ts              # Settings cache
├── api.ts                # Unified fetch wrapper
├── utils.ts              # escapeHtml, formatRelativeTime, createModal, showToast
├── component-loader.ts   # Plugin CSS/script injector (reloadable)
├── plugin-registry.ts    # window.OrdPaw public API
├── animation-manager.ts  # RAF loop + performance tiers
├── download-manager.ts   # Browser download queue
├── sequence-executor.ts  # WS-driven UI automation
├── i18n/                 # zh-CN, en-US dictionaries
├── components/           # sidebar, bottom-nav, mobile-drawer, markdown
├── views/                # dashboard, agents, conversations, providers,
│                         #   plugins, prompts, scripts, settings, tests,
│                         #   debug, download-manager
└── styles.css + styles-modern.css
```
