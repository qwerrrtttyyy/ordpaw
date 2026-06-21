# Tasks

- [x] Task 1: 前端组件服务器实现
  - [x] 创建 `component-server.ts` 实现组件注册、挂载、事件、树管理
  - [x] 创建 `component-loader.ts` 提供组件加载与生命周期管理
- [x] Task 2: 后端组件服务器扩展
  - [x] 扩展 `core/component-server.ts` 支持注册/注销与 REST 路由
  - [x] 在 `api/index.ts` 中挂载 `/api/components/*` 端点
- [x] Task 3: 多操作系统效果适配
  - [x] 在 `utils.ts` 中实现 `detectOS` 与 `applyOSEffects`
  - [x] 在 CSS 中添加 OS-specific refinements
  - [x] 更新 `utils.test.ts` 以匹配新的参数值
- [x] Task 4: API 深度优化
  - [x] 重写 `api.ts` 统一请求/响应结构与错误分类
  - [x] 在 `shared/types.ts` 中扩展 ComponentAnimation 类型
  - [x] 更新 `api.test.ts` 适配新的 API 行为
- [x] Task 5: 界面典雅化
  - [x] 重写/扩展 `styles-elegant.css`
  - [x] 添加卡片、按钮、输入、标签、状态、分隔线、动画、装饰元素
- [x] Task 6: 版本与配置统一
  - [x] 统一所有 package.json 版本为 `0.0.3`
  - [x] 修复 `app.ts` 中硬编码版本号 `0.0.2` → `0.0.3`
  - [x] 调整 `tsconfig.json` 类型配置确保 typecheck 通过
- [x] Task 7: 验证
  - [x] 运行 `pnpm build` 通过
  - [x] 运行 `pnpm -r exec -- tsc --noEmit` 通过
  - [x] 运行 `pnpm test` 47/47 通过

- [x] 修复 Task：后端组件服务器 REST 路由 `/api/components/*` 未正确挂载
  - [x] 问题：`api/index.ts` 原来仅直接注册了 `/api/components/manifest`，而 `index.ts` 将 `componentServer.getRouter()` 挂在 `/components`，导致 `/api/components/tree|relationships|plugins|register` 等端点不可用，且 `/api/components/manifest` 的响应格式与前端期望的 `{ version, items }` 不一致。
  - [x] 修复：将 `api/index.ts` 中的 `/components/manifest` 直接路由替换为 `router.use('/components', componentServer.getRouter())`，使所有 `/api/components/*` 端点生效并返回正确格式。
- [x] Task 8: 补全插件加载器未实现功能
  - [x] 实现 `getSession`：委托给 `sessionManager.getConversation`
  - [x] 实现插件私有存储 `db`：新增 `plugin_storage` 表，提供 get/set/delete/list/clear
  - [x] 重构 `loader.ts` 提取 `createPluginApi` 以便测试
  - [x] 新增 `plugin-loader.test.ts`（10 个测试）
- [x] Task 9: 补全 MCP 客户端真实 transport 连接
  - [x] 添加 `@modelcontextprotocol/sdk` 与 `zod` 依赖
  - [x] 为 stdio/sse/websocket 创建真实 transport
  - [x] `connectServer` 使用 SDK `Client.connect`
  - [x] `callTool` 通过真实连接调用工具
  - [x] 新增 `mcp-client.test.ts`（9 个测试）
- [x] Task 10: 最终验证
  - [x] 运行 `pnpm build` 通过
  - [x] 运行 `pnpm -r exec -- tsc --noEmit` 通过
  - [x] 运行 `pnpm test` 66/66 通过

# Task Dependencies
无关键依赖，Task 1-5 可并行，Task 6/7 在所有实现完成后执行。
