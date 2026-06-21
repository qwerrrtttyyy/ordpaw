# Phase 3 代码质量重构 — 执行计划

## 1. 任务摘要

完成 OrdPaw v0.0.3 Phase 3 代码质量重构：
- 结构化日志（server 已引入 pino，client 已封装 logger）保持并验证。
- 统一错误类（`OrdPawError` / `OrdPawErrorCode`）并让 client API 错误继承之。
- 消除 `packages/server/src/**/*.ts`、`packages/client/src/**/*.ts`、`packages/shared/src/errors.ts` 核心模块中的 `any` 类型。
- 扫描 `TODO|FIXME|XXX` 并记录未实现项。
- 不修改任何 `packages/*/src/tests/**/*.test.ts` 测试文件，不破坏运行时行为与函数签名。
- 验证 `tsc --noEmit` 0 错误、`pnpm test` 全部通过，并更新 `task_plan.md` / `progress.md` / `findings.md`。

---

## 2. 当前状态分析（基于 Phase 1 探索）

| 区域 | 当前状态 |
|------|----------|
| `packages/server/src/core/logger.ts` | 已创建，使用 pino，级别读取 `LOG_LEVEL`，dev 用 pino-pretty，prod 输出 JSON。 |
| `packages/server/package.json` | 已安装 `pino` / `pino-pretty`。 |
| `packages/server/src/middleware.ts` | `ApiError` 已继承 `OrdPawError`，`logger` 已接入错误/请求日志。 |
| `packages/server/src/core/component-server.ts` / `mcp-client.ts` / `api/index.ts` | 已基本无 `any`（非测试代码），`console` 已替换为 `logger`。 |
| `packages/shared/src/errors.ts` | 已定义 `OrdPawError`、`OrdPawErrorCode`、`OrdPawErrorOptions`。 |
| `packages/client/src/logger.ts` | 已创建轻量封装，保留 `console.debug/warn/error` 作为底层输出。 |
| `packages/client/src/api.ts` | 仍有大量 `any`：`APICache`、`pendingRequests`、`request<T=any>`、`sendMessage`、`installPlugin`、`getStats`、`getSkills`、`getComponentTree` 等；`OrdPawApiError` 尚未继承 `OrdPawError`。 |
| `packages/client/src/views/*.ts` | 多处回调参数/局部变量/异常类型使用 `any`。 |
| `packages/client/src/utils.ts` | `debounce`/`throttle` 约束使用 `any[]`；`detectOS` 使用 `(navigator as any).maxTouchPoints`。 |
| `packages/client/src/views/component-tree.ts` | `TreeNodeData.metadata`、`createTreeVisualization` 参数、`lastRoot` 使用 `any`。 |
| `TODO/FIXME/XXX` | 当前 `packages/*/src/**/*.ts` 中未命中（已有注释为说明性，非 TODO）。 |

---

## 3. 拟修改文件与具体变更

### 3.1 共享错误类 — 已就绪，仅做兼容性确认

**文件**: `packages/shared/src/errors.ts`

- 保持 `OrdPawError`、`OrdPawErrorCode`、`OrdPawErrorOptions` 不变。
- 如运行时发现 `cause` 字段未使用且触发 `noUnusedLocals`，可保留或删除，但不得改变现有 public 字段/签名。

### 3.2 Client API — 消除 any 并继承 OrdPawError

**文件**: `packages/client/src/api.ts`

1. **导入** `OrdPawError` from `@ordpaw/shared/errors`，并额外导入需要的类型：`StatsResponse`、`ComponentTreeResponse`、`ComponentPluginsResponse`、`SkillDefinition`。
2. **`OrdPawApiError`**: 
   - 改为 `export class OrdPawApiError extends OrdPawError`。
   - 保留构造函数签名 `(message: string, status: number, code?: ErrorCode, details?: unknown)`。
   - 保留 `status`、`code`、`details` 字段语义；`code` 继续使用小写 `ErrorCode` 以兼容现有测试与运行时。
