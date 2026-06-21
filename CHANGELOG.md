# Changelog

## [0.0.3] - 2026-06-21

本次版本将此前未推送的 v0.0.3 更新与生产级就绪改进合并为一个统一版本，版本号保持 `0.0.3`。

### 新增

- **组件服务器（Component Server）**
  - 新增 `packages/server/src/core/component-server.ts`，集中管理插件前端组件注册与元数据。
  - 组件缓存使用独立命名空间，避免污染 `providerModelsCache`。
  - 支持插件通过组件 ID 提供 HTML/CSS/JS 片段，客户端可热加载。

- **多操作系统适配**
  - 路径处理与文件系统操作兼容 Windows / macOS / Linux。
  - 插件加载、版本管理工具安装脚本统一使用跨平台路径拼接。

- **版本管理工具 `ordpaw-vm`**
  - 新增 `packages/vm`，提供 `ordpaw-vm` CLI。
  - 支持 `install`、`use`、`list`、`current`、`uninstall` 命令。
  - 版本存储在 `~/.ordpaw-vm/versions/<version>/`，通过 `~/.ordpaw-vm/current` 管理当前版本。
  - 保留从 npm registry 下载真实 tarball 的能力，当前 MVP 使用本地模拟 tarball 进行测试。

- **工程工具链**
  - 引入 ESLint（`@typescript-eslint/recommended`）与 Prettier。
  - 新增 GitHub Actions CI，在 Node 18/20 上执行 lint、typecheck、test、coverage、build。
  - 新增 PR Title 检查工作流，要求符合 Conventional Commits。
  - 新增 husky pre-commit 钩子与 lint-staged，对暂存代码自动执行 `eslint --fix` 与 `prettier --write`。
  - 在 `vitest.config.ts` 中启用覆盖率报告与阈值（statements/lines/functions/branches）。

### 优化

- **API 与运行时**
  - 统一前后端 fetch/HTTP 错误处理，返回结构化错误信息。
  - 服务端路由与中间件拆分更清晰，便于测试与扩展。
  - 引入 `pino` 结构化日志，逐步替换 `console.log/warn/error`。

- **类型安全**
  - 核心模块逐步消除显式 `any`，替换为具体类型或 `unknown` + 类型守卫。
  - 共享错误类与错误码在 `packages/shared/src/errors.ts` 中统一管理。

### 测试与质量

- 补齐服务端核心模块单元测试：
  - `db/utils.ts`（`safeJsonParse`、`rowToObject`、`queryAll`、`queryOne`、`safeCount`）
  - `core/event-bus.ts`（`on` / `off` / `emit` / `once`）
  - `core/session.ts`（会话 CRUD）
  - `core/skill-runner.ts`（技能注册/执行）
  - `core/provider-service.ts`（服务商 CRUD / 内置服务商）
  - `api/index.ts` 集成测试
- 客户端扩展 `utils`、`api`、`component-loader` 等模块测试覆盖。
- 总体测试用例由 66 个扩展至覆盖核心服务端/客户端/版本管理模块。

### 文档

- 重写 `README.md`，补充安装、开发、测试、构建、`ordpaw-vm` 使用说明。
- 新增 `CONTRIBUTING.md`，规范分支策略、提交规范与 PR 流程。
- 新增 `CHANGELOG.md`（本文件）。
