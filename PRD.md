# PRD: agent-terminal (CLI-first, GUI-ready)

## 1. 專案概述

agent-terminal — 一個以 Node.js (TypeScript) 開發的 Agent 終端工具，核心目標是提供 **安全的命令審查機制**、**完整的 Agent 互動**、**Session 管理** 等功能。UI 層使用 ink（React for CLI），Agent 整合使用 `@anthropic-ai/claude-agent-sdk` 原生 TypeScript SDK，PTY 管理使用 `node-pty`。

### 1.1 設計原則

- **安全第一**：Permission 審查必須顯示完整命令，不得截斷
- **CLI-first**：所有功能必須在純 terminal 環境下可用
- **Core 與 UI 分離**：核心邏輯不依賴任何 UI 框架
- **原生 SDK 整合**：Claude 使用 Agent SDK（canUseTool 權限回調），其他 Provider 透過 node-pty 包裝 CLI

---

## 2. 系統架構

```
         Agent Provider (可插拔)
           claude-agent-sdk ──┐  ← 原生 SDK，canUseTool 權限回調
           gemini CLI (pty) ──┤  ← node-pty 包裝 CLI
           未來其他 Provider ──┘
                  │
                  │  TypeScript async generator / streaming
                  │
┌─────────────────▼───────────────────────┐
│           Core (TypeScript)              │
│                                          │
│  ┌───────────┐ ┌────────────┐           │
│  │   Agent   │ │ Permission │           │
│  │  Manager  │ │  Manager   │           │
│  └───────────┘ └────────────┘           │
│  ┌───────────┐ ┌────────────┐           │
│  │  Session  │ │ Clipboard  │           │
│  │  Manager  │ │  Handler   │           │
│  └───────────┘ └────────────┘           │
│  ┌───────────┐ ┌────────────┐           │
│  │   Task    │ │   Config   │           │
│  │  Tracker  │ │  Manager   │           │
│  └───────────┘ └────────────┘           │
└──────────┬──────────────────────────────┘
           │
      ┌────▼──────┐
      │    TUI    │  ← ink (React for CLI)
      │  ink +    │
      │  node-pty │  ← 內嵌 PTY Terminal
      └───────────┘
```

Claude 使用 `@anthropic-ai/claude-agent-sdk` 原生 SDK 整合，透過 `canUseTool` 回調實現權限審查。其他 Provider（如 Gemini CLI）透過 `node-pty` 包裝 CLI 子進程。agent-terminal 負責 UI 顯示與 Permission 審查。

### 2.1 Agent Backend 介面（可插拔）

```typescript
// Agent 後端必須實作此介面，不同 provider 各自實作
interface AgentBackend {
  // 發送 prompt 並取得串流回應（async generator）
  query(prompt: string, images?: Image[], opts?: QueryOptions): AsyncGenerator<Message>;
  // 中斷目前執行
  stop(): void;
  // 列出可恢復的 Sessions
  listSessions(cwd: string): Promise<Session[]>;
  // 恢復先前的 Session
  resumeSession(sessionID: string): AsyncGenerator<Message>;
}
```

設定檔選擇 backend：
```toml
[agent]
backend = "claude"    # 或 "gemini", ...
```

| Backend | 說明 | 整合方式 | 依賴 |
|---------|------|---------|------|
| `claude` | Claude Agent SDK 原生整合，canUseTool 權限回調 | `@anthropic-ai/claude-agent-sdk` | Claude Code |
| `gemini` | 包裝 Gemini CLI，透過 node-pty 管理子進程 | `node-pty` | Gemini CLI |
| 其他 | 未來可擴充 | node-pty 或原生 SDK | 視 provider 而定 |

### 2.2 UI 層（ink）

UI 使用 ink（React for CLI）實作，透過 React 元件組合畫面。Core 與 UI 透過 React state/context 溝通，不需額外 Adapter 介面。

