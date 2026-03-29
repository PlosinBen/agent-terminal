# Refactoring Plan

## 1. 拆解 FolderPicker — 左右職責分離

**現狀：** FolderPicker 一個元件管 11 個 state、server 連線狀態追蹤、add form、folder 瀏覽、keyboard scope。

**方案：** 拆成三個元件：

```
FolderPicker (容器，管 layout + 左右協調)
├── ServerPanel (左側)
│   ├── server list + 連線狀態
│   ├── add server form
│   └── server 切換 callback
└── FolderBrowser (右側)
    ├── path + filter + entries
    ├── keyboard navigation
    └── loading overlay
```

ServerPanel 和 FolderBrowser 各自管自己的 local state，透過 FolderPicker 容器傳遞 `activeHost` 協調。

如果已有 Server Store，ServerPanel 可以直接讀 store，不需要 props 傳遞。

---

## 2. 消除 Prop Drilling

**現狀：** App → FolderPicker 傳 8 個 props。

**方案：** Stores 取代大部分 callback props。Sidebar 已完成（直接讀 useProjectStore）。

保留少數「純 UI」props（如 `visible`），但 data + actions 從 stores 取。

---

## 3. 清理未使用的程式碼

- `hooks/useProject.ts` — 未被使用，已被 `useProjects.ts` 取代
- `hooks/useWebSocket.ts` — 未被使用，已被 `service/connection-manager.ts` 取代

確認無引用後刪除。

---

## 4. Server 啟動模式分離（Full / Agent-only）

**現狀：** `standalone.ts` 強制 HTTP+WS 綁定。遠端 Linux CLI 環境只需要 WS，不需要 HTTP serve 靜態檔。

**方案：** 提供兩種啟動模式。

```bash
# Full mode（預設）：HTTP + WS，瀏覽器可直連
node server/dist/standalone.js

# Agent-only mode：只跑 WS，適合遠端 headless
node server/dist/standalone.js --agent-only
```

### 改動

| 檔案 | 改動 |
|------|------|
| `server/src/standalone.ts` | 根據 `--agent-only` flag 或 `AGENT_ONLY` env 決定模式 |
| Agent-only mode | 只建 `WsServer.start(port)`，不建 HTTP server |
| Full mode | 現有行為不變（HTTP + WS 同 port） |

### 注意事項

- Agent-only mode 需保留 `WsServer.start()` method
- Electron client 連 remote agent-only server 時，FolderPicker 瀏覽的是 remote 檔案系統（正確行為）

---

## 執行順序建議

| 階段 | 項目 | 影響範圍 | 說明 |
|------|------|----------|------|
| 1 | 拆 FolderPicker | FolderPicker | UI 拆分 |
| 2 | 消除 Prop Drilling | FolderPicker 等 | 收攏 props |
| 3 | 刪除未使用程式碼 | 低風險 | 收尾 |
| 4 | Server 啟動模式分離（Full / Agent-only） | standalone.ts | 遠端部署支援 |
