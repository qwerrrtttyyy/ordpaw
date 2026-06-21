# OrdPaw v0.0.3 完整实现 Spec

## Why

将 OrdPaw 从原型阶段推进到可维护的 v0.0.3 版本：通过组件服务器统一 UI 构建方式，针对不同操作系统优化视觉/动画体验，提升 API 健壮性与类型安全，并提供一套精致典雅的界面样式系统。

## What Changes

- 新增前端组件服务器，支持组件注册、挂载、动画、事件和组件树管理
- 新增后端组件服务器 REST API，支持组件注册、插件注销、组件树查询
- 新增多操作系统（macOS/Windows/Linux/iOS/Android）检测与差异化样式/动画参数
- 重构客户端 API 层：统一请求/响应结构、引入 `ErrorCode` 与 `OrdPawApiError`、缓存与并发去重
- 新增/扩展 `styles-elegant.css`，提供色彩、排版、阴影、按钮、卡片、动画、OS 覆盖等完整设计系统
- 统一所有子包版本号为 `0.0.3`
- 调整测试目录结构并补充组件/API 测试

## Impact

- Affected specs: 组件系统、API 客户端、主题/OS 适配、UI 样式
- Affected code:
  - packages/client/src/component-server.ts
  - packages/client/src/component-loader.ts
  - packages/client/src/api.ts
  - packages/client/src/utils.ts
  - packages/client/src/styles/styles-elegant.css
  - packages/server/src/core/component-server.ts
  - packages/server/src/api/index.ts
  - packages/shared/src/types.ts
  - 各 package.json / tsconfig.json

## ADDED Requirements

### Requirement: 前端组件服务器

The system SHALL provide a client-side component server that:

- Registers components (HTML+CSS/JS) with optional animation metadata
- Mounts/unmounts components into DOM elements
- Applies OS-specific animation curves and durations
- Emits lifecycle events (before-mount, after-mount, before-unmount, after-unmount)
- Tracks parent-child relationships to build a component tree

### Requirement: 后端组件服务器

The system SHALL provide server-side component APIs that:

- Accept component registrations from plugins via POST /api/components/register
- Allow unregistering a plugin's components via DELETE /api/components/plugins/:name
- Expose GET /api/components/manifest, /tree, /relationships, /plugins
- Persist component relationships and rebuild the component tree

### Requirement: 多操作系统效果适配

The system SHALL detect client OS and apply differentiated visual effects:

- macOS: 20px blur, 12px radius, spring easing, 380ms duration
- iOS: 24px blur, 14px radius, fluid easing, 320ms duration
- Windows: 10px blur, 6px radius, snappy easing, 220ms duration
- Linux: 15px blur, 9px radius, linear-ease, 300ms duration
- Android: 12px blur, 8px radius, material easing, 260ms duration

### Requirement: 统一 API 错误处理

The system SHALL classify HTTP and network errors using `ErrorCode`:

- network, parse, timeout, bad_request, unauthorized, forbidden, not_found, conflict, rate_limited, server, unknown
- Custom `OrdPawApiError` SHALL carry status, code, and optional details
- API cache SHALL support TTL and request deduplication

### Requirement: 典雅化界面样式系统

The system SHALL provide a reusable CSS design system in styles-elegant.css:

- Color palette with background, text, and accent variables
- Typography scale and utility classes
- Card, button, input, tag, status, progress, spinner, avatar components
- Entrance animations and stagger delays
- Dark mode support via [data-theme="dark"]
- OS-specific refinements

## MODIFIED Requirements

### Requirement: API Client

The existing `API` class SHALL be refactored to:

- Use a single `request<T>` helper with AbortController timeout
- Parse JSON error bodies and surface `error`/`message`/`details`
- Invalidate cache precisely after mutations
- Expose component server endpoints

## REMOVED Requirements

None.
