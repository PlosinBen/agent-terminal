# Tasks: Multi-Agent Provider Implementation

## Phase 1: Server — Provider Registry

> 把現有 `server/src/backend/` 重構為 `server/src/providers/`，建立 registry pattern。

### Task 1.1: 建立 ProviderDefinition interface
- **檔案**: `server/src/providers/types.ts`（新檔案）
- **內容**:
  ```typescript
  interface ProviderDefinition {
    name: string;
    displayName: string;
    createBackend(opts?: { sessionId?: string }): AgentBackend;
    checkAvailable(): Promise<boolean>;
  }
  ```
- **注意**: `AgentBackend` interface 從舊 `backend/types.ts` 搬過來，加 optional `warmup?`
- **狀態**: [ ]

### Task 1.2: 遷移 Claude provider
- **檔案**: `server/src/providers/claude/`（從 `backend/claude/` 搬遷）
  - `backend.ts` — 搬過來，import path 調整
  - `usage-tracker.ts` — 搬過來
  - `index.ts` — 新增，匯出 `ProviderDefinition`
- **內容**:
  ```typescript
  // index.ts
  export const provider: ProviderDefinition = {
    name: 'claude',
    displayName: 'Claude',
    createBackend: (opts) => new ClaudeBackend(opts),
    checkAvailable: async () => { /* 檢查 SDK / auth */ },
  };
  ```
- **狀態**: [ ]

### Task 1.3: 遷移 Gemini provider
- **檔案**: `server/src/providers/gemini/`（從 `backend/gemini/` 搬遷）
  - `backend.ts` — 搬過來
  - `index.ts` — 新增，匯出 `ProviderDefinition`
- **內容**:
  ```typescript
  export const provider: ProviderDefinition = {
    name: 'gemini',
    displayName: 'Gemini',
    createBackend: () => new GeminiBackend(),
    checkAvailable: async () => { /* 檢查 gemini CLI */ },
  };
  ```
- **狀態**: [ ]

### Task 1.4: 建立 Provider Registry
- **檔案**: `server/src/providers/registry.ts`（新檔案）
- **內容**:
  ```typescript
  import { provider as claude } from './claude/index.js';
  import { provider as gemini } from './gemini/index.js';

  async function initRegistry(): Promise<void>
    // 對每個 provider 跑 checkAvailable()，收集可用清單

  function listProviders(): ProviderDefinition[]
    // 回傳可用 provider

  function getProvider(name: string): ProviderDefinition | undefined
    // 取得單一 provider
  ```
- **狀態**: [ ]

### Task 1.5: 清理舊 `backend/` 目錄
- **內容**: 刪除 `server/src/backend/` 目錄，所有 import 指向新 `providers/`
- **影響檔案**:
  - `server/src/session-manager.ts` → `import type { AgentBackend } from './backend/types.js'`
  - `server/src/handlers/agent-handler.ts` → `import type { PermissionRequest } from '../backend/types.js'`
  - `server/src/handlers/project-handler.ts` → `import { ClaudeBackend } from '../backend/claude/backend.js'`
  - `server/src/core/provider-cache.ts` → `import type { ModelOption, CommandInfo } from '../backend/types.js'`
  - `server/src/__test__/mock-backend.ts` → `import type { ... } from '../backend/types.js'`
  - `server/src/handlers/agent-handler.test.ts` → `import type { AgentMessage } from '../backend/types.js'`
  - `server/src/integration/full-flow.test.ts` → `import type/from '../backend/...'`
- **狀態**: [ ]

---

## Phase 2: RawUsageData 統一 DTO

> `RawUsageData` 全欄位改 optional，讓各 provider 只回報自己有的資料。
> Adapter 邏輯放 server 端各 provider 的 usage-tracker / backend 裡。

### Task 2.1: RawUsageData 欄位改 optional
- **檔案**: `shared/types.ts`
- **內容**:
  ```typescript
  interface RawUsageData {
    costUsd?: number;
    inputTokens?: number;
    outputTokens?: number;
    contextUsedTokens?: number;
    contextWindow?: number;
    numTurns?: number;
    rateLimits?: RateLimitData[];
  }
  ```
- **原則**: 每個 provider 只填自己有的欄位，沒有的留 undefined
- **狀態**: [ ]

