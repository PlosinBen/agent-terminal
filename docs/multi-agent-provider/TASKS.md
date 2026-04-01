# Tasks: Multi-Agent Provider Implementation

## Phase 1: Server — Provider Registry

> 把現有 `server/src/backend/` 重構為 `server/src/providers/`，建立 registry pattern。

### Task 1.1: 建立 ProviderDefinition interface
- **檔案**: `server/src/providers/types.ts`（新檔案）
- **狀態**: [x] ✅ Done

### Task 1.2: 遷移 Claude provider
- **檔案**: `server/src/providers/claude/`（從 `backend/claude/` 搬遷）
- **狀態**: [x] ✅ Done

### Task 1.3: 遷移 Gemini provider
- **檔案**: `server/src/providers/gemini/`（從 `backend/gemini/` 搬遷）
- **狀態**: [x] ✅ Done

### Task 1.4: 建立 Provider Registry
- **檔案**: `server/src/providers/registry.ts`（新檔案）
- **狀態**: [x] ✅ Done

### Task 1.5: 清理舊 `backend/` 目錄
- **內容**: 刪除 `server/src/backend/` 目錄，所有 import 指向新 `providers/`
- **狀態**: [x] ✅ Done

---

## Phase 2: RawUsageData 統一 DTO

> `RawUsageData` 全欄位改 optional，讓各 provider 只回報自己有的資料。

### Task 2.1: RawUsageData 欄位改 optional
- **檔案**: `shared/types.ts`
- **狀態**: [x] ✅ Done

### Task 2.2: computeUsageSegments 加 null check
- **檔案**: `client/src/utils/usageSegments.ts`
- **狀態**: [x] ✅ Done

### Task 2.3: Server 端各 provider 確認 adapter 正確
- **檔案**: `server/src/providers/claude/usage-tracker.ts`, `server/src/providers/gemini/backend.ts`
- **狀態**: [x] ✅ Done

---

## Phase 3: Server — 整合 Registry

> 讓 server 啟動時 init registry，project 建立時用 registry 取代 hardcoded backend。

### Task 3.1: Server 啟動時 initRegistry
- **檔案**: `server/src/standalone.ts`, `server/src/server-core.ts`, `server/src/ws-server.ts`
- **內容**:
  - Server 啟動時呼叫 `await initRegistry()`（top-level await）
  - WsServer 新增 `onConnect(handler)` callback
  - `createServerCore()` 在 `onConnect` 中推送 `provider:list` 給每個新 client
- **狀態**: [x] ✅ Done

### Task 3.2: Protocol 加 provider 相關欄位
- **檔案**: `shared/protocol.ts`
- **內容**:
  - 新增 `ProviderListMsg`
  - `ProjectCreateMsg` 加 `provider?: string`
  - `ProjectCreatedMsg` 加 `provider?`, `providerDisplayName?`
  - `ProjectListResultMsg` 加 `provider?`
  - `StatusUpdateMsg` 所有欄位改 optional
- **狀態**: [x] ✅ Done

### Task 3.3: ProjectConfig 加 provider 欄位
- **檔案**: `server/src/core/workspace.ts`
- **狀態**: [x] ✅ Done

### Task 3.4: project-handler 改用 registry
- **檔案**: `server/src/handlers/project-handler.ts`
- **狀態**: [x] ✅ Done

### Task 3.5: git-watcher 移除 hardcoded 'claude'
- **檔案**: `server/src/handlers/git-watcher.ts`
- **狀態**: [x] ✅ Done

### Task 3.6: broadcastStatus 改為 partial update
- **檔案**: `server/src/handlers/git-watcher.ts`, `server/src/handlers/agent-handler.ts`
- **狀態**: [x] ✅ Done

### Task 3.7: Client status merge 改為 partial update
- **檔案**: `client/src/stores/project-store.ts`
- **狀態**: [x] ✅ Done

---

## Phase 4: Client — Data Model

> Client 加上 provider 欄位，接收 server 下發的 provider 列表。

### Task 4.1: ProjectInfo / SavedProject 加 provider 欄位
- **檔案**: `client/src/types/project.ts`
- **內容**: `provider?: string` 加到 `ProjectInfo` 和 `SavedProject`
- **狀態**: [x] ✅ Done

### Task 4.2: project-store 支援 provider
- **檔案**: `client/src/stores/project-store.ts`
- **內容**:
  - `createProject()` 接收 `provider` 和 `name` 參數
  - `connectProject()` 從 server 回應更新 provider
  - 持久化包含 `provider` 欄位
- **狀態**: [x] ✅ Done

