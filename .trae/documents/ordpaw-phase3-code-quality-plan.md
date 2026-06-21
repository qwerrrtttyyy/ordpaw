# Phase 3 代码质量重构实施计划（子代理 B）

## Summary

完成 OrdPaw v0.0.3 Phase 3「代码质量重构」：

- 在 server 全量使用结构化日志 `pino`（已引入），在 client 引入轻量级 logger 封装替换 `console.*`。
- 统一错误体系：`ApiError` / `OrdPawApiError` 均继承 `OrdPawError`，复用 `OrdPawErrorCode`。
- 消除核心模块的显式 `any`，优先替换为具体类型或 `unknown` + 类型守卫。
- 处理 `TODO|FIXME|XXX` 注释（当前基线未命中，实施中如出现则按规则处理）。
- 运行 `pnpm -r typecheck` 与 `pnpm test` 验证，并更新 `task_plan.md` / `progress.md`。

## Current State Analysis

### 已完成的基线工作

- `packages/server/src/core/logger.ts` 已创建，使用 `pino` + `pino-pretty`。
- `packages/shared/src/errors.ts` 已创建，定义 `OrdPawError`、`OrdPawErrorCode`、`OrdPawErrorOptions`。
- `packages/server/src/middleware.ts` 已改造：`ApiError extends OrdPawError`，错误/请求日志使用 `logger`。
- `packages/server/src/index.ts`、`ws/handler.ts` 已改用 `logger`。
- `packages/server/src/db/utils.ts` 已消除 `any`，使用泛型 + `unknown`。
- `packages/server/src/core/agent-runtime.ts` 已部分改造（`AgentRow` 接口、`logger.error`），但仍残留 `any` 与 `console.error`。
- `pnpm -r typecheck` 与 `pnpm test` 在基线通过（66 个测试）。

### 剩余问题清单

#### 1. server 端未替换的 `console.*`

涉及文件（按出现频次排序）：

- `packages/server/src/core/agent-runtime.ts`（2 处）
- `packages/server/src/core/mcp-client.ts`（2 处）
- `packages/server/src/core/component-server.ts`（2 处）
- `packages/server/src/core/skill-runner.ts`（3 处）
- `packages/server/src/core/session.ts`（4 处）
- `packages/server/src/core/provider-service.ts`（4 处）
- `packages/server/src/core/checkpoint.ts`（3 处）
- `packages/server/src/core/test-suite.ts`（7 处）
- `packages/server/src/core/script-mcp.ts`（1 处有效 + 注释）
- `packages/server/src/core/download-service.ts`（2 处）

#### 2. client 端未替换的 `console.*`

约 30 处，集中在：

- `packages/client/src/app.ts`
- `packages/client/src/component-server.ts`
- `packages/client/src/component-loader.ts`
- `packages/client/src/sequence-executor.ts`
- `packages/client/src/plugin-registry.ts`
- `packages/client/src/download-manager.ts`
- `packages/client/src/views/component-tree.ts`

#### 3. 核心模块待消除的 `any`

重点文件（按任务要求）：

- `packages/client/src/api.ts`：19 处
- `packages/server/src/core/mcp-client.ts`：4 处
- `packages/server/src/core/component-server.ts`：1 处
- `packages/server/src/api/index.ts`：17 处
- `packages/shared/src/types.ts`：13 处（多为 `Record<string, any>`）

其他高价值文件：

- `packages/server/src/core/agent-runtime.ts`（2 处）
- `packages/server/src/core/session.ts`、`provider-service.ts`、`checkpoint.ts`、`test-suite.ts`、`script-mcp.ts`、`skill-runner.ts`、`download-service.ts`、`cache.ts`、`debug-logger.ts`

**不修改范围**：`packages/*/src/tests/**/*.test.ts` 及其辅助文件保持原样。

#### 4. 错误体系未统一

- `packages/client/src/api.ts` 仍定义独立的 `OrdPawApiError` 与 `ErrorCode`，未继承 `OrdPawError`。

## Proposed Changes

### 步骤 1：server 端日志全面替换

