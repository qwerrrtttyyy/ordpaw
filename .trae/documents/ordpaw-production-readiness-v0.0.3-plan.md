# OrdPaw v0.0.3 生产级就绪计划

## Summary

将 OrdPaw v0.0.3 打磨至生产级标准，并把此前未推送的 v0.0.3 更新与本次改进合并为一个统一版本。工作围绕三条主线并行展开：

1. **测试覆盖**：为核心模块补齐单元/集成测试，目标总体代码覆盖率 ≥ 80%。
2. **代码质量**：消除核心 any 类型、替换无结构 console.log、清理 TODO、统一错误处理。
3. **工程工具链**：引入 ESLint/Prettier、GitHub Actions CI、husky pre-commit、覆盖率阈值、CHANGELOG、贡献指南。
4. **版本管理工具**：新增一个类似 nvm 的 OrdPaw 版本管理 CLI，支持多版本安装、切换与共存。

执行方式采用**多子代理并行**：协调器维护计划与进度，各子代理负责独立工作流，最后统一验证。

## Current State Analysis

- **项目结构**：pnpm monorepo，包含 `packages/server`、`packages/client`、`packages/shared`，版本 `0.0.3`。
- **构建/测试**：根目录已配置 `build`、`test`、`dev:server`、`dev:client` 脚本；使用 `vitest` 作为测试框架；TypeScript 类型检查已可通过。
- **现有测试**：
  - `packages/server/src/tests/`：已覆盖 `component-server`、`plugin-loader`、`mcp-client`，共 23 个测试。
  - `packages/client/src/tests/`：已覆盖 `utils`、`component-loader`、`api`，共 43 个测试。
- **代码质量问题**：
  - 大量 `console.log/debug/warn/error` 用于运行时输出，缺乏结构化日志。
  - 部分核心模块使用 `any` 绕过类型检查。
  - 存在少量 TODO/FIXME 标记（虽然最近一次补全已处理，但重构后可能新增）。
- **工程差距**：
  - 无 ESLint/Prettier 配置。
  - 无 CI/CD（`.github/workflows` 不存在）。
  - 无 pre-commit 钩子。
  - 无覆盖率报告与阈值。
  - README/CHANGELOG/CONTRIBUTING 缺失或不完整。
  - 无版本管理工具，无法让多个 OrdPaw 版本共存。
- **Agent 指令**：未发现 `CLAUDE.md`、`AGENTS.md`、`.cursor/rules` 等仓库级代理指令文件。

## Proposed Changes

### Phase 1: 基线与规划（协调器，1 轮）

- 初始化 `planning-with-files` 三件套：
  - `task_plan.md`：按子代理拆分任务与状态。
  - `findings.md`：记录探索中发现的质量问题与决策。
  - `progress.md`：持续更新各子代理进度。
- 建立基线：运行并记录 `pnpm build`、`pnpm -r typecheck`、`pnpm test`、覆盖率报告（当前值）。
- 确定待测试模块清单与待消除 any 清单。

### Phase 2: 测试覆盖补全（子代理 A）

**目标**：未覆盖的核心模块均有测试；总体覆盖率 ≥ 80%。

**工作项**：

1. 梳理未测试模块
   - 读取 `packages/server/src/db/utils.ts`、`packages/server/src/core/event-bus.ts`、`packages/server/src/core/session.ts`、`packages/server/src/core/skill-runner.ts`、`packages/server/src/core/provider-service.ts`、`packages/server/src/api/index.ts` 等。
   - 输出未测试函数清单到 `findings.md`。
2. 单元测试
   - `db/utils.ts`：`queryOne`、`queryAll`、`transaction` 辅助函数。
   - `event-bus.ts`：`on/off/emit/once`。
   - `session.ts`：`createConversation`、`getConversation`、`addMessage`。
   - `skill-runner.ts`：`registerSkill`、`executeSkill`。
   - `provider-service.ts`：`listProviders`、`configureProvider`、`callProvider`。
3. 集成测试
   - 启动真实 server（使用随机端口/内存数据库），测试 `/api/health`、`/api/agents`、`/api/components/*`、`/api/mcp/*` 等关键端点。
4. 覆盖率配置
   - 在 `vitest.config.ts` 中启用 `coverage`（使用 `@vitest/coverage-v8`）。
   - 在根 `package.json` 添加 `test:coverage` 脚本。
5. 提交结果
   - 将新增/修改的测试文件、覆盖率配置提交到一个独立分支或 PR。

**涉及文件**：

