# OrdPaw — A powerful AI/Agent client

OrdPaw is a full-stack AI Agent development and debugging platform with a focus on developer UX, plugin extensibility, and protocol interoperability.

## Architecture

```
ordpaw/
├── packages/
│   ├── client/        # Frontend SPA (TypeScript + Vite, no framework)
│   ├── server/        # Backend (Node.js + Express + WebSocket)
│   └── shared/        # Shared TypeScript types
├── data/              # SQLite database + scripts
├── plugins/           # User plugin directory
└── .trae/             # Design documents
```

## Features

- **Agent Workbench** — Build, configure, and manage AI agents
- **Conversation Management** — Session history, checkpoints, time-travel rollback
- **Plugin System** — JavaScript plugins with event-driven hooks
- **Skills Engine** — Pluggable skill definitions with JSON Schema
- **MCP Client** — Model Context Protocol (stdio/SSE/WebSocket)
- **Debug Center** — Real-time logs, event tracing, performance analysis
- **Prompt Library** — Template management with variable interpolation
- **Multi-theme** — Deep Space, Aurora, Cyber themes

## Quick Start

```bash
# Install dependencies
pnpm install

# Start both server and client in dev mode
pnpm dev

# Or start individually
pnpm dev:server
pnpm dev:client
```

## Development

```bash
# Type-check client
cd packages/client && npx tsc --noEmit

# Type-check server
cd packages/server && npx tsc --noEmit
```