### Task 2.2: computeUsageSegments 加 null check
- **檔案**: `client/src/utils/usageSegments.ts`
- **內容**:
  - 每個欄位判斷 `!= null` 才產生對應 segment
  - `costUsd` 有值才顯示 cost
  - `inputTokens` + `outputTokens` 都有才顯示 token 計數
  - `contextWindow` > 0 才顯示 context %
  - `rateLimits` 有值才顯示 rate limit
- **原則**: data-driven，有值就顯示，沒值就跳過
- **狀態**: [ ]

### Task 2.3: Server 端各 provider 確認 adapter 正確
- **檔案**: `server/src/providers/claude/usage-tracker.ts`, `server/src/providers/gemini/backend.ts`
- **內容**:
  - Claude: 維持現有轉換邏輯（已在做 adapter）
  - Gemini: `getRawUsage()` 只回傳有的欄位，其餘不填
- **狀態**: [ ]

---

## Phase 3: Server — 整合 Registry

> 讓 server 啟動時 init registry，project 建立時用 registry 取代 hardcoded backend。

### Task 3.1: Server 啟動時 initRegistry
- **檔案**: `server/src/index.ts`（或 server 進入點）
- **內容**:
  - Server 啟動時呼叫 `await initRegistry()`
  - 在 WebSocket 連線建立時推送 `provider:list`
- **狀態**: [ ]

### Task 3.2: Protocol 加 provider 相關欄位
- **檔案**: `shared/protocol.ts`
- **內容**:
  - 新增 `ProviderListMsg`: `{ type: 'provider:list', providers: { name: string, displayName: string }[] }`
  - `ProjectCreateMsg` 加 `provider?: string`
  - `ProjectCreatedMsg` 的 project 物件加 `provider?: string`, `providerDisplayName?: string`
  - `ProjectListResultMsg` 的 projects 陣列項目加 `provider?: string`, `providerDisplayName?: string`
- **注意**: 全部 optional，向後相容
- **狀態**: [ ]

### Task 3.3: ProjectConfig 加 provider 欄位
- **檔案**: `server/src/core/workspace.ts`
- **內容**:
  - `ProjectConfig` 加 `provider: string`
  - `createProject()` 接收 `provider` 參數，預設 `'claude'`
- **狀態**: [ ]

### Task 3.4: project-handler 改用 registry
- **檔案**: `server/src/handlers/project-handler.ts`
- **內容**:
  - import `getProvider` from `providers/registry`
  - 讀取 `msg.provider ?? 'claude'`
  - `getProvider(provider).createBackend({ sessionId })`
  - warmup 改為 `if (backend.warmup) backend.warmup(cwd)`
  - `project:created` 回傳帶上 `provider`, `providerDisplayName`
- **狀態**: [ ]

### Task 3.5: git-watcher 移除 hardcoded 'claude'
- **檔案**: `server/src/handlers/git-watcher.ts`
- **內容**:
  - `getProviderCache('claude')` → `getProviderCache(session.project.provider)`
- **狀態**: [ ]

### Task 3.6: broadcastStatus 改為 partial update
- **檔案**: `server/src/handlers/git-watcher.ts`
- **內容**:
  - `StatusUpdateMsg` 所有欄位改 optional（`shared/protocol.ts` 同步修改）
  - `broadcastStatus` 改為接收要更新的欄位，只送有變化的：
    ```typescript
    broadcastStatus(session, projectId, wsServer, {
      agentStatus?: AgentStatus,
      usage?: RawUsageData,
      gitBranch?: string,
      providerConfig?: ProviderConfig,
    })
    ```
  - 各呼叫點只傳需要的欄位：
    - query 開始 → `{ agentStatus: 'running' }`
    - query 結束 → `{ agentStatus: 'idle', usage }`
    - permission request → `{ agentStatus: 'attention' }`
    - backend init → `{ providerConfig }`
    - git HEAD 變化 → `{ gitBranch }`
- **狀態**: [ ]

### Task 3.7: Client status merge 改為 partial update
- **檔案**: `client/src/stores/project-store.ts`
- **內容**:
  - `status:update` handler 只更新有帶的欄位，沒帶的保留原值：
    ```typescript
    status: {
      usage: msg.usage ?? ps.status.usage,
      agentStatus: msg.agentStatus ?? ps.status.agentStatus,
      gitBranch: msg.gitBranch ?? ps.status.gitBranch,
    },
    providerConfig: msg.providerConfig ?? ps.providerConfig,
    ```
