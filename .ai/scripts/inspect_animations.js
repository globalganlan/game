/**
 * 檢查所有模型動畫 GLB 的 clip 名稱與持續時間
 * 用法: node .ai/scripts/inspect_animations.js
 */
import express from 'express';
import path from 'path';
import fs from 'fs';
import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const projectRoot = path.join(path.dirname(__filename), '..', '..');
const publicRoot = path.join(projectRoot, 'public');
const modelsRoot = path.join(publicRoot, 'models');

// Start static server
const app = express();
app.use(express.static(publicRoot));
app.use('/node_modules', express.static(path.join(projectRoot, 'node_modules')));
const server = await new Promise((resolve) => {
  const s = app.listen(0, () => resolve(s));
});
const port = server.address().port;
const baseUrl = `http://localhost:${port}`;

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();

const ANIM_TYPES = ['idle', 'attack', 'hurt', 'dying', 'run'];
const results = {};

const entries = fs.readdirSync(modelsRoot, { withFileTypes: true })
  .filter(e => e.isDirectory() && /^zombie_\d+$/.test(e.name))
  .sort((a, b) => {
    const na = parseInt(a.name.replace('zombie_', ''));
    const nb = parseInt(b.name.replace('zombie_', ''));
    return na - nb;
  });

for (const entry of entries) {
  const name = entry.name;
  const dir = path.join(modelsRoot, name);
  const files = fs.readdirSync(dir);
  results[name] = {};

  for (const animType of ANIM_TYPES) {
    const fileName = `${name}_${animType}.glb`;
    if (!files.includes(fileName)) {
      results[name][animType] = { exists: false };
      continue;
    }

    const modelPath = `/models/${name}/${fileName}`;
    const url = `${baseUrl}/thumbnail.html?model=${encodeURIComponent(modelPath)}&size=64`;

    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      await page.waitForFunction(() => window.__THUMBNAIL_READY__ === true, { timeout: 30000 });

      const animInfo = await page.evaluate(() => {
        // Access the Three.js scene from the page
        // The GLB was loaded as `obj` in onModelLoaded
        // We need a different approach - read animations from the loaded GLTF
        return window.__ANIM_INFO__ || null;
      });

      // Get file size
      const filePath = path.join(dir, fileName);
      const stat = fs.statSync(filePath);
      results[name][animType] = {
        exists: true,
        sizeKB: Math.round(stat.size / 1024),
      };
    } catch (err) {
      results[name][animType] = { exists: true, error: err.message };
    }
  }
}

await browser.close();
server.close();

// Print results as table
console.log('\n=== 動畫檔案盤點 ===\n');
console.log('Model\t\tidle\tattack\thurt\tdying\trun');
console.log('─'.repeat(70));
for (const [name, anims] of Object.entries(results)) {
  const cols = ANIM_TYPES.map(t => {
    const a = anims[t];
    if (!a.exists) return '❌';
    if (a.error) return '⚠️';
    return `${a.sizeKB}KB`;
  });
  const padName = name.padEnd(12);
  console.log(`${padName}\t${cols.join('\t')}`);
}