3. **`APICache`**: `Map<string, CacheEntry<any>>` → `Map<string, CacheEntry<unknown>>`。
4. **`request<T = unknown>`**: 默认泛型从 `any` 改为 `unknown`。
5. **`pendingRequests`**: `Map<string, Promise<any>>` → `Map<string, Promise<unknown>>`。
6. **API 方法返回类型精确化**：
   - `sendMessage` → `Promise<unknown>`（运行时服务端返回消息对象，类型不固定）。
   - `installPlugin(data: unknown)`（保持入参宽松）。
   - `updatePluginConfig(config: Record<string, unknown>)`。
   - `getStats` → `Promise<StatsResponse>`。
   - `getSkills` → `Promise<SkillDefinition[]>`。
   - `executeSkill(params?: Record<string, unknown>)`。
   - `executeScript/useScript(args/context?: Record<string, unknown>)`。
   - `getProviderModels` → `Promise<unknown>`。
   - `getComponentTree` → `Promise<ComponentTreeResponse>`。
   - `getComponentPlugins` → `Promise<ComponentPluginsResponse>`。
   - `exportData/exportConversation` → `Promise<unknown>`。
   - `importData(data: unknown)`。
7. **`subscribeDebugStream`**: `EventSource` 监听参数 `(e: any)` → `(e: MessageEvent)`。
8. 内部 JSON 解析错误处理保持 `try/catch`，不使用 `any`。

### 3.3 Client 视图与工具 — 替换 any

**文件**: `packages/client/src/utils.ts`

- `debounce<T extends (...args: any[]) => any>` → `debounce<T extends (...args: never[]) => unknown>`。
- `throttle` 同上。
- `detectOS` 中 `(navigator as any).maxTouchPoints` → 直接使用 `navigator.maxTouchPoints`；如 DOM lib 报类型缺失，则改为 `(navigator as Navigator).maxTouchPoints`，禁止 `any`。

**文件**: `packages/client/src/views/component-tree.ts`

- `TreeNodeData.metadata: Record<string, any>` → `Record<string, unknown>`。
- `createTreeVisualization(tree: any)` → `createTreeVisualization(tree: ComponentTreeResponse)`，同步修改内部 `tree.root`、`tree.relationships` 访问。
- `private lastRoot: any = null` → `private lastRoot: ComponentTreeResponse['root'] | null = null`。

**文件**: `packages/client/src/views/chat.ts`

- 新增本地类型：
  ```ts
  interface StreamChunkPayload { messageId: string; chunk: string; }
  interface StreamDonePayload { messageId: string; }
  interface StreamErrorPayload { messageId: string; error?: string; }
  ```
- `handleStreamChunk(payload: any)` 等三个方法改为对应具体类型。
- `(this.shell as any)._wsCleanup`：在类中新增 `private wsCleanup?: () => void;`，赋值 `this.wsCleanup = () => ws.removeEventListener(...)`；`destroy()` 调用 `this.wsCleanup?.()`。移除 `as any`。
- `handleSend` 中 `catch (err: any)` → `catch (err: unknown)`，错误消息通过 `err instanceof Error ? err.message : String(err)` 取得。

**文件**: `packages/client/src/views/dashboard.ts`

- `agents.slice(0, 3).map((a: any) => ...)` → `.map((a: Agent) => ...)`，导入 `Agent`。
- `skills.slice(0, 4).map((s: any) => ...)` → `.map((s: SkillDefinition) => ...)`。
- `catch (err: any)` → `catch (err: unknown)`，按 Error 类型取消息。

**文件**: `packages/client/src/views/agents.ts`

- `agents.map((a: any) => ...)` → `agents.map((a: Agent) => ...)`。
- `showEditModal(agent: any)` → `showEditModal(agent: Agent)`。

**文件**: `packages/client/src/views/prompts.ts`

- `prompts.map((p: any) => ...)` / `prompts.find((p: any) => ...)` → `PromptTemplate`。
- `showPromptModal(prompt?: any)` → `showPromptModal(prompt?: PromptTemplate)`。
- 导入 `PromptTemplate`。