- 在 `packages/server/src/core/logger.ts` 导出 `logger`（已存在）。
- 将步骤 1.1 列出的所有 `console.*` 替换为对应 `logger.info/warn/error/debug`。
- 保持原有日志语义（如初始化成功信息用 `logger.info`，错误用 `logger.error`）。
- 对错误对象使用 `logger.error(err, '描述')` 或 `logger.error({ err }, '描述')` 以保持结构化。

### 步骤 2：client 端轻量 logger 封装

- 新建 `packages/client/src/logger.ts`。
- 实现基于 `console` 的分级封装，支持 `debug/info/warn/error`，日志级别可从 `localStorage` 或构建时环境变量读取，默认 `info`。
- 生产环境下 `debug` 可静默（与 server `pino` 行为对齐）。
- 将步骤 1.2 列出的 client `console.*` 替换为 `logger.info/warn/error/debug`。

### 步骤 3：统一错误类

- 修改 `packages/client/src/api.ts`：
  - 删除本地 `ErrorCode` 类型与 `OrdPawApiError` 类。
  - 从 `@ordpaw/shared/errors` 导入 `OrdPawError` 与 `OrdPawErrorCode`。
  - 新建 `OrdPawApiError extends OrdPawError`，将状态码映射到 `OrdPawErrorCode`。
  - 保持原有运行时行为（status/code/details/message）。

### 步骤 4：消除核心模块 `any`

#### 4.1 `packages/client/src/api.ts`

- `APICache` 内部 `Map` 改为 `Map<string, CacheEntry<unknown>>`。
- `request<T = unknown>` 默认泛型改为 `unknown`。
- `pendingRequests` 改为 `Map<string, Promise<unknown>>`。
- `sendMessage` / `getStats` / `getSkills` / `getProviderModels` / `exportData` / `exportConversation` / `importData` 返回类型使用具体类型或 `unknown`。
- `installPlugin` 参数使用 `InstallPluginRequest` 类型（需在 `shared/src/types.ts` 新增或复用现有类型）。
- `Record<string, any>` 改为 `Record<string, unknown>`。
- EventSource 回调参数 `e: any` 改为 `e: MessageEvent`。
- `getComponentTree` / `getComponentPlugins` 使用已有/新增接口类型。

#### 4.2 `packages/server/src/core/mcp-client.ts`

- 数据库行 `row: any[]` 改为 `row: unknown[]`（与 `db/utils.ts` 对齐）。
- `callTool` 参数/返回使用 `Record<string, unknown>` / `unknown`。
- `createTransport` 的 `(config as any).transport` 改为穷尽分支后的 `never` 断言。
- `safeJsonParse` 参数使用 `unknown` 并复用 `db/utils.ts` 的 `safeJsonParse`（如可能）。

#### 4.3 `packages/server/src/core/component-server.ts`

- `queryAll<any>` 改为 `queryAll<ComponentRow>`（新增局部 `ComponentRow` 接口）。
- `loadFromDatabase` 中 `rows.map(c => ...)` 使用明确类型推导。

#### 4.4 `packages/server/src/api/index.ts`

- `DEFAULT_SETTINGS: any` 改为 `Settings` 类型。
- `setupApiRoutes(app: any)` 改为 `setupApiRoutes(app: express.Application)`。
- `stripApiKey(provider: any)` 改为 `stripApiKey(provider: Provider)`。
- 路由中 `row: any[]` 改为 `row: unknown[]`。
- `validateBody<Record<string, any>>` / `{ manifest: any }` 改为具体类型。
- `settingsObj: any` 改为 `Partial<Settings>`。
- 导出/导入辅助函数中的 `any[]` / `Record<string, any>` 改为 `unknown[]` / `Record<string, unknown>`，必要时使用类型守卫。

#### 4.5 `packages/shared/src/types.ts`

- 将 `Record<string, any>` 逐步替换为 `Record<string, unknown>`，涉及：
  - `Message.metadata`
  - `TestCase.variables`
  - `ComponentContribution.metadata`
  - `PluginInstance.config`
  - `InstalledSkill.parameters`
  - `SkillDefinition.execute` 返回类型
  - `DebugLogEntry.metadata`
  - `ScriptToolCall.params`
  - `Operation.params`
  - `ExecuteScriptRequest`
  - `DownloadItem.meta`
