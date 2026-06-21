# OrdPaw

[![CI](https://github.com/ordpaw/ordpaw/actions/workflows/ci.yml/badge.svg)](https://github.com/ordpaw/ordpaw/actions/workflows/ci.yml)

OrdPaw 是一个面向开发者的全栈 AI Agent 开发、调试与运行平台。它提供可扩展的插件系统、统一的 LLM 服务接入、会话管理、组件化前端，以及用于多版本共存的命令行版本管理工具 `ordpaw-vm`。

**当前版本：v0.0.3**

## 特性

- **Agent Workbench** — 创建、配置并管理 AI Agent
- **多服务商接入** — 支持 OpenAI 兼容端点与 Anthropic Messages API
- **会话与历史** — 多轮对话、检查点、时间旅行回滚
- **插件与组件** — 事件驱动钩子 + 前端组件贡献
- **Skills Engine** — 基于 JSON Schema 的可插拔技能定义
- **MCP Client** — Model Context Protocol（stdio / SSE / WebSocket）
- **ScriptMCP** — 在隔离的 `node:vm` 沙箱中执行用户脚本
- **Debug Center** — 实时日志、事件追踪、性能分析
- **多主题 UI** — 多套主题 + 经典 / 现代界面模式
- **下载管理** — 浏览器端与服务端下载队列及配额控制
- **版本管理** — `ordpaw-vm` 让多个 OrdPaw 版本并行安装、切换

## 项目结构

```
ordpaw/
├── packages/
│   ├── client/        # 前端 SPA（TypeScript + Vite，无框架）
│   ├── server/        # 后端（Node.js + Express + WebSocket）
│   ├── shared/        # 共享 TypeScript 类型
│   └── vm/            # 版本管理 CLI（ordpaw-vm）
├── data/              # SQLite 数据库 + 脚本（运行后自动创建）
├── plugins/           # 用户插件目录
└── pnpm-workspace.yaml
```

## 安装

需要 Node.js >= 18 与 pnpm。

```bash
pnpm install
```

安装完成后，`husky` 会自动配置 pre-commit 钩子，对暂存文件执行 lint 与格式化。

## 开发

```bash
# 同时启动前后端
pnpm dev

# 单独启动
pnpm dev:server
pnpm dev:client
```

- 后端：`http://localhost:3000`
- 前端开发服务器：`http://localhost:5173`（代理 `/api` 与 `/ws` 到后端）

### 配置 LLM 服务商

1. 打开 **Settings → API Keys**，为 `openai` 或 `anthropic` 添加 API Key。
2. 或在 **Providers** 中直接编辑并粘贴 Key（保存时会自动混淆）。
3. 创建使用该服务商与模型的 Agent。
4. 开始对话，真实 LLM 响应会通过 WebSocket 流式返回。

对于 OpenAI 兼容端点（如 Ollama、vLLM），在服务商配置中将 `baseUrl` 设为目标地址。

## 测试

```bash
# 运行所有包测试
pnpm test

# 仅服务端 / 客户端
pnpm test:server
pnpm test:client

# 覆盖率（阈值已配置在 vitest.config.ts）
pnpm test:coverage
```

## 类型检查

```bash
pnpm typecheck
```

## 构建

```bash
pnpm build
```

构建产物位于各包的 `dist/` 目录。

## 代码风格

```bash
# 检查
pnpm lint
pnpm format:check

# 自动修复
pnpm lint:fix
pnpm format
```

## 版本管理工具：ordpaw-vm

`ordpaw-vm` 是一个类似 `nvm` 的 OrdPaw 版本管理 CLI，支持多版本安装、切换与共存。

```bash
# 安装指定版本
npx ordpaw-vm install 0.0.3

# 列出已安装版本
npx ordpaw-vm list

# 查看当前激活版本
npx ordpaw-vm current

# 切换版本
npx ordpaw-vm use 0.0.3

# 卸载版本
npx ordpaw-vm uninstall 0.0.3
```

版本库存放在 `~/.ordpaw-vm/versions/<version>/`，当前激活版本通过 `~/.ordpaw-vm/current` 符号链接/记录文件管理。

## 贡献

请参阅 [CONTRIBUTING.md](./CONTRIBUTING.md)。

## 更新日志

请参阅 [CHANGELOG.md](./CHANGELOG.md)。

## License

MIT
