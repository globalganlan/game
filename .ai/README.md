# .ai/ — AI 知識庫與開發工具

> 本目錄整合所有 AI 輔助開發相關資源，供 Copilot / AI 助手自動參考。

## 目錄結構

| 子目錄 | 用途 |
|--------|------|
| `agents/` | AI 團隊角色定義（11 位角色的提示詞 + 調度規則） |
| `docs/` | 技術文件（FBX→GLB 轉換、大頭照生成、Mixamo 指南等） |
| `memory/` | 跨對話持久化記憶（changelog / decisions / dev-status / backlog） |
| `scripts/` | 工具腳本（模型轉換、QA 測試、資料生成） |
| `specs/` | 遊戲規格文件（模組化、有版本控制、有衝突偵測） |
| `qa_screenshots/` | QA 自動化測試截圖輸出（已 .gitignore） |

## 快速入口

- **新對話啟動** → 讀取 `memory/dev-status.md` + `specs/README.md`
- **收到需求** → 讀取 `agents/README.md` 判斷啟動哪些角色
- **改動程式碼** → 同步更新 `specs/` 對應文件
- **完成任務** → 更新 `memory/changelog.md`
