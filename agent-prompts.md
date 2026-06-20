# OrdPaw 外部 Agent 提示词

> 说明：本文件由 Agent 0 生成。用户（代理）请将下方对应章节完整复制，粘贴到第三方 Agent 软件的对话框中执行。
> 流程：Agent 0 → User → 外部 Agent 1 / Agent 2 → User → Agent 0
> 约束：每次最多派发 2 个复杂任务或 16 个简单任务。当前派发 2 个复杂任务。

---

## 通用上下文（复制给每个 Agent）

```
你正在为 OrdPaw 项目工作。工作目录是 /workspace。

项目结构：
- /workspace/packages/shared/src/types.ts —— 共享 TypeScript 类型
- /workspace/packages/client/src/ —— 前端 TypeScript 源码
  - app.ts（应用主入口）
  - api.ts（API 封装）
  - store.ts（客户端状态）
  - animation-manager.ts（动画管理器）
  - styles-modern.css（现代 UI Aurora Edition 样式）
  - views/（各页面视图）
  - components/（侧边栏、抽屉、底部导航等）
  - i18n/zh.ts, i18n/en.ts（翻译）
- /workspace/packages/server/src/ —— 后端 Node/TypeScript 源码
  - api/index.ts（HTTP API 路由入口）
  - ws/handler.ts（WebSocket 处理器）
  - core/（业务核心：agent-runtime, sequence-generator, event-bus 等）

运行验证：
- 前端类型检查：cd /workspace/packages/client && npx tsc --noEmit
- 后端类型检查：cd /workspace/packages/server && npx tsc --noEmit
- 查看 package.json 获取可用的 npm scripts

纪律要求：
1. 修改前先读取相关文件，不要凭记忆假设。
2. 保持现有功能不变，尤其不要破坏 WebSocket 序列执行器和 classic UI 模式。
3. 每个逻辑变更后立即类型检查，不通过不继续。
4. 不要提交 git（用户/Agent 0 会统一处理）。
5. 完成后返回：修改文件清单、关键决策说明、验证结果、遇到的阻塞。
```

---

## Agent 1：下载管理器 + 分散存储（验证、补全与加固）

```
【任务】OrdPaw 下载管理器 + 分散存储系统

【背景】
OrdPaw 需要支持下载以下资源类型：
1. AI 对话（Conversation）
2. AI 生成的程序 / 代码
3. 文件
4. Skills
5. MCP 配置
6. Scripts
7. OrdPaw 源代码

当前 workspace 中可能已经存在一份由其他 Agent 撰写的下载管理器初稿（文件可能包括 /workspace/packages/client/src/download-manager.ts、/workspace/packages/client/src/views/download-manager.ts、/workspace/packages/server/src/core/download-service.ts 等）。你的工作不是从零重写，而是：
1. 先审查现有实现；
2. 对照下方需求补齐缺失能力；
3. 修复 bug 和不合理设计；
4. 确保类型检查通过；
5. 输出审查与修改报告。

【需求清单】
A. 多选与批量下载
  - 在资源列表（对话、Agents、Plugins、Prompts、Scripts、Skills 等视图）支持多选。
  - 提供「下载选中」按钮，一次性发起批量下载任务。
  - 提供全选/取消全选。

B. 资源类型覆盖
  - Conversation：导出为 JSON（含消息、检查点）。复用 /api/export/conversations/:id。
  - AI 生成的程序/代码：在对话消息中识别 code block，支持单条或批量导出为文件。
  - 文件：支持上传/生成的文件下载。
  - Skills：导出 skill 定义 JSON。
  - MCP：导出 MCP 配置 JSON。
  - Scripts：导出 Script 对象（含 code/language）。
  - OrdPaw 源代码：打包 /workspace 为 tar.gz，排除 node_modules/.git/dist/.tmp，通过 /api/download/source 提供下载。

C. 存储位置设置
  - Browser 端存储：支持 IndexedDB / File System Access API / localStorage（降级）。
  - Server 端存储：指定服务端目录（如 ./downloads），后端写入该目录。
  - 在 Settings 中提供「默认存储位置」和「浏览器存储后端」选项。

D. 空间限制
  - 在 Settings 中可设置总空间上限（如 500 MB / 2 GB / 自定义）。
  - 浏览器端写入前检查 estimateUsage / StorageManager；服务端递归计算目录大小。
  - 当 enforce=true 时强制拒绝超出配额的下载。

E. 分散存储（Browser + Server）
  - 每个下载任务可选存储目标（browser/server）。
  - 浏览器端任务由前端 download-manager 队列执行；服务端任务由后端 download-service 队列执行。
  - 两端都支持暂停、恢复、取消、删除。

F. 下载管理 UI
  - 添加独立视图或面板：显示任务列表、进度条、状态、操作按钮。
  - 在 sidebar/mobile-drawer/bottom-nav 添加「下载管理」入口。
  - 提供批量操作（暂停、恢复、取消、删除选中）。

G. 类型与设置
  - 在 /workspace/packages/shared/src/types.ts 补充 DownloadTask、DownloadItem、StorageLocation、StorageQuota、DownloadResourceType 等类型。
  - 扩展 Settings 接口：downloadStorage、browserStorageBackend、storageQuota。
  - 在 client store.ts 提供默认值。
  - 在 settings.ts 视图添加配置卡片。

【验收标准】（硬通过/失败）
1. cd /workspace/packages/client && npx tsc --noEmit 通过。
2. cd /workspace/packages/server && npx tsc --noEmit 通过。
3. 存在前端 DownloadManager 类与服务端 DownloadService，且两者都实现任务队列、暂停/恢复/取消。
4. Settings 页面能看到「下载与存储」配置项，且修改后能持久化（通过现有 updateSettings API）。
5. 至少有一个视图（如 Conversations 或 Scripts）出现「下载选中」按钮并可用。
6. OrdPaw 源代码打包接口 /api/download/source 能生成 tar.gz 并提供下载链接。
7. 浏览器端和服务端都实现配额检查，enforce=true 时超限任务被拒绝并给出明确错误。

【返回格式】
1. 审查结论：现有代码是否满足需求？列出主要 gap。
2. 修改文件清单（含新增/修改）。
3. 关键设计决策（每项 1-2 句话）。
4. 验证结果（类型检查命令输出、手动测试步骤）。
5. 阻塞或需要 Agent 0 决策的问题。
```

