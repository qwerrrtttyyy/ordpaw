# Task Plan: Ordpaw Project Inspection & Analysis

## Goal
Perform a comprehensive inspection and analysis of the entire Ordpaw codebase, covering structure, architecture, code quality, performance, bugs, and deliver actionable findings.

## Current Phase
Complete

## Phases

### Phase 1: Requirements & Discovery
- [x] Identify tech stack and project layout
- [x] Read package.json, README, and workspace config
- [x] Map packages (client, server, shared) and key modules
- [x] Document findings in findings.md
- **Status:** complete

### Phase 2: Static Code Analysis & Search
- [x] Use file-search skill to explore patterns and key files
- [x] Identify entry points, APIs, routing, state management
- [x] Find security-sensitive code (crypto, auth, API keys, downloads)
- [x] Spot potential bugs, anti-patterns, and tech-debt hotspots
- **Status:** complete

### Phase 3: Code Optimization & Architecture Review
- [x] Use code-optimizer skill to scan for performance/architecture issues
- [x] Review N+1 queries, caching, async patterns, indexes
- [x] Analyze component lifecycle, re-renders, memory leaks in client
- [x] Summarize optimization opportunities in findings.md
- **Status:** complete

### Phase 4: Bug/Debug & Testing Review
- [x] Use systematic-debugging skill to investigate suspicious areas
- [x] Check test coverage and test suite health
- [x] Identify runtime errors, race conditions, unhandled promises
- [x] Use webapp-testing skill if a runnable app exists (deferred due to build errors)
- **Status:** complete

### Phase 5: Final Report & Delivery
- [x] Consolidate all findings into a structured report
- [x] Prioritize issues by severity/impact
- [x] Provide actionable recommendations
- [x] Deliver to user
- **Status:** complete

### Phase 6: Build & Runtime Bug Fixes
- [x] Fix server TypeScript errors (missing types, implicit any, registerSkill)
- [x] Fix client TypeScript errors (pluginRegistry, chat view initialization)
- [x] Fix export filename regression
- [x] Fix event-bus memory leak and other runtime defects
- [x] Run type checks and full build to verify
- **Status:** complete

### Phase 7: Security & Architecture Hardening
- [x] Remove hardcoded default crypto secret
- [x] Restrict CORS to configurable origins
- [x] Add allowlist validation for dynamic SQL table/column names
- [x] Add allowlist validation for dynamic SET clauses
- **Status:** complete

### Phase 8: Introduce Turborepo
- [x] Add `turbo.json` with tasks for typecheck, build, dev, start
- [x] Update root `package.json` scripts to use `turbo`
- [x] Configure task dependencies (`build` depends on `^build` and `typecheck`)
- [x] Verify `turbo run build` succeeds
- **Status:** complete

### Phase 9: Verification & Handoff
- [x] Run `turbo run typecheck` and `turbo run build`
- [x] Update progress.md and findings.md
- [x] Deliver final summary to user
- **Status:** complete

## Key Questions — Answered
1. **What is Ordpaw?** Full-stack AI Agent development/debugging platform.
2. **Architecture?** pnpm + Turborepo monorepo: Vite vanilla TS SPA client + Express/WebSocket server + sql.js SQLite.
3. **Critical concerns?** Auth still missing; crypto/CORS/SQL injection vectors hardened; weak script sandbox remains a known limitation.
4. **Obvious bugs?** All identified build/runtime bugs fixed; export filename regression fixed.
5. **Build/test status?** `turbo run typecheck` and `turbo run build` pass; no tests exist yet.

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Use planning-with-files to track multi-phase analysis | Complex task spanning many files and tool calls |
| Use file-search, code-optimizer, systematic-debugging, webapp-testing skills | User explicitly requested |
| Add `packageManager` and Turborepo | Required by turbo 2.x; enables caching and task orchestration |
| Keep script sandbox (`node:vm`) unchanged | Full isolation would require worker process refactor; out of scope for this round |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| Server build fails (8 TS errors) | 1 | Added sql.js types, typed callbacks, implemented registerSkill |
| Client build fails (3 TS errors) | 1 | Implemented PluginRegistry, fixed ChatView assignment |
| Turbo missing `packageManager` | 1 | Added `packageManager`: `pnpm@10.28.1` |
| Turbo 2.x `pipeline` → `tasks` | 1 | Renamed key in turbo.json |

## Notes
- Update phase status as you progress: pending → in_progress → complete
- Re-read this plan before major decisions
- Log ALL errors - they help avoid repetition
- Write web/search results to findings.md only, never to task_plan.md