```typescript
// 主要 React 元件結構
<App>
  <AgentView>         {/* Agent 對話畫面 */}
    <MessageList />   {/* 訊息串流顯示 */}
    <PermissionPopup />{/* 權限審查彈窗 */}
    <InputArea />     {/* 輸入區 */}
  </AgentView>
  <TerminalView>      {/* 內嵌 PTY Terminal（node-pty） */}
  </TerminalView>
  <StatusLine />      {/* 狀態列 */}
  <ProjectLine />     {/* 專案列 */}
</App>
```

---

## 3. 功能規格

### 3.1 Agent 互動

**核心流程**：
1. 使用者輸入 prompt（可附帶圖片）
2. 透過 AgentBackend 呼叫 LLM API
3. 接收串流回應，即時顯示文字與 thinking blocks
4. 遇到 tool_use → 觸發 Permission 審查
5. 使用者核准後執行工具，回傳結果給 Agent
6. 重複直到 Agent 完成回覆

**API 呼叫方式**：
- Claude：透過 `@anthropic-ai/claude-agent-sdk` 的 `query()` async generator
- 其他 Provider：透過 `node-pty` 包裝 CLI 子進程
- 支援 streaming 即時輸出
- 支援 system prompt preset
- 支援 extended thinking blocks

**訊息類型處理**：

| 類型 | 處理方式 |
|------|---------|
| `text` | 即時串流顯示（Markdown 渲染） |
| `thinking` | 可折疊顯示 |
| `tool_use` | 觸發 Permission 審查 |
| `tool_result` | 更新工具執行結果 |

**中斷處理**：
- 使用者可隨時中斷目前的 Agent 執行
- 中斷後可立即輸入新 prompt
- 被中斷的 prompt 上下文會附加到下一則訊息

### 3.2 Permission 審查系統

> **安全核心**：這是整個系統最關鍵的功能。截斷命令內容等同於讓使用者盲審，可能導致隱藏的危險操作被核准執行。

**審查流程**：
1. Agent 發出 tool_use 請求
2. Core 根據當前 Permission Mode 決定是否需要使用者審查
3. 需要審查 → 透過 `UIAdapter.RequestPermission()` 顯示完整命令
4. 使用者選擇：允許 / 拒絕 / 允許且不再詢問 / 自訂回覆
5. 結果回傳給 Agent 繼續執行

**Permission Modes**：

| Mode | 行為 |
|------|------|
| `default` | 所有工具都需要使用者核准 |
| `acceptEdits` | 檔案讀寫自動核准，Bash/Agent 需要核准 |
| `bypassPermissions` | 全部自動核准（危險模式） |
| `plan` | 唯讀模式，只允許讀取工具 |

**顯示要求**：
- 命令內容**必須完整顯示**，不得截斷
- 長命令使用多行顯示 + 可滾動
- 危險命令（`rm`、`drop`、`--force` 等）應有視覺警告標示
- 顯示工具名稱、完整輸入參數、描述說明

**PermissionRequest 結構**：

```typescript
interface PermissionRequest {
  toolUseId: string;
  toolName: string;           // "Bash", "Edit", "Write" 等
  input: Record<string, any>; // 完整的工具輸入，不截斷
  description: string;        // 工具描述
  riskLevel: RiskLevel;       // safe, warning, danger
}

interface PermissionResponse {
  behavior: "allow" | "deny";
  message?: string;           // 自訂回覆（可選）
  setMode?: string;           // 變更 Permission Mode（可選）
}
```

**Claude Agent SDK 整合**：
- SDK 的 `canUseTool` 回調在 tool_use 發生時觸發
- 回傳 Promise，SDK 會等待 resolve 後才繼續
- agent-terminal 在 `canUseTool` 中顯示 Permission popup，使用者核准後 resolve Promise

**風險分級邏輯**：

```
danger:  Bash 包含 rm/drop/reset --hard/push --force 等
warning: Edit/Write/Task 等修改類工具
safe:    Read/Glob/Grep/WebSearch 等唯讀工具
```

### 3.3 子任務 (Subagent/Task) 追蹤

