# Phase 2 测试覆盖补全执行计划

## 1. 摘要

为 `packages/server` 与 `packages/client` 补齐测试，启用 `@vitest/coverage-v8` 并配置阈值：

- **server**：`src/**/*.ts` 全部纳入覆盖率，目标 statements/branches/functions/lines ≥ 80%。
- **client**：仅以下 7 个核心模块纳入 80% 阈值：
  - `src/utils.ts`
  - `src/api.ts`
  - `src/store.ts`
  - `src/component-loader.ts`
  - `src/animation-manager.ts`
  - `src/download-manager.ts`
  - `src/sequence-executor.ts`
  - `views/`、`components/` 等通过 `coverage.exclude` 排除，不强制 80%。

所有 `packages/*/src/**/*.ts` 生产代码原则上只读；若发现明显 bug，最小化修复并记录到 `/workspace/findings.md`。

## 2. 当前状态分析

### 2.1 工程配置

- 根 `package.json` 已有 `test` / `test:server` / `test:client`，**不**在根添加 `test:coverage`。
- `packages/server/package.json` 与 `packages/client/package.json` 已添加 `test:coverage` 脚本，且已安装 `@vitest/coverage-v8`。
- `packages/server/vitest.config.ts` 与 `packages/client/vitest.config.ts` 已配置 coverage provider/include/exclude/reporter/thresholds（thresholds 均为 80）。
- `packages/vm/package.json` 已使用 `--passWithNoTests`，不会阻塞根 `pnpm test`。

### 2.2 测试文件现状

- server 已存在：`db-utils.test.ts`、`event-bus.test.ts`、`session.test.ts`、`skill-runner.test.ts`、`provider-service.test.ts`、`api.integration.test.ts`、`mcp-client.test.ts`、`plugin-loader.test.ts`、`component-server.test.ts`。
- client 已存在：`utils.test.ts`、`api.test.ts`、`component-loader.test.ts`、`download-manager.test.ts`、`sequence-executor.test.ts`、`animation-manager.test.ts`、`store.test.ts`。

### 2.3 覆盖率基线（server，基于已生成的 `packages/server/coverage/coverage-summary.json`）

| 指标       | 覆盖率 |
| ---------- | ------ |
| lines      | 48.26% |
| statements | 48.26% |
| functions  | 59.13% |
| branches   | 70.46% |

覆盖率显著低于 80% 的文件（按未覆盖行数降序）：

| 文件                                             | 当前行覆盖 | 未覆盖行数 | 备注                 |
| ------------------------------------------------ | ---------- | ---------- | -------------------- |
| `packages/server/src/api/index.ts`               | 46.52%     | ~408       | API 路由装配         |
| `packages/server/src/core/test-suite.ts`         | 21.11%     | ~284       | 测试套件 CRUD + run  |
| `packages/server/src/db/index.ts`                | 18.67%     | ~257       | 数据库初始化/保存    |
| `packages/server/src/core/download-service.ts`   | 19.76%     | ~276       | 下载路由 + 后台任务  |
| `packages/server/src/core/script-mcp.ts`         | 47.29%     | ~214       | 脚本/MCP 执行        |
| `packages/server/src/core/agent-runtime.ts`      | 47.88%     | ~185       | Agent 运行时         |
| `packages/server/src/core/sequence-generator.ts` | 0%         | 233        | 操作序列生成         |
| `packages/server/src/ws/handler.ts`              | 0%         | 168        | WebSocket 消息处理   |
| `packages/server/src/index.ts`                   | 0%         | 168        | 服务启动入口         |
| `packages/server/src/middleware.ts`              | 69.85%     | ~41        | 错误/日志/验证中间件 |
| `packages/server/src/core/checkpoint.ts`         | 61.41%     | ~71        | 检查点管理           |
| `packages/server/src/core/component-server.ts`   | 69.42%     | ~85        | 组件服务             |
| `packages/server/src/core/cache.ts`              | 78.84%     | ~11        | 缓存                 |
| `packages/server/src/core/debug-logger.ts`       | 73.62%     | ~24        | 调试日志             |
| `packages/server/src/core/logger.ts`             | 57.89%     | ~8         | 日志入口             |
| `packages/server/src/plugin/loader.ts`           | 58.08%     | ~57        | 插件加载             |

### 2.4 覆盖率基线（client）

client 覆盖率报告尚未生成。计划第一步先生成 client `coverage/coverage-summary.json`，再按实际缺口补充用例。

## 3. 实施步骤

### 步骤 1：基线测量