- 新增必要类型：
  - `InstallPluginRequest`（用于 client `installPlugin`）。
  - `StatsResponse`（用于 `api.getStats`）。
  - `ComponentTreeResponse` / `ComponentPluginsResponse`（用于 `api.getComponentTree` / `getComponentPlugins`）。

#### 4.6 其他 server 核心模块

- `agent-runtime.ts`：`queryAll<any>` → `queryAll<AgentRow>`；`params: any[]` → `params: unknown[]`；剩余 `console.error` → `logger.error`。
- `session.ts`、`provider-service.ts`、`checkpoint.ts`、`test-suite.ts`、`script-mcp.ts`、`skill-runner.ts`、`download-service.ts`：将 `queryOne<any>` / `queryAll<any>` 替换为局部 `Row` 接口；将函数签名中的 `any` 替换为 `unknown` 或具体类型。
- `cache.ts`：`Cache<V = any>` 可保留默认泛型但推荐调用方指定类型；`statsCache`、`providerModelsCache`、`agentCache` 给出具体泛型参数。
- `debug-logger.ts`：`payload: any` → `unknown`。

### 步骤 5：处理 TODO/FIXME/XXX

- 使用 `Grep` 搜索 `packages/*/src/**/*.ts`。
- 若发现已实现则删除注释。
- 若未实现则记录到 `/workspace/findings.md`，不引入新功能。
- 基线搜索未命中，实施中动态处理。

### 步骤 6：验证

- 运行 `pnpm install`（确认依赖）。
- 运行 `pnpm -r typecheck`（0 错误）。
- 运行 `pnpm test`（全部通过，不得修改测试文件）。
- 运行 `pnpm build`（可选，确认构建产物正常）。

### 步骤 7：更新项目跟踪文件

- `/workspace/task_plan.md`：将 Phase 3 标记为 completed。
- `/workspace/progress.md`：追加 Phase 3 完成记录，包括消除的 `any` 数量、替换的 console 数量、剩余 TODO 列表。
- `/workspace/findings.md`：如步骤 5 发现未实现 TODO，追加记录。

## Assumptions & Decisions

1. **向后兼容**：不改变函数签名与运行时行为；仅调整类型与日志实现。
2. **Client logger**：由于 client 运行在浏览器，不使用 `pino`，而是基于 `console` 的轻量封装，保持分级和静默能力。
3. **错误码映射**：client 的 `OrdPawApiError` 继承 `OrdPawError`，并将 HTTP 状态映射到 `OrdPawErrorCode`（如 400 → `BAD_REQUEST`），保留 `status` 字段。
4. **any 替换策略**：
   - 数据库行/JSON 数据：使用局部 `Row` 接口 + `safeJsonParse<T>`。
   - 未知外部输入：使用 `unknown` + 类型守卫。
   - 通用字典：使用 `Record<string, unknown>`。
   - 测试文件：不修改。
5. **TODO 处理**：不借本次重构引入新功能；未实现项仅记录到 `findings.md`。
6. **版本号**：保持 v0.0.3，不升级。

## Verification Steps

| 检查项       | 命令                                                                           | 通过标准                                    |
| ------------ | ------------------------------------------------------------------------------ | ------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------ |
| 安装         | `pnpm install`                                                                 | 无错误                                      |
| 类型检查     | `pnpm -r typecheck`                                                            | 0 错误                                      |
| 测试         | `pnpm test`                                                                    | 全部通过（不修改测试文件）                  |
| 构建         | `pnpm build`                                                                   | 成功                                        |
| any 扫描     | `grep -R "as any\\                                                             | : any\\                                     | any\\[\\]" packages/server/src packages/client/src packages/shared/src --include="\*.ts"` | 核心模块无显式 `any`（测试文件除外） |
| console 扫描 | `grep -R "console\." packages/server/src packages/client/src --include="*.ts"` | 无运行时 `console.*`（测试/脚本沙箱内除外） |

## Out of Scope

- 不新增产品功能。
- 不修改 `packages/*/src/tests/**/*.test.ts`。
- 不引入 ESLint/Prettier/CI（由子代理 C 负责）。
- 不补充测试覆盖率（由子代理 A 负责）。
