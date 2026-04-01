# Agent Terminal

Electron + WebSocket 架構的 AI Agent 終端，支援多專案管理、多 Agent Provider、即時串流回應、權限審查與內嵌終端機。

## 架構

```
client/ (Vite + React)          shared/
  App.tsx                         protocol.ts (typed messages)
  components/
    Sidebar, MessageList,       server/ (Node.js + Electron main)
    InputArea, PermissionPopup,   providers/
    FolderPicker, FolderBrowser,    claude/  (Agent SDK)
    ServerPanel, ProjectSetup,      gemini/  (CLI via node-pty)
    Terminal, StatusLine,           mock/    (E2E testing)
    SettingsPanel                   registry.ts
  stores/                        handlers/
    project-store,                  agent, permission, pty,
    server-store                    project, folder, git-watcher
  service/                       session-manager.ts
    AgentService,                ws-server.ts
    ConnectionManager
```

- **Monorepo**：npm workspaces（`server/`、`client/`、`shared/`）
- **通訊**：所有 Client ↔ Server 通訊透過 typed WebSocket messages
- **Protocol**：`shared/protocol.ts` 定義 `UpstreamMessage` / `DownstreamMessage` union types

## 功能

- **多 Agent Provider** — 可擴展的 Provider 架構（Claude、Gemini），專案建立時選擇 Provider
- **Agent 對話** — 串流回應、thinking blocks 合併、Markdown 渲染
- **Rich Message Formatting** — 回合分組顯示、per-tool 格式化（side-by-side diff、code blocks、todo list）
- **Tool Result 轉發** — Read 工具顯示檔案內容、路徑自動去除專案前綴
- **Permission 審查** — per-tool 人類可讀格式（diff view、command、file preview）
- **多專案管理** — Sidebar 切換、FolderPicker 選擇專案目錄
- **內嵌終端機** — PTY Terminal（node-pty），Agent / Terminal 雙 tab 切換
- **鍵盤操作** — 可自訂快捷鍵，scope-based keyboard 管理

## 安裝

```bash
curl -fsSL https://raw.githubusercontent.com/PlosinBen/agent-terminal/main/install.sh | bash
```

macOS 首次開啟需解除 Gatekeeper 限制：
```bash
xattr -cr "/Applications/Agent Terminal.app"
```

啟動時會自動檢查更新，下載完成後於下次啟動時套用。

## 開發

```bash
# Dev（3 個終端）
npm run dev:server          # tsx watch
npm run dev:client          # vite HMR
VITE_DEV_SERVER_URL=http://localhost:5173 npm run electron

# Production
npm start                   # builds server → launches electron

# 測試
npm test                    # Vitest 單元/整合測試
npm run test:e2e            # Playwright E2E 測試（自動啟動 mock server）
npm run test:e2e:headed     # E2E 有頭模式（看得到瀏覽器操作）
npm run test:all            # 全部測試
```

### E2E 測試

E2E 測試使用 Playwright + Mock Provider，獨立 port 不影響開發環境：

| 服務 | Dev | E2E |
|------|-----|-----|
| Server | 9100 / 19100 | 19200 |
| Client | 5173 | 5174 |

使用 `AGENT_PROVIDERS=mock` 環境變數啟動 mock provider，不需要真實 LLM API。

## 技術選型

| 用途 | 選擇 |
|------|------|
| 語言 | TypeScript |
| UI | React + Vite |
| 桌面殼 | Electron |
| 狀態管理 | Zustand |
| 通訊 | WebSocket（typed protocol） |
| Agent SDK | @anthropic-ai/claude-agent-sdk |
| PTY | node-pty |
| Markdown | react-markdown + remark-gfm |
| E2E 測試 | Playwright |
| 單元測試 | Vitest |

## 專案結構

```
server/src/
├── main.ts                     Electron main process entry
├── standalone.ts               Standalone HTTP+WS server mode
├── ws-server.ts                WebSocket server
├── session-manager.ts          Multi-project session management
├── server-core.ts              Server initialization
├── providers/
│   ├── types.ts                AgentBackend / ProviderDefinition interfaces
│   ├── registry.ts             Provider discovery & AGENT_PROVIDERS filtering
│   ├── claude/
│   │   ├── index.ts            Claude provider definition
│   │   └── backend.ts          Claude Agent SDK integration
│   ├── gemini/
│   │   ├── index.ts            Gemini provider definition
│   │   └── backend.ts          Gemini CLI via node-pty
│   └── mock/
│       └── index.ts            Mock provider for E2E testing
├── handlers/
│   ├── agent-handler.ts        Agent query, stop, permission
│   ├── project-handler.ts      Project create/list
│   ├── pty-handler.ts          PTY spawn/input/resize
│   ├── folder-handler.ts       Directory listing for FolderPicker
│   └── git-watcher.ts          Git status broadcasting
├── core/
│   ├── provider-cache.ts       In-memory provider config cache
│   └── workspace.ts            Project config management
└── shared/protocol.ts          Protocol types (server copy)

client/src/
├── App.tsx                     Layout composition, keyboard shortcuts, UI state
├── components/
│   ├── Sidebar.tsx             Project list with status indicators
│   ├── MessageList.tsx         Turn-based message grouping
│   ├── InputArea.tsx           Auto-resize textarea, IME support
│   ├── PermissionPopup.tsx     Per-tool formatted permission UI
│   ├── FolderPicker.tsx        In-app directory browser (container)
│   ├── FolderBrowser.tsx       Folder list with navigation and filter
│   ├── ServerPanel.tsx         Server list with add/remove/switch
│   ├── ProjectSetup.tsx        Project name + provider selection dialog
│   ├── Terminal.tsx            Embedded PTY terminal (xterm.js)
│   ├── StatusLine.tsx          Provider/model/tokens/cost/git info
│   ├── SettingsPanel.tsx       Keybindings, Appearance, Display settings
│   └── messages/
│       ├── MarkdownBlock.tsx   Markdown rendering
│       ├── ThinkingBlock.tsx   Collapsible thinking blocks
│       └── ToolCallBlock.tsx   Per-tool renderers (diff, code, todo)
├── stores/
│   ├── project-store.ts        Project CRUD, per-project messages/status (Zustand)
│   └── server-store.ts         Server list, providers, WS connection lifecycle (Zustand)
├── hooks/
│   ├── useTerminal.ts          xterm.js lifecycle
│   └── useKeyboardScope.ts     Scoped keyboard event management
├── service/
│   ├── agent-service.ts        WebSocket + event routing
│   └── connection-manager.ts   Multi-server connection with reconnect
├── services/
│   └── keyboard.ts             Global keyboard service (capture phase)
├── keybindings.ts              Configurable keybinding definitions
└── settings.ts                 App settings (appearance, display modes)

e2e/
├── playwright.config.ts        Playwright config (isolated ports)
└── tests/
    ├── app-startup.spec.ts     App layout and initial state
    ├── project-creation.spec.ts  Project creation flow
    ├── provider-selection.spec.ts  Provider selection UI
    └── sidebar.spec.ts         Sidebar operations

shared/
└── protocol.ts                 Typed WebSocket message definitions
```

## 參考專案

- [better-agent-terminal](https://github.com/tony1223/better-agent-terminal) — Electron + Agent SDK 參考實作
- [opencode](https://github.com/anomalyco/opencode) — Terminal-based AI agent 參考實作
