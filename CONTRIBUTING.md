# Contributing to OrdPaw

感谢你对 OrdPaw 的贡献！本指南说明如何搭建开发环境、提交代码与发起 PR。

## 开发环境

- **Node.js**：>= 18.0.0
- **包管理器**：pnpm（仓库使用 pnpm workspaces）
- **Git**：>= 2.30

```bash
# 克隆仓库
git clone <repo-url>
cd ordpaw

# 安装依赖
pnpm install

# 验证环境
pnpm typecheck
pnpm test
```

## 分支策略

- `main` 是主分支，始终保持可构建、可测试。
- 所有改动通过 **Pull Request** 合并到 `main`。
- 分支命名建议：
  - 功能：`feat/<short-description>`
  - 修复：`fix/<short-description>`
  - 测试：`test/<short-description>`
  - 文档：`docs/<short-description>`
  - 工具链：`chore/<short-description>`

## 提交规范（Conventional Commits）

提交信息必须采用 [Conventional Commits](https://www.conventionalcommits.org/) 格式：

```
<type>(<scope>): <subject>

<body>

<footer>
```

常用类型：

- `feat`：新功能
- `fix`：Bug 修复
- `docs`：文档更新
- `style`：不影响代码逻辑的格式修改（空格、分号等）
- `refactor`：重构
- `perf`：性能优化
- `test`：测试相关
- `chore`：构建/工具链/依赖更新

示例：

```
feat(server): add provider model cache invalidation

fix(client): escape HTML in plugin rendered content

docs(readme): update quick start instructions
```

## PR 流程

1. 从 `main` 切出新分支。
2. 在本地开发与测试：
   - `pnpm lint`
   - `pnpm typecheck`
   - `pnpm test`
   - `pnpm build`
3. 确保提交历史清晰，可使用 `git rebase -i main` 整理。
4. 推送分支并创建 Pull Request。
5. PR 标题必须符合 Conventional Commits（由 `pr-title.yml` 工作流检查）。
6. 等待 CI 全部通过，并至少一名维护者 review。

## 代码风格

- TypeScript 使用单引号、`printWidth: 100`、末尾逗号 `es5`、分号启用、缩进 2 空格。
- 提交前 husky + lint-staged 会自动格式化暂存文件。
- 如需手动格式化：`pnpm lint:fix` 与 `pnpm format`。

## 测试与覆盖率

- 新增功能必须附带单元或集成测试。
- 覆盖率阈值配置在 `vitest.config.ts`。
- 提交前请确保 `pnpm test:coverage` 通过。

## Issue 与讨论

- 发现 Bug 请在 Issues 中描述复现步骤、期望行为与实际行为。
- 大型功能建议先开 Discussion 或 Issue 讨论设计，再进入实现。

## 许可

提交即表示你同意将你的贡献在 MIT 许可下发布。
