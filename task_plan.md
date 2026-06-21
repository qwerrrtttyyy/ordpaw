# OrdPaw v0.0.3 生产级就绪 Task Plan

## Goal

将 OrdPaw v0.0.3 打磨至生产级标准，并把此前未推送的 v0.0.3 更新与本次改进合并为一个统一版本。

工作覆盖：

1. 测试覆盖补全（目标 ≥ 80%）
2. 代码质量重构（结构化日志、消除 any、统一错误处理）
3. CI/工具链/文档（ESLint、Prettier、GitHub Actions、husky、README/CHANGELOG/CONTRIBUTING）
4. 版本管理工具（ordpaw-vm CLI，多版本共存）

执行方式：**多子代理并行**，协调器负责集成验证与提交。

## Phases

- [x] Phase 1: 基线测量与 planning files 初始化
- [x] Phase 2: 测试覆盖补全（子代理 A）
- [x] Phase 3: 代码质量重构（子代理 B）
- [x] Phase 4: CI/工具链/文档（子代理 C）
- [x] Phase 5: 版本管理工具（子代理 D）
- [x] Phase 6: 集成验证、提交与收尾

## Sub-Agent Assignments

| 子代理        | 职责                                                                  | 主要改动区域                                                                                  |
| ------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| A（测试）     | 补齐核心模块单元/集成测试，启用覆盖率与阈值                           | `packages/*/src/tests/`, `vitest.config.ts`, `package.json`                                   |
| B（质量）     | 引入 pino 日志、消除核心 any、统一错误处理、清理 TODO                 | `packages/server/src/**/*.ts`, `packages/client/src/**/*.ts`, `packages/shared/src/errors.ts` |
| C（工具链）   | ESLint/Prettier、GitHub Actions、husky、README/CHANGELOG/CONTRIBUTING | 根目录配置文件、`.github/workflows/`、`README.md` 等                                          |
| D（版本管理） | 新建 `packages/vm` 实现 `ordpaw-vm` CLI                               | `packages/vm/`、根 `package.json` workspaces                                                  |

## Dependencies

- Phase 2/3/4/5 可并行执行。
- Phase 6 必须在 Phase 2-5 全部完成后执行。
- 子代理 B 在重构时**不得破坏运行时行为或改变函数签名**，以免影响子代理 A 的测试。

## Completion Criteria

- `pnpm install` 成功
- `pnpm lint` 0 错误
- `pnpm -r typecheck` 0 错误
- `pnpm test` 全部通过
- `pnpm test:coverage` 总体覆盖率 ≥ 80%
- `pnpm build` 成功
- `packages/vm` 测试通过且 CLI 可手动试用
