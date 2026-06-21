# Findings & Decisions: Ordpaw Project

## Requirements
- Inspect and analyze the entire Ordpaw codebase.
- Cover project structure, architecture, code quality, performance, security, and bugs.
- Deliver a consolidated, prioritized report with actionable recommendations.

## Research Findings

### Project Structure
- Monorepo layout using pnpm workspaces:
  - `packages/client` — frontend SPA (Vite + TypeScript, no framework)
  - `packages/server` — backend (Node.js + Express + WebSocket)
  - `packages/shared` — shared TypeScript types
- Key files:
  - Root: `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `README.md`
  - Client: `index.html`, `package.json`, `vite.config.ts`, `tsconfig.json`, `src/main.ts`, `src/app.ts`, `src/api.ts`
  - Server: `src/index.ts`, `src/middleware.ts`, `src/api/index.ts`, `src/ws/handler.ts`, `src/db/index.ts`

### Tech Stack
- **Frontend**: Vanilla TypeScript, Vite 5.4, custom hash router, custom component system, CSS themes
- **Backend**: Node 18+, Express 4.18, WebSocket (`ws`), sql.js (SQLite in WASM), CORS
- **Data**: SQLite via sql.js, in-memory DB with periodic flush to disk
- **Build**: pnpm workspaces, TypeScript 5.5, tsx for dev

### Architecture Observations
- Single-file SQLite DB persisted to `data/ordpaw.db` with 500ms debounced saves and atomic rename
- Express REST API at `/api/*`, WebSocket on same HTTP server
- Event bus for internal pub/sub; debug logger subscribes to all events
- Plugin system with filesystem discovery and frontend component contributions
- ScriptMCP executes user JS in `node:vm` sandbox with 5s timeout
- API keys stored XOR-obfuscated, default secret fallback present

### Security Findings
- `process.env.ORDPAW_DB_SECRET` falls back to hardcoded default secret (`api-key-crypto.ts:19`)
- No authentication/authorization on any API routes
- Import API builds dynamic SQL table/column names without allowlist (`api/index.ts:734`)
- Several update helpers build dynamic `SET` clauses from user-controlled field names (`agent-runtime.ts:317`, `provider-service.ts:157`, `test-suite.ts:76/138`)
- `api-key-crypto.ts` is obfuscation, not encryption (acknowledged in comments)
- `script-mcp.ts` sandbox uses `node:vm` but does not disable `Promise` constructor escape or restrict prototype pollution
- CORS enabled globally without origin restriction

### Performance / Architecture Findings
- `SELECT *` used extensively across the codebase
- No pagination on list endpoints (agents, conversations, messages, prompts, etc.)
- Export endpoint loads entire tables into memory
- `agentRuntime.processMessage` fetches full conversation history on every message
- `statsCache` TTL cache is used but no cache invalidation besides manual delete
- `providerModelsCache` uses `Cache<any[]>` with 60s TTL
- In-memory SQLite means no concurrent process access and DB size limited by RAM

### Code Quality Findings
- No unit/integration tests found in repo
- 98+ `console.log/warn/error/debug` calls across 20 files
- TODOs in `plugin/loader.ts:56/66` and `mcp-client.ts:91`
- Export filename still uses `agent-studio-export-${Date.now()}.json` at `api/index.ts:688` despite README claiming rename to `ordpaw-export`
- `setupGracefulShutdown` has a 1.5s forced `process.exit` after WSS close that may race with HTTP close

### Potential Bugs
- `api/index.ts:688` export filename regression (`agent-studio-export`)
- `event-bus.ts` `off()` does not clean up empty listener Sets, causing memory growth
- `download-service.ts` synchronous file operations on potentially large directories
- `ws/handler.ts` streaming loop uses `await new Promise(resolve => setTimeout(resolve, 30))` which blocks message processing
- `index.ts` `setupGracefulShutdown` registers `uncaughtException` handler that prevents process exit

---

# Final Analysis Report: Ordpaw v0.0.2

## Executive Summary
OrdPaw is a full-stack AI Agent development and debugging platform. The codebase is well-organized as a pnpm monorepo and has clearly benefited from a recent cleanup (v0.0.1 audit fixes). However, it currently **does not build end-to-end**: the client compiles, but the server TypeScript build fails with 8 errors. Security posture is weak for a multi-user deployment (no auth, default crypto secret, CORS wide open, script sandboxing is best-effort). Performance is adequate for personal use but will degrade with large conversation histories because of full-history LLM calls and unbounded list endpoints.

## Build & Test Status
| Check | Command | Result |
|-------|---------|--------|
| Install | `pnpm install` | ✓ Success |
| Client type check | `cd packages/client && npx tsc --noEmit` | ✗ 3 errors |
| Server type check | `cd packages/server && npx tsc --noEmit` | ✗ 8 errors |
| Client build | `vite build` | ✓ Success |
| Server build | `tsc` | ✗ Failed (8 TS errors) |
| Tests | — | ✗ No tests found |

### Type Errors Blocking Server Build
1. `plugin/loader.ts:52` — calls `skillRunner.registerSkill(skill)`, but `SkillRunner` has no such method.
2. `db/index.ts:1` — missing `@types/sql.js` declaration.
3. `api/index.ts` (5 locations) — implicit `any` on `row` callback parameters.
4. `mcp-client.ts:132` — implicit `any` on `row` callback parameter.

### Client Type Errors
1. `plugin-registry.ts:2-3` — references undefined `pluginRegistry` variable.
2. `views/chat.ts:13` — `conversation` property not definitely assigned in constructor.

## Security Assessment
| Severity | Issue | Location | Recommendation |
|----------|-------|----------|----------------|
| 🔴 High | Default hardcoded `ORDPAW_DB_SECRET` | `api-key-crypto.ts:19` | Refuse to start without secret; no fallback |
| 🔴 High | No authentication/authorization | all routes | Add session/auth middleware before any deployment |
| 🔴 High | `node:vm` sandbox can be escaped via `Promise` / prototype chains | `script-mcp.ts`, `skill-runner.ts` | Use `vm.runInNewContext` with frozen primordials or dedicated worker process |
| 🟡 Medium | CORS allows all origins | `index.ts:45` | Restrict to known origins |
| 🟡 Medium | Dynamic SQL table/column names in import | `api/index.ts:724-734` | Use strict allowlist of tables/columns |
| 🟡 Medium | Dynamic `SET` clauses from request keys | `agent-runtime.ts:317`, `provider-service.ts:157`, `test-suite.ts:76/138` | Validate field names against allowlist |
| 🟡 Medium | API keys deobfuscated into memory | `provider-service.ts:209` | Document threat model; consider OS keychain for production |
| 🟢 Low | Obfuscation, not encryption, acknowledged | `api-key-crypto.ts` comments | Accept for current personal-use scope |

## Performance & Architecture Assessment
| Severity | Issue | Location | Recommendation |
|----------|-------|----------|----------------|
| 🟡 High | Full conversation history loaded on every message | `agent-runtime.ts:158` | Cap history to last N messages or use summarization |
| 🟡 High | No pagination on list endpoints | `api/index.ts` (agents, conversations, prompts, etc.) | Add `limit`/`offset` or cursor pagination |
| 🟡 High | Export loads entire tables into memory | `api/index.ts:641-690` | Stream JSON or paginate export |
| 🟡 Medium | `SELECT *` everywhere | server core modules | Select only needed columns |
| 🟡 Medium | In-memory SQLite limits scalability | `db/index.ts` | Document single-process constraint; consider file-backed SQLite |
| 🟢 Low | TTL caches have no background eviction | `cache.ts` | Current behavior is fine; optional periodic cleanup |

## Code Quality & Maintainability
- **No tests** — no unit, integration, or e2e tests exist.
- **Console logging** — 98+ direct `console.*` calls; should use structured logger.
- **Type safety** — `any` used heavily; server build fails because of it.
- **Mixed languages** — UI strings are mostly Chinese; consistent i18n usage is good.
- **TODOs** remain in plugin loader and MCP client.
- **Export filename regression** — README claims `ordpaw-export-*.json`, code still emits `agent-studio-export-*.json`.

## Stability / Runtime Risks
1. `setupGracefulShutdown` swallows `uncaughtException` and forces a second `process.exit`, which can race with `httpServer.close`.
2. `eventBus.off` leaves empty `Set` objects in the listeners map.
3. WebSocket streaming blocks the event loop for the duration of the fake throttle loop (30 ms × chunk count).
4. Plugin loader calls a non-existent `skillRunner.registerSkill`, so any plugin registering a skill will crash at runtime.
5. Client plugin registry references an undefined `pluginRegistry`, breaking `window.OrdPaw` initialization.

## Fixes Applied (2026-06-21)
| # | Issue | Fix | File(s) |
|---|-------|-----|---------|
| 1 | Server build 8 TS errors | Added sql.js declaration; typed `SqlValue[]` callbacks; implemented `SkillRunner.registerSkill` | `types/sql.js.d.ts`, `api/index.ts`, `mcp-client.ts`, `skill-runner.ts` |
| 2 | Client build 3 TS errors | Implemented `PluginRegistry` class; fixed `ChatView.conversation` assignment | `plugin-registry.ts`, `views/chat.ts` |
| 3 | Export filename regression | Renamed `agent-studio-export` → `ordpaw-export` | `api/index.ts` |
| 4 | Event-bus memory leak | `off()` now deletes empty listener sets | `event-bus.ts` |
| 5 | Hardcoded crypto secret | Removed default fallback; throws if `ORDPAW_DB_SECRET` unset | `api-key-crypto.ts` |
| 6 | Wide-open CORS | Added configurable `ORDPAW_CORS_ORIGIN` allowlist | `index.ts` |
| 7 | Dynamic SQL in import | Added table/column allowlist validation | `api/index.ts` |
| 8 | Dynamic SET clauses | Added `buildUpdateSet` helper with allowlist; refactored 3 managers | `db/utils.ts`, `agent-runtime.ts`, `provider-service.ts`, `test-suite.ts` |
| 9 | Turborepo migration | Installed turbo, added `turbo.json`, `packageManager`, `typecheck` scripts, `.gitignore` | `package.json`, `turbo.json`, `packages/*/package.json`, `.gitignore` |

## Remaining Work (not addressed)
- **Authentication/authorization** — still no user/session gate.
- **Script sandbox hardening** — `node:vm` remains best-effort; true isolation needs worker process refactor.
- **Performance limits** — conversation history cap, pagination, export streaming still not implemented.
- **Tests** — no unit/integration tests yet.
- **Graceful shutdown race** — `uncaughtException` handler still prevents crash exit.

## Prioritized Action Plan
1. ~~**Fix server build**~~ ✓
2. ~~**Fix client build**~~ ✓
3. ~~**Remove default crypto secret**~~ ✓
4. ~~**Harden CORS & dynamic SQL**~~ ✓
5. **Add tests** — start with core services (session, checkpoint, provider-service) and API smoke tests.
6. **Add authentication** — even a simple token/session gate would raise the bar.
7. **Cap conversation history** — biggest user-facing latency win.
8. **Add pagination** — prevents accidental OOM on large datasets.
9. **Sandbox isolation** — move script/skill execution to worker process or VM2 alternative.

## Decisions Made During Analysis
| Decision | Rationale |
|----------|-----------|
| Use planning-with-files workflow | Task spans many files and tool calls |
| Invoke file-search, code-optimizer, systematic-debugging, webapp-testing skills | User explicitly requested; skills guided scan patterns and issue triage |
| Did not run webapp browser automation | Type errors prevent a clean build; UI-level testing would be premature before build/type issues are fixed |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| Server build fails with 8 TypeScript errors | Documented in report; fix recommendations provided |
| Client build has 3 TypeScript errors | Documented in report; fix recommendations provided |
| No tests exist in the repository | Documented as quality gap |

## Resources
- Project root: `/workspace`
- Client source: `/workspace/packages/client/src`
- Server source: `/workspace/packages/server/src`
- Shared source: `/workspace/packages/shared/src`

## Visual/Browser Findings
-

---
*Update this file after every 2 view/browser/search operations*