- **原則**: 與 RawUsageData optional 同一模式 — 有值才更新，沒值保留原狀
- **狀態**: [ ]

---

## Phase 4: Client — Data Model

> Client 加上 provider 欄位，接收 server 下發的 provider 列表。

### Task 4.1: ProjectInfo / SavedProject 加 provider 欄位
- **檔案**: `client/src/types/project.ts`
- **內容**:
  - `ProjectInfo` 加 `provider?: string`, `providerDisplayName?: string`
  - `SavedProject` 加 `provider?: string`, `providerDisplayName?: string`
- **狀態**: [ ]

### Task 4.2: project-store 支援 provider
- **檔案**: `client/src/stores/project-store.ts`
- **內容**:
  - 新增 `availableProviders` state（從 server `provider:list` 接收）
  - `createProject()` 簽名加 `provider`, `providerDisplayName`
  - 建立 ProjectInfo 時帶上 provider 欄位
  - localStorage 載入時 fallback: `provider ?? 'claude'`, `providerDisplayName ?? 'Claude'`
  - 專案重複檢查改為 `cwd + serverHost + provider`（防完全重複）
  - 處理 `provider:list` downstream 訊息
- **狀態**: [ ]

### Task 4.3: agent-service 傳遞 provider
- **檔案**: `client/src/service/agent-service.ts`
- **內容**:
  - `project:create` 訊息加上 `provider: project.provider`
- **狀態**: [ ]

---

## Phase 5: Client — UI

> Project Setup 畫面、StatusLine provider label、Commands 條件顯示。

### Task 5.1: Project Setup 畫面
- **檔案**: `client/src/components/FolderPicker.tsx`（或新元件）
- **內容**:
  - 選完資料夾後跳出 Project Setup 畫面
  - Project Alias（預填資料夾名，可編輯）
  - Agent Provider（下拉選單，內容從 store.availableProviders 讀取）
  - [Create] 按鈕送出
  - `onSelect` callback 簽名改為 `(path, serverHost, provider, alias?)`
- **狀態**: [ ]

### Task 5.2: App.tsx 接收 provider
- **檔案**: `client/src/App.tsx`
- **內容**:
  - 更新 `onSelect` handler 接收並傳遞 `provider` 和 `alias`
- **狀態**: [ ]

### Task 5.3: StatusLine 加 provider label
- **檔案**: `client/src/components/StatusLine.tsx`
- **內容**:
  - App level 區域加唯讀 provider label（在 status dot 之後、git branch 之前）
  - 讀取 `project?.providerDisplayName`
- **狀態**: [ ]

### Task 5.4: Commands 和 StatusLine 條件顯示
- **檔案**: `client/src/commands.ts`, `client/src/components/StatusLine.tsx`
- **內容**:
  - `/model` 僅在 `providerConfig.models.length > 0` 時顯示
  - `/mode` 僅在 `providerConfig.permissionModes.length > 0` 時顯示
  - `/effort` 僅在 `providerConfig.effortLevels.length > 0` 時顯示
  - StatusLine 互動設定區同步加 length 檢查
- **狀態**: [ ]

---

## Phase 6: 相容處理

> 散佈在各 Phase 中同步完成。

### Task 6.1: Server fallback
- **散佈在**: Phase 3 各檔案
- **內容**:
  - `msg.provider ?? 'claude'` — 舊 client 不送 provider 時 fallback
  - `createProject(id, cwd, provider = 'claude')` — 預設參數
- **狀態**: [ ]（隨 Phase 3 一起完成）

### Task 6.2: Client fallback
- **散佈在**: Phase 4 各檔案
- **內容**:
  - localStorage 舊專案無 provider → fallback `'claude'` / `'Claude'`
  - 舊專案無 alias → 維持資料夾名（現有行為，無需改動）
- **狀態**: [ ]（隨 Phase 4 一起完成）

---

## Phase 7: 技術債清理（順手處理）

> 趁這次大改順手處理 BACKLOG 中相關的技術債。

### Task 7.1: Protocol 同步機制
- **檔案**: `server/src/shared/protocol.ts`, `server/tsconfig.json`
- **內容**:
  - 目前 `shared/protocol.ts` 和 `server/src/shared/protocol.ts` 需手動同步
  - 改為 server 直接 import root `shared/` package，消除重複
  - 可能需調整 server 的 tsconfig paths 或 build 設定
- **原因**: Phase 3 要改 `shared/protocol.ts` 加 provider 欄位，如果還維持手動同步會漏改
- **狀態**: [ ]