- `packages/server/src/tests/db-utils.test.ts`
- `packages/server/src/tests/event-bus.test.ts`
- `packages/server/src/tests/session.test.ts`
- `packages/server/src/tests/skill-runner.test.ts`
- `packages/server/src/tests/provider-service.test.ts`
- `packages/server/src/tests/api.integration.test.ts`
- `packages/server/vitest.config.ts`
- `packages/client/vitest.config.ts`
- 根 `package.json`

### Phase 3: 代码质量重构（子代理 B）

**目标**：核心模块无显式 `any`；运行时输出使用结构化 logger；无剩余 TODO/FIXME。

**工作项**：

1. 引入结构化日志
   - 新增依赖 `pino`（server）与 `pino-pretty`（dev）。
   - 创建 `packages/server/src/core/logger.ts`，导出 `logger` 实例。
   - 将 `console.log/warn/error/debug` 替换为 `logger.info/warn/error/debug`。
2. 类型安全
   - 将核心模块的 `any` 替换为具体类型或 `unknown` + 类型守卫。
   - 重点文件：`api.ts`（client）、`api/index.ts`（server）、`mcp-client.ts`、`component-server.ts`、`utils.ts`。
3. 统一错误处理
   - 在 `packages/shared/src/errors.ts` 定义通用错误类与错误码（若不存在则创建）。
   - server/client 均复用该错误体系。
4. 清理 TODO/FIXME
   - 搜索剩余 TODO/FIXME；已实现则删除注释，未实现则实现或转化为 issue。
5. 提交结果
   - 将质量重构提交到独立分支或 PR。

**涉及文件**：

- `packages/server/src/core/logger.ts`（新建）
- `packages/server/src/**/*.ts`
- `packages/client/src/**/*.ts`
- `packages/shared/src/errors.ts`（新建/扩展）
- `packages/shared/src/types.ts`（扩展）

### Phase 4: CI/工具链与文档（子代理 C）

**目标**：每次 PR 自动执行 lint/typecheck/test/build；代码风格统一；文档完整。

**工作项**：

1. ESLint + Prettier
   - 根目录添加 `.eslintrc.cjs`（或 `eslint.config.js`），使用 `@typescript-eslint/recommended`。
   - 添加 `.prettierrc`（singleQuote、printWidth 100、trailingComma es5）。
   - 添加 `.prettierignore`（`dist`、`node_modules`、`.pnpm-store`）。
   - 在根 `package.json` 添加 `lint`、`lint:fix`、`format`、`format:check` 脚本。
2. GitHub Actions CI
   - 创建 `.github/workflows/ci.yml`：
     - 触发条件：`push` 到 `main`、`pull_request`。
     - 步骤：checkout、setup Node 18+、pnpm install、lint、typecheck、test、coverage、build。
   - 创建 `.github/workflows/pr-title.yml`（可选，检查 conventional commits）。
3. pre-commit 钩子
   - 添加 `husky` + `lint-staged`。
   - `lint-staged` 配置：对 staged TS/TSX 运行 `eslint --fix` 与 `prettier --write`。
4. 覆盖率阈值
   - 在 `vitest.config.ts` 中配置 `coverage.thresholds`：
     - `lines: 80`、`functions: 75`、`branches: 70`、`statements: 80`（可迭代调整）。
5. 文档
   - 重写 `README.md`：项目简介、安装、开发、测试、构建。
   - 新增 `CHANGELOG.md`：记录 v0.0.3 变更。
   - 新增 `CONTRIBUTING.md`：分支策略、提交规范、PR 流程。
6. 提交结果
   - 将工具链与文档提交到独立分支或 PR。

**涉及文件**：

- `.eslintrc.cjs`
- `.prettierrc`
- `.prettierignore`
- `.github/workflows/ci.yml`
- `.husky/pre-commit`
- `lint-staged.config.js`
- `README.md`
- `CHANGELOG.md`
- `CONTRIBUTING.md`
- 根 `package.json`
- 各 `vitest.config.ts`

### Phase 5: 版本管理工具（子代理 D）

**目标**：新增一个 OrdPaw 版本管理 CLI，允许用户安装、切换、管理多个 OrdPaw 版本，类似 nvm 之于 Node/npm。

**工作项**：

1. 设计 CLI
   - 名称：`ordpaw-vm`（命令行入口）。
   - 命令：
     - `ordpaw-vm install <version>`：从 npm/registry 下载指定版本到本地版本库。
     - `ordpaw-vm use <version>`：在当前 shell/项目切换版本（写入 `.ordpaw-version` 或修改 PATH）。
     - `ordpaw-vm list`：列出已安装版本。
     - `ordpaw-vm current`：显示当前激活版本。
     - `ordpaw-vm uninstall <version>`：删除指定版本。
   - 版本存储位置：`~/.ordpaw-vm/versions/<version>/`。
   - 当前版本激活方式：创建/修改 `~/.ordpaw-vm/current` 符号链接或记录文件。
