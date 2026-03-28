# Agent Terminal

Electron + WebSocket 架構的 AI Agent 終端，支援多專案管理、即時串流回應、權限審查與內嵌終端機。

## 架構

```
client/ (Vite + React)          shared/
  App.tsx                         protocol.ts (typed messages)
  components/
    Sidebar, MessageList,       server/ (Node.js + Electron main)
    InputArea, PermissionPopup,   backend/
    FolderPicker, Terminal,         claude/  (Agent SDK)
    StatusLine                      gemini/  (CLI via node-pty)
  hooks/                          handlers/
    useProjects, useTerminal        agent, permission, pty,
  service/                          project, folder, git-watcher
    AgentService,                 session-manager.ts
    ConnectionManager             ws-server.ts
```

- **Monorepo**：npm workspaces（`server/`、`client/`、`shared/`）
- **通訊**：所有 Client ↔ Server 通訊透過 typed WebSocket messages
- **Protocol**：`shared/protocol.ts` 定義 `UpstreamMessage` / `DownstreamMessage` union types

## 功能

- **Agent 對話** — 串流回應、thinking blocks 合併、Markdown 渲染
- **Rich Message Formatting** — 回合分組顯示、per-tool 格式化（side-by-side diff、code blocks、todo list）
- **Tool Result 轉發** — Read 工具顯示檔案內容、路徑自動去除專案前綴
- **Permission 審查** — per-tool 人類可讀格式（diff view、command、file preview）
- **多專案管理** — Sidebar 切換、FolderPicker 選擇專案目錄
- **內嵌終端機** — PTY Terminal（node-pty），Agent / Terminal 雙 tab 切換
- **鍵盤操作** — 可自訂快捷鍵，scope-based keyboard 管理
- **遠端連線** — 支援連接多個 remote server

## 開發

```bash
# Dev（3 個終端）
npm run dev:server          # tsx watch
npm run dev:client          # vite HMR
VITE_DEV_SERVER_URL=http://localhost:5173 npm run electron

# Production
npm start                   # builds server → launches electron
```

## 技術選型

| 用途 | 選擇 |
|------|------|
| 語言 | TypeScript |
| UI | React + Vite |
| 桌面殼 | Electron |
| 通訊 | WebSocket（typed protocol） |
| Agent SDK | @anthropic-ai/claude-agent-sdk |
| PTY | node-pty |
| Markdown | react-markdown + remark-gfm |

## 專案結構

```
server/src/
├── main.ts                     Electron main process entry
├── standalone.ts               Standalone HTTP+WS server mode
├── ws-server.ts                WebSocket server
├── session-manager.ts          Multi-project session management
├── server-core.ts              Server initialization
├── backend/
│   ├── types.ts                AgentBackend interface
│   ├── claude/backend.ts       Claude Agent SDK integration
│   └── gemini/backend.ts       Gemini CLI via node-pty
├── handlers/
│   ├── agent-handler.ts        Agent query, stop, permission
│   ├── project-handler.ts      Project create/list
│   ├── pty-handler.ts          PTY spawn/input/resize
│   ├── folder-handler.ts       Directory listing for FolderPicker
│   └── git-watcher.ts          Git status broadcasting
└── shared/protocol.ts          Protocol types (server copy)

client/src/
├── App.tsx                     Top-level state, keyboard shortcuts
├── components/
│   ├── Sidebar.tsx             Project list with status indicators
│   ├── MessageList.tsx         Turn-based message grouping
│   ├── InputArea.tsx           Auto-resize textarea, IME support
│   ├── PermissionPopup.tsx     Per-tool formatted permission UI
│   ├── FolderPicker.tsx        In-app directory browser
│   ├── Terminal.tsx            Embedded PTY terminal (xterm.js)
│   ├── StatusLine.tsx          Model/tokens/cost/git info
│   └── messages/
│       ├── MarkdownBlock.tsx   Markdown rendering
│       ├── ThinkingBlock.tsx   Collapsible thinking blocks
│       └── ToolCallBlock.tsx   Per-tool renderers (diff, code, todo)
├── hooks/
│   ├── useProjects.ts          Per-project message state
│   ├── useTerminal.ts          xterm.js lifecycle
│   └── useKeyboardScope.ts     Scoped keyboard event management
├── service/
│   ├── agent-service.ts        WebSocket + event routing
│   └── connection-manager.ts   Multi-server connection with reconnect
└── services/
    └── keyboard.ts             Global keyboard service (capture phase)

shared/
└── protocol.ts                 Typed WebSocket message definitions
```

## 參考專案

- [better-agent-terminal](https://github.com/tony1223/better-agent-terminal) — Electron + Agent SDK 參考實作
- [opencode](https://github.com/anomalyco/opencode) — Terminal-based AI agent 參考實作
