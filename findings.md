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
- 28 unit tests added to server package (vitest)
- Logger wrapper introduced; core modules (loader, MCP client, skill runner) migrated away from direct `console.*`
- Plugin loader TODOs removed; MCP client TODO replaced with real transport layer
- Export filename uses `ordpaw-export-${Date.now()}.json`

### Potential Bugs
- `download-service.ts` synchronous file operations on potentially large directories
- `node:vm` script/skill sandbox is best-effort and can be escaped by determined code

---

# Final Analysis Report: Ordpaw v0.0.2

## Executive Summary
OrdPaw is a full-stack AI Agent development and debugging platform. The codebase is well-organized as a pnpm monorepo using pnpm workspaces and Turborepo. After the latest round of fixes, the project **builds end-to-end**, passes type checks, and has a growing unit-test suite (28 tests). Security posture has been hardened for crypto/CORS/SQL injection, but remains weak for multi-user deployment due to missing auth and the best-effort `node:vm` sandbox. Performance is adequate for personal use but will degrade with large conversation histories because of full-history LLM calls and unbounded list endpoints.

## Build & Test Status
| Check | Command | Result |
|-------|---------|--------|
| Install | `pnpm install` | ✓ Success |
| Type check | `pnpm turbo run typecheck` | ✓ Pass |
| Tests | `pnpm turbo run test` | ✓ 28 tests pass |
| Build | `pnpm turbo run build` | ✓ Pass |

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
- **Tests** — 28 server unit tests added (vitest).
- **Console logging** — Logger wrapper introduced and integrated into core modules.
- **Type safety** — Server build passes; shared plugin API types added.
- **Mixed languages** — UI strings are mostly Chinese; consistent i18n usage is good.
- **TODOs** — Plugin loader TODOs resolved; MCP client TODO replaced with real transport layer.

## Stability / Runtime Risks
1. `download-service.ts` uses synchronous file operations on potentially large directories.
2. `node:vm` script/skill sandbox is best-effort and can be escaped by determined code.

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

## Feature Completion & Optimization (2026-06-21)
| # | Area | Change | File(s) |
|---|------|--------|---------|
| 10 | Plugin API | Added `PluginApi`, `PluginDb`, `PluginLogger`, `Plugin` types; manifest/module/skill validation; `getSession` + per-plugin storage wired into loader | `packages/shared/src/types.ts`, `packages/server/src/plugin/validation.ts`, `packages/server/src/plugin/loader.ts`, `packages/server/src/core/plugin-storage.ts` |
| 11 | MCP lifecycle | Implemented real transport layer for stdio/sse/websocket with timeouts, error handling, disconnect cleanup | `packages/server/src/core/mcp-transport.ts`, `packages/server/src/core/mcp-client.ts` |
| 11 | Skill hot-reload | Added `SkillRunner.reloadSkill(id)` and local skill validation | `packages/server/src/core/skill-runner.ts` |
| 11 | Script execution | Separated compile/runtime errors, improved timeout messages, awaited returned Promises with timeout | `packages/server/src/core/script-mcp.ts` |
| 12 | Graceful shutdown | Removed `process.exit` from db autosave handlers; rewrote `setupGracefulShutdown` to await http/wss close, flush DB, then exit; `uncaughtException` now triggers graceful shutdown | `packages/server/src/index.ts`, `packages/server/src/db/index.ts` |
| 12 | WS streaming | Added `batchChunks` and reduced pacing to 8ms to avoid long tight loops | `packages/server/src/ws/handler.ts` |
| 13 | Tests | Added vitest; 28 tests covering db utils, event bus, plugin validation, skill runner, logger | `packages/server/package.json`, `turbo.json`, `packages/server/src/**/*.test.ts` |
| 14 | Logger | Added `logger.ts` wrapper with `ORDPAW_LOG_LEVEL` support; integrated into loader, MCP client, skill runner | `packages/server/src/core/logger.ts` |

## Build & Test Status (after optimization)
| Check | Command | Result |
|-------|---------|--------|
| Type check | `pnpm turbo run typecheck` | ✓ Pass |
| Tests | `pnpm turbo run test` | ✓ 28 tests pass |
| Build | `pnpm turbo run build` | ✓ Pass |

## Remaining Work (not addressed)
- **Authentication/authorization** — still no user/session gate.
- **Script sandbox hardening** — `node:vm` remains best-effort; true isolation needs worker process refactor.
- **Performance limits** — conversation history cap, pagination, export streaming still not implemented.

## Prioritized Action Plan
1. ~~**Fix server build**~~ ✓
2. ~~**Fix client build**~~ ✓
3. ~~**Remove default crypto secret**~~ ✓
4. ~~**Harden CORS & dynamic SQL**~~ ✓
5. ~~**Add core tests**~~ ✓
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
