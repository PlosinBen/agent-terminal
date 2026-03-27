# CLAUDE.md - Agent Terminal Project Guidelines

## Architecture

- **Monorepo** with npm workspaces: `server/`, `client/`, `shared/`
- **Electron + WebSocket** IPC pattern (not Electron IPC directly)
- Protocol types in `shared/protocol.ts` — duplicated at `server/src/shared/protocol.ts` (keep both in sync)
- Server = Electron main process + WS server; Client = React Vite renderer

## Build & Dev

```bash
# Dev (3 terminals)
npm run dev:server          # tsx watch
npm run dev:client          # vite HMR
VITE_DEV_SERVER_URL=http://localhost:5173 npm run electron

# Production
npm start                   # builds server → launches electron
```

- Server: TypeScript → ES modules (`"module": "nodenext"`)
- Client: Vite + React, alias `@shared` → `../shared`

## Protocol

- All client↔server communication via typed WebSocket messages
- Upstream (client→server): `UpstreamMessage` union in `shared/protocol.ts`
- Downstream (server→client): `DownstreamMessage` union
- When adding new message types, update BOTH `shared/protocol.ts` and `server/src/shared/protocol.ts`

## Backend Provider System

- `server/src/backend/types.ts` defines `AgentBackend` interface
- Primary: `claude/backend.ts` (Claude Agent SDK)
- Secondary: `gemini/backend.ts` (Gemini CLI via node-pty)
- Agent messages streamed as `AsyncGenerator<AgentMessage>`

## Key Patterns

- **Permission flow**: server sends `permission:request` → client shows popup → client sends `permission:response` → server resolves Promise
- **Project sessions**: persisted to `~/.config/agent-terminal/projects/{id}.json`, includes sessionId for agent resumption
- **Multi-project**: each project has its own `AgentBackend` instance managed by `SessionManager`
- **FolderPicker**: in-app directory browser via `folder:list` / `folder:list_result` messages (no native Electron dialog)

## Client Architecture

- `App.tsx`: top-level state, keyboard shortcuts (Ctrl+B/O/W/↑↓)
- `hooks/useWebSocket.ts`: WS connection with `send()` and `onMessage()` pub-sub
- `hooks/useProjects.ts`: per-project state (messages, status, permissions)
- Components: Sidebar, MessageList, InputArea, StatusLine, PermissionPopup, FolderPicker

## Conventions

- Use `requestId` pattern for request-response over WebSocket
- Server-side path resolution: support `~` prefix → `os.homedir()`
- Dot-files sorted after normal entries in directory listings
- Keep UI keyboard-driven: all major actions have shortcuts
- Keybindings: configurable via `client/src/keybindings.ts`, `mod` = Cmd (macOS) / Ctrl (others), persisted in localStorage

## TBD — Remote Connection Support

- Client 和 Server 透過 WebSocket 通訊，架構上可支援遠端連線
- 遠端模式下 Electron 不啟動本地 WS server，僅作為純 client shell
- 需要連線管理層：Local（自動啟動）/ Remote（使用者輸入 host:port）
- 支援 multi-remote：一個 client 可切換不同 server
- 目前先專注本地模式，遠端功能待討論