**追蹤機制**：
- Agent 使用 `Agent` 或 `Task` 工具時，註冊到 active tasks
- 每個 task 記錄：toolUseId、描述、最後進度時間
- 定期健康檢查（45 秒），偵測停滯任務（60 秒無進度）
- 停滯任務標記 `[stalled]`，可由使用者手動停止

**Task 生命週期**：

```
created → running → [stalled] → completed / stopped / error
```

**UI 顯示**：
- 進行中的子任務列表（即時更新）
- 每個任務顯示描述和經過時間
- 支援手動停止單一子任務

### 3.4 Session 管理

**Session 持久化**：
- 每個 Session 有唯一 ID（SDK 層）
- Session 資料持久化到本地 JSON 檔案（`~/.config/agent-terminal/sessions/`）
- 記錄：SDK session ID、對話歷史、metadata（tokens/cost/duration）

**支援操作**：

| 操作 | 說明 |
|------|------|
| Resume | 恢復先前的 Session，載入完整對話歷史 |
| Fork | 從當前 Session 分支出新 Session |
| List | 列出所有可恢復的 Sessions |
| Rest/Wake | 暫停/喚醒 Session 以節省資源 |

**Resume 流程**：
1. 列出可用的 Sessions（根據 cwd 篩選）
2. 使用者選擇要恢復的 Session
3. 載入對話歷史並顯示
4. 後續訊息延續先前對話

**Session Metadata**：

```typescript
interface SessionMetadata {
  sdkSessionId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalCost: number;
  durationMs: number;
  numTurns: number;
  contextPct: number;         // Context window 使用百分比
  permissionMode: string;     // default/acceptEdits/bypass
}
```

**狀態恢復**：

程式關閉時自動儲存，重啟後恢復到上次狀態。

儲存結構：
```
~/.config/agent-terminal/
├── config.toml              # 全域設定（含顯示設定）
├── keybindings.toml         # 快捷鍵設定
├── workspace.json           # 專案列表 + 啟動狀態
└── sessions/
    └── {session-id}.json    # 對話歷史 + metadata
```

**Agent 輸出顯示設定**（`config.toml`）：

```toml
[display]
thinking = "collapsed"      # thinking blocks：collapsed / expanded / hidden
text     = "expanded"       # Assistant 回覆文字：expanded（始終展開）

[display.tool]
# 預設值（未列出的工具套用此設定）
default = "collapsed"

# 依工具類型個別設定
Read    = "collapsed"       # 讀取類：折疊
Glob    = "collapsed"
Grep    = "collapsed"
Write   = "expanded"        # 寫入類：展開（方便審查變更）
Edit    = "expanded"
Bash    = "expanded"
```

- `collapsed`：預設折疊，可手動展開
- `expanded`：預設展開
- `hidden`：完全隱藏（不佔空間）

`workspace.json`：
```json
{
  "projects": [
    { "cwd": "/home/ben/project/my-app", "sessionId": "abc12345" },
    { "cwd": "/home/ben/project/api-server", "sessionId": "def67890" }
  ],
  "activeIndex": 1
}
```

恢復範圍：

| 項目 | 恢復 | 說明 |
|------|------|------|
| 專案列表 | ✓ | 從 workspace.json 載入 |
| Agent session | ✓ | 對話歷史 + metadata + permission mode |
| Status line | ✓ | 從 session metadata 恢復 |
| Terminal 歷史 | ✗ | 開新 shell，不保留 scrollback |

### 3.5 圖片貼上

**支援的輸入方式**：
- 剪貼簿貼上（Ctrl+V 偵測剪貼簿圖片）

**剪貼簿偵測（依平台）**：

| 平台 | 偵測方式 | 取得圖片資料 |
|------|---------|-------------|
| Linux (X11) | `xclip -selection clipboard -t TARGETS` 檢查 `image/png` | `xclip -selection clipboard -t image/png -o` |
| Linux (Wayland) | `wl-paste --list-types` 檢查 `image/png` | `wl-paste --type image/png` |
| macOS | `osascript` 檢查剪貼簿類型 | `pngpaste` 或 `osascript` |
| Windows | `powershell Get-Clipboard -Format Image` | PowerShell 匯出為 temp PNG |