1. `pnpm install` 确保依赖完整。
2. `pnpm test` 确认全部测试通过。
3. 生成覆盖率报告：
   - `pnpm --filter @ordpaw/server test:coverage`
   - `pnpm --filter @ordpaw/client test:coverage`
4. 读取两份 `coverage/coverage-summary.json`，确定未覆盖代码区域。

### 步骤 2：修复阻塞问题

- 若测试/覆盖率命令失败 due to 明显语法/类型错误，先记录到 `findings.md` 再最小化修复。
- 仅修复 bug，不重构业务逻辑。

### 步骤 3：补充 server 核心模块测试（优先级降序）

目标：通过新增/扩展以下测试文件，把 server 整体覆盖率提升到 ≥ 80%。

#### 3.1 `packages/server/src/tests/db-index.test.ts`

- 覆盖 `initDatabase`、`getDatabase`、`saveDatabase`、`flushDatabaseSync`。
- 使用 `vi.mock('fs')` 隔离真实 `data/ordpaw.db` 写入；或创建临时目录并 `process.chdir`。
- 验证：内存数据库创建、schema 初始化、legacy 迁移路径、debounce 保存与同步刷新。

#### 3.2 `packages/server/src/tests/sequence-generator.test.ts`

- 直接实例化 `SequenceGenerator`。
- 覆盖 `checkPermission`、`validateSequence`、`generate`。
- 验证：各 intent（`navigate_and_chat`、`theme_switch`、`onboarding`）生成正确序列；权限不足拒绝；沙箱校验（白名单、路由、选择器、数量限制、rate limit）。

#### 3.3 `packages/server/src/tests/ws-handler.test.ts`

- mock `WebSocketServer` 与 `WebSocket`（基于 `EventTarget` 的轻量 mock）。
- mock `../core/agent-runtime.js` 与 `../core/event-bus.js`。
- 覆盖：连接建立、事件总线订阅/取消订阅、`ping/pong`、`chat:message` 全流、错误消息发送、连接关闭清理。

#### 3.4 `packages/server/src/tests/test-suite.test.ts`

- mock `../db/index.js` 为 `createMemoryDb()`；mock `../core/agent-runtime.js` 与 `../core/session.js`。
- 覆盖：`listSuites`、`getSuite`、`createSuite`、`updateSuite`、`deleteSuite`、case CRUD、`runSuite`（含 passed/failed 分支）、`listRuns`。
- 验证 `normalizeExpectedContains` 与 `evaluateCase` 的各种分支。

#### 3.5 `packages/server/src/tests/download-service.test.ts`

- 使用 `supertest`（或 `express` + `fetch`）对 `setupDownloadRoutes` 创建的 router 进行端点测试。
- mock `../db/index.js` 为 memory DB 并 seed conversations/scripts/skills/agents；mock `child_process.execFile` 避免真实打包；mock `fs` 读写行为。
- 覆盖：`/download/resource`（conversation/script/skill/mcp/file 等类型）、`/download/source`、`/download/server`（创建任务）、状态/暂停/恢复/取消控制、`processServerTask` 的 pause/resume/cancel 路径、配额超限、路径校验。

#### 3.6 `packages/server/src/tests/middleware.test.ts`

- 直接测试 `asyncHandler`、`ApiError`、`errorHandler`、`requestLogger`、`validateBody`、`notFoundHandler`。
- 使用最小化的 `req/res/next` stub。

#### 3.7 扩展 `packages/server/src/tests/api.integration.test.ts`

- 补充现有未覆盖端点：`/api/test-suites/*`、`/api/test-cases/*`、`/api/debug/*`、`/api/skills/*`、`/api/mcp/*`、`/api/scripts/*`、`/api/prompts/*`、`/api/plugins/*`、`/api/settings`、`/api/stats`、`/api/export`、`/api/import`、`/api/clear-data`、`/api/reset/settings`、`/api/download/*`。
- 目标：将 `src/api/index.ts` 覆盖率提升到 ≥ 80%。

#### 3.8 按需补充以下模块单元测试

- `packages/server/src/tests/agent-runtime.test.ts`（若缺口仍大）
- `packages/server/src/tests/script-mcp.test.ts`
- `packages/server/src/tests/checkpoint.test.ts`
- `packages/server/src/tests/component-server.test.ts`（已存在，按需扩展）
- `packages/server/src/tests/cache.test.ts`
- `packages/server/src/tests/debug-logger.test.ts`

#### 3.9 `index.ts` 处理

- `index.ts` 在模块加载时立即启动服务，直接单元测试风险高。
- 计划：优先覆盖其他模块；若整体仍差少许，再考虑通过子进程集成测试或精细 mock `http`/`ws`/`express` 来验证启动逻辑，**但不修改生产代码的导出结构**。