**文件**: `packages/client/src/views/plugins.ts`

- `plugins.map((p: any) => ...)` → `plugins.map((p: PluginInstance) => ...)`，导入 `PluginInstance`。

**文件**: `packages/client/src/views/settings.ts`

- `t(\`theme.\${theme}\` as any)` → `t(\`theme.\${theme}\` as \`theme.\${ThemeId}\`)`；若类型仍不兼容则退回到 `as string`。
- `value as any` for `logLevel` / `checkpointStrategy` → `as Settings['logLevel']` / `as Settings['checkpointStrategy']`。

**文件**: `packages/client/src/views/providers.ts`

- `type = ...value as any` → `as Provider['type']`。

**文件**: `packages/client/src/views/scripts.ts`

- `language = ...value as any` → `as Script['language']`。
- `catch (err: any)` → `catch (err: unknown)`，使用 Error 消息。

**文件**: `packages/client/src/views/download-manager.ts`

- `skills.map((s: any) => ...)` → `skills.map((s: SkillDefinition) => ...)`。

### 3.4 Server — 补漏与确认

**文件**: `packages/server/src/core/script-mcp.ts`

- 第 317 行仅为注释中的 `console.log/warn/error` 说明，无需修改。
- 确认其它位置已无 `console.*` 调用，已替换为 `logger`。

**文件**: `packages/server/src/middleware.ts`

- `notFoundHandler` 返回的 `code: 'ROUTE_NOT_FOUND'` 可改为 `OrdPawErrorCode.ROUTE_NOT_FOUND` 以保持一致，但不强制；不得改变响应结构。

---

## 4. TODO/FIXME/XXX 处理

- 使用 `Grep` 扫描 `packages/*/src/**/*.ts`（排除测试）。
- 当前扫描结果：无未实现 TODO/FIXME/XXX。
- 若执行时重新扫描发现未实现项：
  - 已实现的功能旁附带的 TODO/FIXME：删除该注释。
  - 未实现的功能：记录到 `/workspace/findings.md` 的“Phase 3 剩余 TODO”章节，包含文件路径、行号、内容摘要。

---

## 5. 验证步骤

按顺序执行：

1. `cd /workspace && pnpm install` —— 确保 pino / pino-pretty 及 workspace 依赖已就位。
2. `cd /workspace && pnpm -r exec -- tsc --noEmit` —— 必须 0 错误。
3. `cd /workspace && pnpm test` —— 必须全部通过（当前基线 66 个）。
4. `cd /workspace && pnpm build` —— 作为回归检查，应成功。

---

## 6. 文档更新

- `/workspace/task_plan.md`：将 Phase 3 标记为 `completed`。
- `/workspace/progress.md`：新增 Phase 3 完成段落，记录：
  - 修改文件清单；
  - 消除的 `any` 数量（按文件统计）；
  - TODO/FIXME/XXX 扫描结果；
  - typecheck / test / build 结果。
- `/workspace/findings.md`：若无剩余 TODO 写入“Phase 3 扫描：无未实现 TODO”；若有则列出。

---

## 7. 交付物

- 修改文件清单；
- 消除的 `any` 数量；
- 剩余 TODO 列表（预计为空）；
- `typecheck` / `test` / `build` 结果摘要。

---

## 8. 决策与假设

- **日志策略**：server 使用 `pino` + `pino-pretty`（已实施）；client 保持轻量 `Logger` 封装，继续以 `console` 为底层但统一前缀与级别控制。
- **错误码兼容**：client `ErrorCode` 维持小写字符串（如 `'network'`），`OrdPawApiError` 继承 `OrdPawError` 时把该字符串传给父类 `code`，确保既有测试与运行时行为不变。
- **`any` 消除原则**：优先替换为 `unknown` + 必要类型守卫；对已知结构（API 响应、shared types）使用具体类型；对视图模板回调使用对应业务类型。
- **不修改测试**：所有变更不得触碰 `packages/*/src/tests/**/*.test.ts`。
