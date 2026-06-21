# Findings — OrdPaw v0.0.3 生产级就绪

## Baseline (2026-06-21)

- `pnpm build`: ✅ 成功（shared/client/server 均构建通过）
- `pnpm -r exec -- tsc --noEmit`: ✅ 0 错误
- `pnpm test`: ✅ 66 测试通过
  - server: 23 tests (component-server, plugin-loader, mcp-client)
  - client: 43 tests (utils, component-loader, api)

## 已识别的代码质量问题

1. **无结构化日志**
   - server/client 大量使用 `console.log/debug/warn/error` 输出运行时信息。
   - 生产环境需要可配置的日志级别与结构化输出。

2. **类型安全不足**
   - 部分核心模块使用 `any` 绕过类型检查。
   - 重点文件：client `api.ts`、server `mcp-client.ts`、`component-server.ts`、shared `types.ts` 等。

3. **缺少工程工具链**
   - 无 ESLint / Prettier 配置。
   - 无 GitHub Actions CI。
   - 无 pre-commit 钩子。
   - 无覆盖率报告与阈值。

4. **文档缺失**
   - `README.md` 不完整或缺失项目简介、开发流程、测试说明。
   - 无 `CHANGELOG.md`。
   - 无 `CONTRIBUTING.md`。

5. **版本管理空白**
   - 没有类似 nvm 的工具管理多个 OrdPaw 版本。

## 待进一步梳理的未测试模块

> 由子代理 A 在实施 Phase 2 时补充完整清单。

### Phase 2 未测试导出清单（server 核心模块）

| 文件 | 导出符号 | 类型 | 备注 |
|------|----------|------|------|
| `packages/server/src/db/utils.ts` | `safeJsonParse` | function | JSON 安全解析，含回退 |
| `packages/server/src/db/utils.ts` | `rowToObject` | function | sql.js 行 → 对象 |
| `packages/server/src/db/utils.ts` | `queryAll` | function | SELECT 全部 |
| `packages/server/src/db/utils.ts` | `queryOne` | function | SELECT 单条 |
| `packages/server/src/db/utils.ts` | `safeCount` | function | COUNT 安全读取 |
| `packages/server/src/core/event-bus.ts` | `eventBus` | singleton | EventBusImpl（on/off/emit） |
| `packages/server/src/core/session.ts` | `SessionManager` | class | 会话 CRUD |
| `packages/server/src/core/session.ts` | `sessionManager` | singleton | 默认实例 |
| `packages/server/src/core/skill-runner.ts` | `SkillRunner` | class | 技能注册/安装/执行/卸载 |
| `packages/server/src/core/skill-runner.ts` | `skillRunner` | singleton | 默认实例 |
| `packages/server/src/core/provider-service.ts` | `ProviderService` | class | 服务商 CRUD + 内置服务商 |
| `packages/server/src/core/provider-service.ts` | `providerService` | singleton | 默认实例 |
| `packages/server/src/api/index.ts` | `setupApiRoutes` | function | Express API 路由装配 |

### Phase 2 发现的阻塞/质量问题

1. **`packages/vm` 尚无测试文件**：`pnpm test` 在 `packages/vm` 因 `No test files found` 失败，阻碍整体测试命令。已在该子包 `test` 脚本追加 `--passWithNoTests` 作为临时 unblock（子代理 D 后续应补齐 VM 测试）。

2. **覆盖率依赖缺失**：`@vitest/coverage-v8` 未安装，需要在 `packages/server` 与 `packages/client` 添加为 devDependency。