2. 实现
   - 新建 pnpm workspace 包 `packages/vm`。
   - 技术栈：TypeScript + Node 内置 `fs`、`child_process`、`https`。
   - 若版本以 npm 包发布，可从 registry 下载 tarball 并解压。
3. 测试
   - 对 CLI 命令进行单元测试：使用临时目录模拟 `ORDPAW_VM_HOME`。
   - 测试 install/use/list/uninstall 的核心逻辑。
4. 文档
   - 在 `README.md` 增加版本管理工具使用说明。
5. 提交结果
   - 将 `packages/vm` 与文档提交到独立分支或 PR。

**涉及文件**：

- `packages/vm/package.json`
- `packages/vm/tsconfig.json`
- `packages/vm/src/cli.ts`
- `packages/vm/src/version-manager.ts`
- `packages/vm/src/installer.ts`
- `packages/vm/src/tests/*.test.ts`
- 根 `package.json` workspaces
- `README.md`

### Phase 6: 多子代理集成验证（协调器，1 轮）

- 汇总各子代理分支/PR，解决冲突。
- 运行完整验证矩阵：
  - `pnpm install`
  - `pnpm lint`
  - `pnpm -r typecheck`
  - `pnpm test`（含覆盖率）
  - `pnpm build`
- 若覆盖率或 lint 未达标，回退到对应子代理修复。
- 更新 `CHANGELOG.md`，将此前未推送的 v0.0.3 改进与本次生产级工作合并记录，不提升版本号。
- 合并到主分支（或在当前分支完成）。

## Assumptions & Decisions

- **向后兼容**：v0.0.3 的重构不破坏现有 API 与行为；如有必要，先新增再弃用。
- **Node 版本**：继续要求 Node >= 18；版本管理工具 CLI 也以此为基础。
- **测试框架**：继续使用 `vitest`，不迁移到 Jest/Mocha。
- **日志库**：server 使用 `pino`（性能优先），client 使用轻量级封装（可继续使用 console 但统一封装为 logger）。
- **版本管理工具 MVP**：第一版支持从 npm registry 下载已发布的 `@ordpaw/*` 包并本地隔离；暂不支持源码编译安装。
- **分支策略**：每个子代理在独立分支工作，协调器最后合并；若环境不支持分支，则按文件隔离后统一验证。
- **覆盖率阈值**：初定 `lines 80 / functions 75 / branches 70 / statements 80`，实施中根据基线数据微调。

## Verification Steps

| 检查项        | 命令/方法                                       | 通过标准                                       |
| ------------- | ----------------------------------------------- | ---------------------------------------------- |
| 安装          | `pnpm install`                                  | 无错误                                         |
| 代码风格      | `pnpm lint`                                     | 0 错误、0 警告（或仅允许警告）                 |
| 类型检查      | `pnpm -r exec -- tsc --noEmit`                  | 0 错误                                         |
| 单元/集成测试 | `pnpm test`                                     | 全部通过                                       |
| 覆盖率        | `pnpm test:coverage`                            | 总体 ≥ 80%，函数 ≥ 75%，分支 ≥ 70%，语句 ≥ 80% |
| 构建          | `pnpm build`                                    | 所有包构建成功                                 |
| CI 本地验证   | `act` 或手动运行 workflow                       | 通过                                           |
| 版本管理工具  | `pnpm --filter @ordpaw/vm test` + 手动 CLI 试用 | install/use/list 正常工作                      |
| 端到端        | 启动 server + client，执行关键用户流程          | 无异常                                         |

## Risks & Mitigations

| 风险                              | 影响 | 缓解措施                                                    |
| --------------------------------- | ---- | ----------------------------------------------------------- |
| 测试覆盖率难以一次达到 80%        | 中   | 先补核心模块，再逐步提升阈值；可接受迭代调整                |
| 重构 any 类型时破坏运行时行为     | 高   | 每次重构后运行相关测试；优先使用 unknown + 类型守卫         |
| 多子代理并行产生合并冲突          | 中   | 每个子代理聚焦独立文件集；协调器最后统一 rebase/merge       |
| 版本管理工具依赖 npm registry     | 低   | MVP 阶段依赖已发布包；后续可支持 GitHub Releases 与本地源码 |
| CI 配置在本仓库首次运行时环境问题 | 低   | 先在本地用 `act` 验证 workflow                              |

## Out of Scope

- 不修改产品核心功能（新的 AI 模型、新的 UI 页面）。
- 不引入 Docker/K8s 部署。
- 不实现 OAuth/认证系统重构。