**Ctrl+V 處理流程**：
1. 使用者按 Ctrl+V
2. 檢查剪貼簿是否有 **image data**（截圖、複製圖片內容）
   → 有：讀取 binary → base64 → 附加為圖片附件 → 顯示 `[image attached: {size}]`
3. 檢查剪貼簿是否有**檔案路徑**
   → 是圖片檔（png/jpg/gif/webp）：讀取檔案 → base64 → 附加為圖片附件
   → 是其他檔案：轉為相對路徑貼上（移除當前專案目錄 prefix）
4. 都不是 → 當一般文字貼上

**路徑自動簡化**：
- 當前專案目錄為 `/home/ben/project/my-app` 時
- 貼上 `/home/ben/project/my-app/src/main.go` → 自動轉為 `src/main.go`
- 路徑不在專案目錄內 → 保留完整路徑

**限制**：
- 單則訊息最多 5 張圖片
- 單張圖片不超過 20MB
- 支援格式：PNG、JPEG、GIF、WebP

**圖片預覽**：
- 支援 Kitty Graphics Protocol / iTerm2 / Sixel 的 terminal 可顯示縮圖
- 不支援的 terminal 顯示文字提示 `[image: filename.png (128KB)]`
- 預覽為可選功能，不影響核心流程

### 3.6 狀態列

**顯示項目**：

| 項目 | 說明 |
|------|------|
| Model | 使用中的模型名稱 |
| Tokens | input + output token 數量 |
| Cost | 累計費用（USD） |
| Context % | Context window 使用率 |
| Turns | 對話輪數 |
| Git Branch | 當前 git 分支 |
| Permission Mode | 當前權限模式（default/acceptEdits/bypass） |

**更新機制**：
- 每次收到 message_delta 時更新 token/cost
- Session 結束時更新 duration/turns
- 持久化到本地，重啟後可恢復

### 3.7 專案狀態指示

Project line 上每個專案名稱旁顯示狀態燈號 `●`：

| 顏色 | Agent 狀態 | 說明 |
|------|-----------|------|
| 🟢 綠色 | 閒置 | Agent 回覆完成，等待使用者輸入 |
| 🟡 黃色 | 執行中 | Agent 正在回覆或執行工具 |
| 🔴 紅色 | 需要注意 | 等待 Permission 核准或發生錯誤 |

紅色狀態搭配跨畫面通知，確保使用者在 Terminal 畫面也能注意到。

**底部兩行配色**：
- **Project line**：tmux 風格綠底（`#00875f` 或 ANSI green），白色文字，當前專案反白標示
- **Status line**：深綠底（`#1a3a2a`），灰白色文字，與 project line 區分層次但色系一致
- 狀態燈 `●` 在兩種底色上皆以黃色/紅色標示，閒置時用亮白色（避免綠燈撞綠底）

### 3.8 日誌 (Logging)

**日誌檔位置**：`~/.config/agent-terminal/debug.log`

**日誌分級**：

| 級別 | 用途 |
|------|------|
| `ERROR` | 錯誤（API 失敗、backend 異常等） |
| `WARN` | 警告（rate limit、網路重試等） |
| `INFO` | 一般資訊（session 建立/恢復、backend 切換等） |
| `DEBUG` | 開發除錯（API 請求/回應、tool 執行細節等） |

**規則**：
- 預設級別 `INFO`，可透過設定檔或啟動參數 `--log-level debug` 調整
- TUI 畫面不顯示日誌（避免干擾），全部寫入檔案
- 日誌自動 rotate（超過 10MB 時輪替）

---

## 4. CLI (TUI) 介面規格

**框架**：Node.js + TypeScript + ink (React for CLI) + node-pty

### 4.1 雙畫面架構

程式內嵌兩個全螢幕畫面，一鍵切換：

- **Agent 畫面**：Claude 對話介面
- **Terminal 畫面**：內嵌 PTY shell（使用者的預設 shell）

