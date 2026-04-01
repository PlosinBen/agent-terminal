# PRD: Multi-Agent Provider Support

## 概述

讓每個專案在建立時可以選擇使用哪個 Agent Provider（Claude、Gemini、未來更多），取代目前 hardcoded Claude 的做法。

## 背景

目前 server 端在建立專案時直接 `new ClaudeBackend()`，不支援其他 provider。雖然已有 `AgentBackend` interface 和 Gemini stub，但缺乏動態選擇機制。

## 設計決策（已確認）

| 項目 | 決策 | 原因 |
|------|------|------|
| Provider 綁定方式 | 綁定專案，建立時選擇，不支援中途切換 | 避免 session 遷移等複雜問題 |
| Auth 管理 | 不碰，各 provider 自行透過 CLI/env vars 處理 | 降低複雜度，安全性更好 |
| 同資料夾限制 | 不限制，可開多個專案（同/不同 provider 都可以） | 保持簡單 |
| Sidebar 顯示 | 暫不改，不加 provider tag | 先做核心功能 |
| 舊專案相容 | alias fallback 資料夾名，provider fallback `"claude"` | 不破壞既有使用者 |
| Status Line | App level 新增唯讀 provider label；Provider level 各自定義 | 已有分層架構 |

## 使用者流程

```
FolderPicker 選資料夾
  → Project Setup 畫面
      ├─ Project Alias（預填資料夾名稱，可編輯）
      ├─ Agent Provider（下拉選單，內容由 server 下發）
      └─ [Create] 按鈕
  → Server 根據 provider 建立對應 backend
  → 進入對話畫面
```

## Status Line 顯示

```
App Level:      [● idle] [Claude] [main]        ← provider 為唯讀標籤
Provider Level: [sonnet] [default] [high] [ctx 45%] [12k+5k] [$0.08] [5h: 32%]
                 ↑ 只顯示該 provider 有回傳的欄位
```

- Client 的 Status Line 是 data-driven，不含 provider-specific 邏輯
- 有 models 陣列 → 顯示 model selector；有 cost → 顯示 cost；以此類推
- 互動邏輯同理：models.length > 1 才能 click to cycle

## 核心架構

### Provider 知識分佈

```
Server 端（集中所有 provider 知識）：
  server/src/providers/
    ├─ types.ts              ← ProviderDefinition interface
    ├─ registry.ts           ← 收集、健康檢查、對外 API
    ├─ claude/
    │   ├─ index.ts          ← meta + createBackend
    │   ├─ backend.ts        ← AgentBackend 實作
    │   └─ usage-tracker.ts
    └─ gemini/
        ├─ index.ts
        └─ backend.ts

Client 端（零 provider 知識）：
  - 不需要 providers/ 資料夾
  - Provider 列表由 server 下發（provider:list）
  - displayName 由 server 下發，client 存在 ProjectInfo 裡
  - Status Line / Commands 全部 data-driven，根據有無資料決定顯示
```

### 職責分離

| 層 | 負責 | 不負責 |
|----|------|--------|
| **Server** | provider 是誰（meta: name, displayName）、能不能用（checkAvailable）、建立 backend（createBackend）、回報 ProviderConfig + RawUsageData、將原始數據轉為統一 DTO | UI 顯示邏輯 |
| **Client** | 拿到什麼就顯示什麼、有選項才能互動、格式化用通用規則 | 任何 provider-specific 判斷 |

### 資料 DTO 原則

`RawUsageData` 作為 server → client 的統一 DTO，所有欄位為 optional：
- 每個 provider 的 adapter（在 server 端）只填自己有的欄位
- Client 的 `computeUsageSegments()` 對每個欄位做 null check，有值就顯示
- 不同 provider 即使同一個欄位的原始計算方式不同（如 context %），由 server 端 adapter 統一轉換後再下發

### Partial Update 原則

`status:update` 訊息所有欄位為 optional，統一事件但內容可選：
- Server 只送有變化的欄位（例如 query 開始只送 `{ agentStatus: 'running' }`）
- Client 收到後只更新有帶的欄位，沒帶的保留原值
- 與 RawUsageData optional 同一模式：有值才更新，沒值保留原狀

```
觸發點              送出的欄位
query 開始          { agentStatus: 'running' }
query 結束          { agentStatus: 'idle', usage }
permission request  { agentStatus: 'attention' }
backend init        { providerConfig }
git HEAD 變化       { gitBranch }
```

### Server Provider Registry

```typescript
// server/src/providers/types.ts
interface ProviderDefinition {
  name: string;                    // key
  displayName: string;             // UI 顯示名稱
  createBackend(opts?): AgentBackend;
  checkAvailable(): Promise<boolean>;  // 啟動時健康檢查
}

// server/src/providers/registry.ts
initRegistry()      → 啟動時對每個 provider 跑 checkAvailable()
listProviders()     → 回傳可用的 ProviderDefinition[]
getProvider(name)   → 取得單一 provider
```

### 資料流

```
Server 啟動
  → initRegistry()
  → claude: checkAvailable() ✅
  → gemini: checkAvailable() ❌
  → availableProviders = [claude]

Client 連線
  → server 推送 provider:list [{ name: 'claude', displayName: 'Claude' }]
  → client 存到 store

使用者建立專案
  → Project Setup 顯示可用 provider（從 store 讀）
  → 選 claude → project:create { provider: 'claude' }
  → server: getProvider('claude').createBackend()
  → project:created { provider: 'claude', providerDisplayName: 'Claude' }
  → client 存 provider + displayName 到 ProjectInfo
```

### Client Data-Driven 顯示原則

```
Status Line:
  ProviderConfig.models.length > 0       → 顯示 model selector
  ProviderConfig.permissionModes.length > 0  → 顯示 mode selector
  ProviderConfig.effortLevels.length > 0 → 顯示 effort selector
  usage.totalCost !== undefined          → 顯示 cost
  usage.rateLimits?.length > 0           → 顯示 rate limits
  usage.contextWindow !== undefined      → 顯示 context %

Commands:
  同上邏輯，有選項才註冊對應 command

互動:
  models.length > 1                      → click to cycle
  permissionModes.length > 1             → click to cycle
  effortLevels.length > 1               → click to cycle
```

### 新增 Provider 的步驟

```
1. server/src/providers/xxx/backend.ts   ← 實作 AgentBackend
2. server/src/providers/xxx/index.ts     ← 匯出 ProviderDefinition
3. server/src/providers/registry.ts      ← 加一行 import
4. Client 不用改
```

## 不在範圍內

- 中途切換 provider
- API key 管理 UI
- Provider 專屬設定面板
- Sidebar provider tag
- 跨 provider session 遷移
