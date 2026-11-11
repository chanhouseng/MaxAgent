# MaxAgent 啟動說明

在 Windows 的專案資料夾執行 `npm.cmd start` 開啟桌面工作台。若缺少依賴，先執行 `npm.cmd install`。若已有舊版視窗，先關閉後再重開。Claude CLI 可在工作台設定，亦可透過 `MAXAGENT_CLAUDE_CLI` 指定；Codex CLI 使用 PATH，亦可透過 `MAXAGENT_CODEX_CLI` 指定。

舊三工具唯讀看板：執行 `node server.js`，開啟 http://127.0.0.1:7760/。它是監看備援。

產品需求已移到 [01-PRD](01-PRD.md)；當前進度和實際驗證結果見 [04-實作記錄與進度](04-實作記錄與進度.md)。專案文件入口見 [AGENTS.md](../AGENTS.md)。