```
 [Alt+←/→] 切換
 ┌──────────────────────────┐        ┌──────────────────────────┐
 │  Agent 畫面               │        │  Terminal 畫面            │
 │                          │        │                          │
 │  status line             │        │  $ git log --oneline     │
 │  ─────────────────       │   ←→   │  a1b2c3d feat: add xxx   │
 │  Assistant: ...          │        │  d4e5f6g fix: bug yyy    │
 │  ● Bash (running)        │        │  $ _                     │
 │  ─────────────────       │        │                          │
 │  > prompt input_         │        │                          │
 └──────────────────────────┘        └──────────────────────────┘
```

**跨畫面通知**：
- Agent 畫面有 Permission 請求時，Terminal 畫面頂部顯示提示：
  `⚠ [Agent] Permission requested - press Alt+←`
- Agent 完成回覆時，Terminal 畫面頂部短暫提示：
  `✓ [Agent] Response complete`

### 4.2 Agent 畫面佈局

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│  Assistant: 這是回覆內容...                                │
│                                                          │
│  ● Bash (running)                                        │
│    git status                                            │
│                                                          │
│  ┌─ Permission ──────────────────────────────────────┐   │
│  │ Allow this Bash call?                             │   │
│  │                                                   │   │
│  │ git add file1.go file2.go &&                      │   │
│  │ git commit -m "feat: add feature"                 │   │
│  │                                                   │   │
│  │ > [1] Yes                                         │   │
│  │   [2] Yes, don't ask again                        │   │
│  │   [3] No                                          │   │
│  │   [4] Custom response                             │   │
│  └───────────────────────────────────────────────────┘   │
│                                                          │
├──────────────────────────────────────────────────────────┤
│ [image: screenshot.png (45KB)]                           │
│ > 請幫我分析這段程式碼_                                    │
├──────────────────────────────────────────────────────────┤
│ Agent:● Terminal:● | opus | 12k tok | $0.05 | ctx 32% | 5t | main | default │  ← status line
├──────────────────────────────────────────────────────────┤
│ [1:my-app ●] [2:api-server* ●] [3:cli-tool ●]       [Alt+←/→] │  ← project line
└──────────────────────────────────────────────────────────┘
```

### 4.3 Terminal 畫面佈局

```
┌──────────────────────────────────────────────────────────┐
│ ⚠ [Agent] Permission requested - press Alt+←             │  ← 通知列（有事件時才出現）
├──────────────────────────────────────────────────────────┤
│                                                          │
│  $ ls -la                                                │
│  total 48                                                │
│  drwxr-xr-x  12 user staff  384 Mar 25 ...               │
│  -rw-r--r--   1 user staff  210 Mar 25 ...               │
│  $ git status                                            │
│  On branch main                                          │
│  nothing to commit, working tree clean                   │
│  $ _                                                     │
│                                                          │
├──────────────────────────────────────────────────────────┤
│ Agent:● Terminal:● | opus | 12k tok | $0.05 | ctx 32%   │  ← status line
├──────────────────────────────────────────────────────────┤
│ [1:my-app ●] [2:api-server* ●] [3:cli-tool ●] [Alt+←/→] │  ← project line
└──────────────────────────────────────────────────────────┘
```

底部兩行（status line + project line）在 Agent 和 Terminal 畫面間共用，始終可見。

### 4.4 鍵盤操作

**全域（兩個畫面都適用）**：

| 按鍵 | 功能 |
|------|------|
| `Alt+←/→` / `Cmd+←/→`(macOS) | 切換 Agent ↔ Terminal |
| `Alt+1~9` / `Cmd+1~9`(macOS) | 切換到指定專案（對應 project line 編號） |
| `Ctrl+N` | 新增專案（互動式輸入目錄路徑） |
| `Ctrl+W` | 關閉當前專案 |
| `Ctrl+D` | 退出程式 |

**Agent 畫面**：

| 按鍵 | 功能 |
|------|------|
| `Enter` | 送出訊息 / Permission popup 時確認選項 |
| `Ctrl+V` | 貼上（自動偵測文字/圖片，保留多行） |
| `Ctrl+C` | 中斷目前 Agent 執行 |
| `↑/↓` | 捲動對話歷史 / Permission popup 時切換選項 |
| `PgUp/PgDn` | 快速捲動對話歷史（整頁） |
| `1-4` | Permission popup 快速選擇 |
| `/` | 輸入指令 |

**Terminal 畫面**：

| 按鍵 | 功能 |
|------|------|
| 所有按鍵 | 直接傳遞到 PTY shell（透明轉發） |

### 4.5 指令系統

在 Agent 畫面輸入：

| 指令 | 說明 |
|------|------|
| `/resume` | 列出並恢復先前的 Session |
| `/fork` | 從當前 Session 分支 |
| `/sessions` | 列出所有 Sessions |
| `/mode <mode>` | 切換 Permission Mode |
| `/model <name>` | 切換模型 |
| `/config` | 進入設定模式（互動式選單） |
| `/clear` | 清除畫面 |
| `/quit` | 退出 |

**`/config` 設定模式**：

進入後顯示互動式選單，`↑/↓` 切換、`Enter` 進入、`Esc` 返回上層：

```
┌─ Settings ──────────────────────────┐
│                                     │
│ > [agent]     Backend / Model       │
│   [display]   折疊/展開偏好          │
│   [keybindings] 快捷鍵設定           │
│   [appearance]  配色                │
│   [logging]   日誌級別               │
│                                     │
│ Esc: 返回                           │
└─────────────────────────────────────┘
```

修改後即時生效並自動寫入 `config.toml` / `keybindings.toml`。

### 4.6 快捷鍵設定

所有快捷鍵可透過設定檔自訂（`~/.config/agent-terminal/keybindings.toml`）：

程式啟動時根據平台載入對應預設值，使用者可覆蓋：

```toml
[keybindings]
switch_view = "alt+left/right"  # Agent ↔ Terminal 切換（macOS 預設 cmd+left/right）
switch_project = "alt+1~9"     # 切換專案（macOS 預設 cmd+1~9）
new_project = "ctrl+n"         # 新增專案
close_project = "ctrl+w"       # 關閉當前專案
quit = "ctrl+d"                # 退出程式
interrupt = "ctrl+c"           # 中斷 Agent
paste = "ctrl+v"               # 貼上（文字/圖片）
scroll_up = "pgup"             # 捲動對話歷史
scroll_down = "pgdn"           # 捲動對話歷史
```

---

## 5. GUI 介面（預留）

### 5.1 擴充方式

由於核心邏輯以 TypeScript 撰寫，未來可透過 Electron 擴充為 GUI 版本，共用同一份 Core 邏輯：

```typescript
// CLI entry point (ink)
import { render } from 'ink';
const core = new AgentCore(config);
render(<App core={core} />);