---

## Agent 2：UI/UX 动画性能优化 + 设计精良化

```
【任务】OrdPaw 现代 UI 动画性能优化与设计精良化

【背景】
OrdPaw 已有一个「Aurora Edition」现代 UI（/workspace/packages/client/src/styles-modern.css），使用深色极光 + 渐变玻璃 + 流光动效。
用户反馈：
1. 新版 UI/UX 动画性能差；
2. 设计不典雅、不精良。

你需要在不破坏现有 classic 模式和 WebSocket 序列执行器的前提下，优化现代 UI 的动画性能和视觉品质。

【核心文件】
- /workspace/packages/client/src/styles-modern.css
- /workspace/packages/client/src/animation-manager.ts
- /workspace/packages/client/src/app.ts（UI 模式切换逻辑）
- /workspace/packages/client/src/views/settings.ts（动效设置）

【需求清单】
A. 动画性能优化
  1. 审查所有 CSS 动画，将触发重排的属性（width/height/top/left/margin/padding/box-shadow 动画等）改为 transform 和 opacity。
  2. 谨慎使用 will-change：仅在即将动画的元素上添加，动画结束后移除。
  3. 减少同时运行的独立动画数量：极光背景使用单一伪元素或 CSS 变量驱动；避免多个元素同时无限动画。
  4. 对 backdrop-filter 玻璃效果做性能降级：
     - 移动端/低性能设备降低 blur 半径；
     - 提供 CSS 变量开关，可在 JS 中通过 data-reduce-effects="true" 一键降低。
  5. 检查并消除所有残留的 transition: all，替换为显式属性列表。
  6. 对列表、卡片 hover 使用 transform + opacity，不触发重排。

B. 设计精良化
  1. 提升排版层级：统一标题字号阶梯（H1/H2/H3/card-title），增加行高和字间距层次。
  2. 优化色彩和谐：减少高饱和渐变的廉价感，引入更柔和的极光色调；确保深色/浅色主题都典雅。
  3. 精简阴影和发光：从「越多越好」改为「克制点缀」，关键操作才使用 glow。
  4. 统一圆角和间距：建立 4px/8px/12px/16px/24px/32px 间距体系，避免随意数值。
  5. 改进交互状态：hover/focus/active 更细腻，增加微弹簧感（cubic-bezier 0.34,1.56,0.64,1）。
  6. 欢迎区域、统计卡片、按钮、输入框等重点组件重新打磨，提升精致度。

C. 可访问性
  1. 确保所有文本对比度符合 WCAG AA（4.5:1）。
  2. 完整支持 prefers-reduced-motion：所有动画暂停或简化。
  3. Focus-visible 样式清晰且不破坏设计。

D. 设置扩展
  1. 在 Settings 中增加「动效质量」或「性能模式」选项：
     - 高性能模式：减少 blur、降低动画复杂度；
     - 平衡模式（默认）；
     - 高品质模式：完整效果。
  2. 与现有 data-ui-effects="minimal"/"balanced"/"expressive" 协同，避免冲突。

E. 动画管理器
  1. 审查 /workspace/packages/client/src/animation-manager.ts。
  2. 确保 FPS 控制、缓动函数、批量动画不会导致主线程阻塞。
  3. 可选：增加对 Web Animations API 的支持作为高性能路径。

【验收标准】（硬通过/失败）
1. cd /workspace/packages/client && npx tsc --noEmit 通过。
2. classic UI 模式不受影响（切换回 classic 后样式正常）。
3. styles-modern.css 中不存在 transition: all。
4. 所有无限动画仅使用 transform/opacity/filter（filter 动画尽量减少）。
5. prefers-reduced-motion: reduce 下，现代 UI 动画被禁用或简化。
6. 在 Chrome DevTools Performance 面板中，现代 UI 页面不再有由动画导致的 layout/paint 抖动（主观但需截图说明）。
7. 视觉层面： welcome、stats-grid、card、button 等重点组件看起来比之前更精致、不廉价。

【返回格式】
1. 审查结论：当前主要性能问题与设计问题清单。
2. 修改文件清单（含新增/修改）。
3. 关键设计决策（每项 1-2 句话）。
4. 验证结果（类型检查、手动测试、性能截图说明）。
5. 阻塞或需要 Agent 0 决策的问题。
```

---

## 给 Agent 0 的汇总要求

外部 Agent 完成任务后，用户请将以下信息返回给 Agent 0：
1. 每个 Agent 的返回报告（文件清单、验证结果、阻塞）。
2. 是否需要 Agent 0 做最终合并或冲突解决。
3. 是否继续派发下一轮任务。