### Task 4.3: agent-service 傳遞 provider
- **檔案**: `client/src/service/agent-service.ts`
- **內容**: `project:create` 訊息加上 `provider: project.provider`
- **狀態**: [x] ✅ Done

### Task 4.4: Server store 接收 provider:list
- **檔案**: `client/src/stores/server-store.ts`, `client/src/service/types.ts`
- **內容**:
  - 新增 `AvailableProvider` type 和 `providers` state
  - 新增 `ProviderList` service event
  - agent-service 路由 `provider:list` 訊息
  - server-store 訂閱事件更新 `providers`
- **狀態**: [x] ✅ Done

---

## Phase 5: Client — UI

> Project Setup 畫面、StatusLine provider label。

### Task 5.1: Project Setup 畫面
- **檔案**: `client/src/components/ProjectSetup.tsx`（新元件）, `ProjectSetup.css`
- **內容**:
  - FolderPicker 選完資料夾後跳出 ProjectSetup 對話框
  - 設定 Project Name（預填資料夾名）+ Agent Provider（從 server 下發的可用清單）
  - Enter 確認，Escape 取消
- **狀態**: [x] ✅ Done

### Task 5.2: App.tsx 接收 provider
- **檔案**: `client/src/App.tsx`
- **內容**:
  - FolderPicker → setPendingProject → ProjectSetup → createProject(cwd, host, provider, name)
  - StatusLine 接收 `providers` prop
- **狀態**: [x] ✅ Done

### Task 5.3: StatusLine 加 provider label
- **檔案**: `client/src/components/StatusLine.tsx`, `StatusLine.css`
- **內容**:
  - 在 status label 和 git branch 之間顯示 provider display name
  - 從 `providers` prop 解析 display name
- **狀態**: [x] ✅ Done

### Task 5.4: Sidebar 加 provider 指示
- **檔案**: `client/src/components/Sidebar.tsx`, `Sidebar.css`
- **內容**: 非 claude 的 provider 在專案資料夾名後顯示 `(provider)` 標示
- **狀態**: [x] ✅ Done

### Task 5.5: Commands 條件顯示
- **檔案**: `client/src/commands.ts`
- **內容**: 已為 data-driven 架構，`buildCommandList()` 根據 `providerConfig` 動態建構
- **狀態**: [x] ✅ Done（原始設計已滿足，無需額外修改）

---

## Phase 6: 相容處理

> 散佈在各 Phase 中同步完成。

### Task 6.1: Server fallback
- **內容**: `msg.provider ?? 'claude'`，`createProject(id, cwd, provider = 'claude')`
- **狀態**: [x] ✅ Done（隨 Phase 3 完成）

### Task 6.2: Client fallback
- **內容**: `provider ?? 'claude'` 在 createProject 中預設
- **狀態**: [x] ✅ Done（隨 Phase 4 完成）

---

## Phase 7: 技術債清理

### Task 7.1: Protocol 同步機制
- **檔案**: `server/package.json`
- **內容**: Build script 加 `cp ../shared/*.ts src/shared/` 前置步驟
- **狀態**: [x] ✅ Done

### Task 7.2: FolderPicker 拆分
- **內容**:
  - `ProjectSetup` 已獨立為新元件 ✅
  - `ServerPanel` / `FolderBrowser` 進一步拆分可延後（FolderPicker 345 行，尚可管理）
- **狀態**: [x] ✅ Partially done — ProjectSetup 已抽離

### Task 7.3: 刪除 dead code
- **檔案**: `client/src/hooks/useProject.ts`, `client/src/hooks/useWebSocket.ts`
- **狀態**: [x] ✅ Done（已在先前的重構中刪除）

---

## 完成摘要

所有 Phase 1–7 任務已完成。實作涵蓋：

1. **Provider Registry Pattern** — 集中在 `server/src/providers/` 目錄
2. **RawUsageData DTO** — 全欄位 optional，data-driven 顯示
3. **Server 整合** — registry init、partial status updates、provider:list 推送
4. **Client Data Model** — ProjectInfo/SavedProject 加 provider、server-store 管理 available providers
5. **Client UI** — ProjectSetup 對話框、StatusLine provider label、Sidebar provider 指示
6. **向後相容** — 舊 client/舊專案 fallback to 'claude'

## 新增 Provider checklist

未來新增 provider 只需：
```
1. server/src/providers/xxx/backend.ts   ← 實作 AgentBackend
2. server/src/providers/xxx/index.ts     ← 匯出 ProviderDefinition
3. server/src/providers/registry.ts      ← 加一行 import
4. Client 不用改（data-driven）
```