// 未來 GUI entry point (Electron)
const core = new AgentCore(config);
// Electron renderer 使用 React + xterm.js
```

### 5.2 GUI 額外功能（未來）

- 拖放圖片
- 檔案瀏覽器面板
- Git Viewer 面板
- 多工作區 tab

---

## 6. 專案結構

```
project-root/
├── src/
│   ├── index.tsx             # CLI entry point (ink render)
│   ├── app.tsx               # 主 App 元件
│   ├── core/
│   │   ├── agent-manager.ts  # Agent Manager - 調度 backend 與 UI
│   │   ├── permission.ts     # Permission Manager - 審查邏輯與風險分級
│   │   ├── session.ts        # Session Manager - 持久化與恢復
│   │   ├── task.ts           # Task Tracker - 子任務追蹤
│   │   ├── clipboard.ts      # Clipboard Handler - 跨平台圖片偵測
│   │   └── config.ts         # Config Manager
│   ├── backend/
│   │   ├── types.ts          # AgentBackend interface 定義
│   │   ├── claude/           # Claude Agent SDK 原生整合
│   │   │   └── backend.ts
│   │   └── gemini/           # Gemini CLI (node-pty) 包裝
│   │       └── backend.ts
│   ├── components/
│   │   ├── agent-view.tsx    # Agent 對話畫面
│   │   ├── terminal-view.tsx # 內嵌 PTY Terminal (node-pty)
│   │   ├── message-list.tsx  # 訊息串流顯示
│   │   ├── permission-popup.tsx # Permission 審查彈窗
│   │   ├── input-area.tsx    # 輸入區
│   │   ├── status-line.tsx   # 狀態列
│   │   └── project-line.tsx  # 專案列
│   └── utils/
│       └── risk-level.ts     # 危險命令偵測
├── package.json
├── tsconfig.json
├── README.md
└── PRD.md
```

---

## 7. 技術選型

| 用途 | 選擇 | 理由 |
|------|------|------|
| 語言 | TypeScript (Node.js) | Claude Agent SDK 原生支援、統一前後端語言 |
| TUI 框架 | ink (React for CLI) | 活躍維護、React 開發模式、元件化 |
| PTY 管理 | node-pty | Microsoft 維護、VS Code 使用、跨平台穩定 |
| Agent SDK | @anthropic-ai/claude-agent-sdk | 原生 canUseTool 權限回調、streaming、session 管理 |
| 持久化 | JSON file | 輕量、無外部依賴 |
| GUI（預留） | Electron | 共用 TypeScript Core、xterm.js 取代 node-pty |
| 設定檔 | TOML | 使用者友善（使用 @iarna/toml） |

---

## 8. 開發階段

> **注意**：專案已從 Go (bubbletea) 重構為 Node.js (TypeScript + ink + node-pty + claude-agent-sdk)。
> 以下為新架構的開發階段。Go 版本的 Phase 1-3 已完成，作為原型驗證。

### Phase 1: Node.js 專案建立 + 核心框架

- [ ] 專案骨架（TypeScript + ink + node-pty）
- [ ] AgentBackend interface 定義
- [ ] Claude backend（@anthropic-ai/claude-agent-sdk 整合，canUseTool 權限回調）
- [ ] Core Agent Manager（串流處理、訊息調度）
- [ ] Permission Manager（風險分級、審查邏輯）
- [ ] ink 雙畫面架構（Agent View + Terminal View）
- [ ] Permission popup 元件
- [ ] 基本輸入區 + 訊息顯示

### Phase 2: UI 完善 + Session 管理

- [ ] Status line + Project line
- [ ] 多專案管理（新增/關閉/切換）
- [ ] 圖片剪貼簿貼上（跨平台）
- [ ] 指令系統（/resume, /fork, /mode, /config 等）
- [ ] 設定檔管理（config.toml + keybindings.toml）
- [ ] Agent 輸出折疊/展開設定
- [ ] Session 持久化（儲存/載入/狀態恢復）
- [ ] Session Resume / Fork / List
- [ ] 子任務追蹤與顯示

### Phase 3: 多 Provider + 強化

- [ ] Gemini backend（node-pty 包裝 Gemini CLI）
- [ ] 危險命令偵測與警告（danger highlighting）
- [ ] Markdown 渲染
- [ ] 跨畫面通知（permission warning + agent done）
- [ ] `/config` 互動式設定選單
- [ ] 自訂快捷鍵系統

### Phase 4: 進階功能

- [ ] Session Rest/Wake（暫停/喚醒以節省資源）
- [ ] Per-project agent config（每個專案可獨立設定 backend/model）
- [ ] Unit tests
- [ ] Electron GUI 版本（預留）

---

## 9. 非目標（明確排除）

- 不做多工作區終端管理（tmux 已經很好）
- 不做內建檔案瀏覽器（CLI 版本用 `ls`/`tree`）
- 不做內建 Git viewer（CLI 版本用 `lazygit`）
- 不做 remote access / WebSocket server
- 不做 snippet manager
- 不做圖片預覽（Kitty/iTerm2/Sixel）— 暫不需要
