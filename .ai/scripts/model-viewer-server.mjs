/**
 * model-viewer-server.mjs — 啟動模型預覽器的本地伺服器
 *
 * 用法：node .ai/scripts/model-viewer-server.mjs
 *
 * 啟動 Express 伺服器，同時提供 public/ 靜態檔案和 node_modules/，
 * 然後自動在瀏覽器中打開模型預覽頁面。
 */

import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const PUBLIC_ROOT = path.join(PROJECT_ROOT, 'public');
const NODE_MODULES = path.join(PROJECT_ROOT, 'node_modules');

const app = express();

// 靜態檔案
app.use(express.static(PUBLIC_ROOT));
app.use('/node_modules', express.static(NODE_MODULES));

// 啟動伺服器
const PORT = parseInt(process.argv[2] || '0', 10); // 0 = 隨機 port
const server = app.listen(PORT, () => {
  const addr = server.address();
  const url = `http://localhost:${addr.port}/model-viewer.html`;
  console.log(`\n🧟 英雄模型預覽器`);
  console.log(`   ${url}\n`);
  console.log(`   按 Ctrl+C 關閉伺服器\n`);

  // 自動開啟瀏覽器
  const openCmd = process.platform === 'win32' ? 'start'
    : process.platform === 'darwin' ? 'open' : 'xdg-open';
  exec(`${openCmd} ${url}`);
});