### 步骤 4：补充 client 核心模块测试

1. 生成 client 覆盖率报告。
2. 对 7 个纳入阈值的文件，若任一指标低于 80%，在对应测试文件中追加用例：
   - `api.test.ts`：覆盖缓存命中、并发去重、非 JSON 响应、超时/网络错误、各 CRUD 方法错误分支。
   - `download-manager.test.ts`：覆盖 server 下载流程、浏览器存储配额超限、fsa/localstorage backend、clearCompleted、removeTask。
   - `sequence-executor.test.ts`：覆盖重试/超时、动画操作、通知操作、未知操作类型、序列完成/进度消息。
   - `animation-manager.test.ts`：覆盖 performance tier 分支、visibility pause、cancelAll、onFpsUpdate、loop 动画。
   - `component-loader.test.ts`：覆盖 CSS 注入失败、registerLifecycle、mount/unmount 错误分支。
   - `utils.test.ts`：覆盖 detectOS、applyOSEffects、prefersReducedMotion、createModal 交互分支。
   - `store.test.ts`：覆盖 setSettings 与 locale 联动、各 setter/getter。
3. 保持 `views/`、`components/` 排除在阈值外，但可为其补充测试以提升总体质量（**不强制**）。

### 步骤 5：迭代验证

- 每完成一组测试，运行对应子包 `pnpm --filter <pkg> test:coverage`。
- 若 coverage 仍低于 80%，回到步骤 3/4 继续补充；不临时降低 thresholds。
- 最终运行：
  - `pnpm test`
  - `pnpm -r exec -- tsc --noEmit`
  - `pnpm build`

### 步骤 6：文档与状态更新

- 在 `/workspace/findings.md` 追加：
  - 最终 server/client 覆盖率（lines/statements/branches/functions）。
  - 仍未达 80% 的模块清单（如有）及原因。
  - Phase 2 发现并修复的 bug 记录。
- 在 `/workspace/task_plan.md` 中将 Phase 2 标记为 completed。
- 在 `/workspace/progress.md` 记录：
  - 新增/修改的测试文件清单
  - 总测试数量
  - server 最终覆盖率
  - client 核心模块最终覆盖率

## 4. 预期改动文件

- `packages/server/src/tests/db-index.test.ts`（新增）
- `packages/server/src/tests/sequence-generator.test.ts`（新增）
- `packages/server/src/tests/ws-handler.test.ts`（新增）
- `packages/server/src/tests/test-suite.test.ts`（新增）
- `packages/server/src/tests/download-service.test.ts`（新增）
- `packages/server/src/tests/middleware.test.ts`（新增）
- `packages/server/src/tests/api.integration.test.ts`（扩展）
- `packages/server/src/tests/agent-runtime.test.ts`（视需要新增/扩展）
- `packages/server/src/tests/script-mcp.test.ts`（视需要新增/扩展）
- `packages/server/src/tests/checkpoint.test.ts`（视需要新增/扩展）
- `packages/server/src/tests/cache.test.ts`（视需要新增/扩展）
- `packages/server/src/tests/debug-logger.test.ts`（视需要新增/扩展）
- `packages/client/src/tests/*.test.ts`（视需要扩展）
- `packages/server/vitest.config.ts`（仅确认/微调 exclude，不降低 thresholds）
- `packages/client/vitest.config.ts`（仅确认/微调 exclude，不降低 thresholds）
- `/workspace/findings.md`（追加）
- `/workspace/task_plan.md`（更新 Phase 2 状态）
- `/workspace/progress.md`（记录结果）

## 5. 假设与决策

- 采用方案 A：server `src/**/*.ts` 全量纳入阈值；client 仅列出的 7 个核心模块纳入阈值，`views/`、`components/` 通过 `coverage.exclude` 排除。
- 测试用例尽量 mock 数据库、网络与文件系统，不依赖真实外部服务。
- 生产代码仅在有明显 bug 时修改，且必须在 `findings.md` 中记录。
- 不在根 `package.json` 添加新脚本；子包 `test:coverage` 脚本已就绪。
- 覆盖率 thresholds 保持 80%，用于驱动迭代；不临时降低以避免隐藏缺口。

## 6. 验证标准

- `pnpm test`：全部通过（含 server/client/vm）。
- `pnpm --filter @ordpaw/server test:coverage`：server 总体 statements/branches/functions/lines ≥ 80%。
- `pnpm --filter @ordpaw/client test:coverage`：纳入的 7 个核心模块 statements/branches/functions/lines ≥ 80%。
- `pnpm -r exec -- tsc --noEmit`：0 类型错误。
- `pnpm build`：成功。
