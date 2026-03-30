# Backlog — Nice-to-Have Improvements

Features that are not critical but would improve the experience.

## Agent View

- **Image thumbnails in user messages**: When user sends images with a query, display small thumbnails in the user message bubble so they can confirm what was sent. Requires storing image data URLs in the `Message` type and rendering `<img>` elements in MessageList.

## Input

- **File path paste**: When pasting files from Finder/IDE into the textarea, convert to relative file paths (strip project cwd prefix). Currently blocked by clipboard limitations — Electron `File.path` is undefined for IDE-copied files, and `text/uri-list` is not used by all apps.

## Server 模式

- **認證機制**：Server 模式目前無認證，僅限 localhost 使用。需加入認證（token / password）後才能安全地暴露至外部網路，支援遠端連線使用場景。

- **限制 Remote 連線**：Server 應透過 server info 回傳 `allowRemoteConnections` flag，讓 client 決定是否顯示「Add Server」UI。預設 Electron 及 Server mode 皆為 `false`，待認證機制完成後再考慮開放。避免使用者透過 web client 連接其他未授權的 server，同時減少跨版本 protocol 不相容問題。
