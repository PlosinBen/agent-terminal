# agent-terminal

以 Node.js (TypeScript) 開發的 Agent 終端工具，提供安全的命令審查機制、完整的 Agent 互動與 Session 管理。

## 設計原則

- **安全第一** — Permission 審查必須顯示完整命令，不得截斷
- **CLI-first** — 所有功能在純 terminal 環境下可用
- **Core 與 UI 分離** — 核心邏輯不依賴任何 UI 框架
- **原生 SDK 整合** — Claude 使用 Agent SDK（canUseTool 權限回調），其他 Provider 透過 node-pty 包裝 CLI

## 架構

```
Agent Provider (可插拔)                 UI
  claude-agent-sdk ──┐                 ink (React for CLI)
  gemini CLI (pty) ──┤                       │
  未來其他 Provider ──┘                       │
          │                                  │
          └──────── Core (TypeScript) ───────┘
                 Agent Manager
                 Permission Manager
                 Session Manager
                 Task Tracker
                 Clipboard Handler
                 Config Manager
```

- **Claude**：透過 `@anthropic-ai/claude-agent-sdk` 原生整合，`canUseTool` 回調實現權限審查
- **其他 Provider**：透過 `node-pty` 包裝 CLI 子進程（如 Gemini CLI）

## 功能

- **Agent 互動** — 串流回應、thinking blocks、Markdown 渲染、中斷機制
- **Permission 審查** — 風險分級 (safe/warning/danger)、危險關鍵字標示、四種權限模式
- **跨畫面通知** — Permission 請求 / Agent 完成時通知
- **雙畫面** — Agent 畫面 + 內嵌 PTY Terminal (node-pty)，一鍵切換
- **Session 管理** — 持久化、Resume / Fork / List
- **子任務追蹤** — 停滯偵測、生命週期管理
- **圖片貼上** — 跨平台剪貼簿偵測
- **多專案管理** — project line 切換

## 專案結構

```
src/
├── index.tsx                    CLI entry point (ink render)
├── app.tsx                      主 App 元件（多專案、雙畫面、權限流程）
├── core/
│   ├── permission.ts            風險分級邏輯 (safe/warning/danger)
│   ├── session.ts               Session 持久化（save/load/list）
│   ├── task.ts                  子任務追蹤（停滯偵測）
│   ├── config.ts                設定檔讀寫
│   ├── commands.ts              指令系統（/help, /mode, /resume 等）
│   ├── keybindings.ts           快捷鍵設定（平台預設值）
│   ├── clipboard.ts             跨平台剪貼簿偵測
│   ├── workspace.ts             專案管理
│   └── logger.ts                日誌系統（auto-rotate, 10MB）
├── backend/
│   ├── types.ts                 AgentBackend interface
│   ├── claude/
│   │   └── backend.ts           Claude Agent SDK（canUseTool 權限回調）
│   └── gemini/
│       └── backend.ts           Gemini CLI（node-pty 包裝）
├── components/
│   ├── input-area.tsx           文字輸入區
│   ├── message-list.tsx         訊息列表（折疊/展開、Markdown）
│   ├── permission-popup.tsx     權限審查彈窗
│   ├── terminal-view.tsx        內嵌 PTY Terminal（node-pty）
│   ├── status-line.tsx          狀態列（model/tokens/cost/git）
│   ├── project-line.tsx         專案列（狀態燈號）
│   ├── notification-bar.tsx     跨畫面通知
│   └── task-list.tsx            子任務列表
└── utils/
    ├── markdown.ts              Markdown 渲染（marked + marked-terminal）
    └── risk-level.ts            危險關鍵字高亮
```

## 開發環境

```bash
npm install
npm run dev
```

## 技術選型

| 用途 | 選擇 |
|------|------|
| 語言 | TypeScript (Node.js) |
| TUI 框架 | ink (React for CLI) |
| PTY 管理 | node-pty |
| Agent SDK | @anthropic-ai/claude-agent-sdk |
| 持久化 | JSON file |
| 設定檔 | TOML |
| GUI (預留) | Electron |

## 參考

- `refer/go-prototype/` — Go 版原型（bubbletea，Phase 1-3 已完成）
- `refer/better-agent-terminal/` — Electron + Agent SDK 參考專案