### Task 7.2: FolderPicker 拆分
- **檔案**: `client/src/components/FolderPicker.tsx`
- **內容**:
  - 目前 FolderPicker 管理 11 個 state vars
  - 趁 Phase 5 加 Project Setup 畫面時一起拆分：
    - `FolderPicker`（container）
    - `ServerPanel`（左側 server 列表）
    - `FolderBrowser`（右側檔案瀏覽）
    - `ProjectSetup`（新增：alias + provider 選擇）
- **原因**: Phase 5 會大改 FolderPicker，一次到位避免改兩次
- **狀態**: [ ]

### Task 7.3: 刪除 dead code
- **檔案**: `client/src/hooks/useProject.ts`, `client/src/hooks/useWebSocket.ts`
- **內容**: 直接刪除，已被 store + connection-manager 取代
- **狀態**: [ ]

---

## 實作順序

```
Phase 7.1 (Protocol 同步) → Phase 1 (provider registry) → Phase 2 (DTO) → Phase 3 (server 整合) → Phase 4 (client data) → Phase 5 (client UI)
     ↑                                                                                                                          ↑
     先解決，避免後續改 protocol 時要同步兩份                            Phase 6 (相容) 散佈在 Phase 3~5 中                    Phase 7.2 (FolderPicker 拆分)
                                                                                                                          Phase 7.3 (dead code) 任意時機
```

## 檔案清單

| 檔案 | 動作 | Phase |
|------|------|-------|
| `server/src/shared/protocol.ts` | 刪除（改為 import root shared） | 7.1 |
| `server/tsconfig.json` | 修改 | 7.1 |
| `server/src/providers/types.ts` | **新增** | 1 |
| `server/src/providers/registry.ts` | **新增** | 1 |
| `server/src/providers/claude/index.ts` | **新增** | 1 |
| `server/src/providers/claude/backend.ts` | 搬遷 | 1 |
| `server/src/providers/claude/usage-tracker.ts` | 搬遷 | 1 |
| `server/src/providers/gemini/index.ts` | **新增** | 1 |
| `server/src/providers/gemini/backend.ts` | 搬遷 | 1 |
| `server/src/backend/` | 刪除 | 1 |
| `server/src/session-manager.ts` | 修改（import path） | 1 |
| `server/src/handlers/agent-handler.ts` | 修改（import path） | 1 |
| `server/src/core/provider-cache.ts` | 修改（import path） | 1 |
| `server/src/__test__/mock-backend.ts` | 修改（import path） | 1 |
| `server/src/handlers/agent-handler.test.ts` | 修改（import path） | 1 |
| `server/src/integration/full-flow.test.ts` | 修改（import path） | 1 |
| `shared/types.ts` | 修改 | 2 |
| `client/src/utils/usageSegments.ts` | 修改 | 2 |
| `server/src/index.ts` | 修改 | 3 |
| `shared/protocol.ts` | 修改 | 3 |
| `server/src/core/workspace.ts` | 修改 | 3 |
| `server/src/handlers/project-handler.ts` | 修改 | 3 |
| `server/src/handlers/git-watcher.ts` | 修改 | 3 |
| `client/src/types/project.ts` | 修改 | 4 |
| `client/src/stores/project-store.ts` | 修改 | 4 |
| `client/src/service/agent-service.ts` | 修改 | 4 |
| `client/src/components/FolderPicker.tsx` | 拆分重構 | 5 + 7.2 |
| `client/src/components/ProjectSetup.tsx` | **新增** | 5 + 7.2 |
| `client/src/components/ServerPanel.tsx` | **新增** | 7.2 |
| `client/src/components/FolderBrowser.tsx` | **新增** | 7.2 |
| `client/src/App.tsx` | 修改 | 5 |
| `client/src/components/StatusLine.tsx` | 修改 | 5 |
| `client/src/commands.ts` | 修改 | 5 |
| `client/src/hooks/useProject.ts` | 刪除 | 7.3 |
| `client/src/hooks/useWebSocket.ts` | 刪除 | 7.3 |

## 新增 Provider checklist

未來新增 provider 只需：
```
1. server/src/providers/xxx/backend.ts   ← 實作 AgentBackend
2. server/src/providers/xxx/index.ts     ← 匯出 ProviderDefinition
3. server/src/providers/registry.ts      ← 加一行 import
4. Client 不用改
```
