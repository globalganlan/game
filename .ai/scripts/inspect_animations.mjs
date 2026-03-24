/**
 * 批次讀取所有模型動畫的 clip 名稱和 duration
 * 用法: node .ai/scripts/inspect_animations.mjs
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

const app = express();
app.use(express.static(publicRoot));
app.use('/node_modules', express.static(path.join(projectRoot, 'node_modules')));
const server = await new Promise(resolve => {
  const s = app.listen(0, () => resolve(s));
});
const port = server.address().port;
const baseUrl = `http://localhost:${port}`;

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
const page = await browser.newPage();

const ANIM_TYPES = ['idle', 'attack', 'hurt', 'dying', 'run'];

const dirs = fs.readdirSync(modelsRoot, { withFileTypes: true })
  .filter(d => d.isDirectory() && /^zombie_\d+$/.test(d.name))
  .sort((a, b) => parseInt(a.name.replace('zombie_', '')) - parseInt(b.name.replace('zombie_', '')));

const allResults = [];

for (const dir of dirs) {
  const name = dir.name;
  const files = fs.readdirSync(path.join(modelsRoot, name));

  for (const animType of ANIM_TYPES) {
    const fileName = `${name}_${animType}.glb`;
    if (!files.includes(fileName)) {
      allResults.push({ modelId: name, animType, exists: false });
      continue;
    }

    const url = `${baseUrl}/anim-inspect.html?model=${name}&anim=${animType}`;
    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      await page.waitForFunction(() => window.__INSPECT_DONE__ === true, { timeout: 15000 });
      const report = await page.evaluate(() => window.__ANIM_REPORT__);
      allResults.push({ ...report, exists: true });
    } catch (err) {
      allResults.push({ modelId: name, animType, exists: true, error: err.message });
    }
  }
}

await browser.close();
server.close();

// Output formatted table
console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
console.log('║                        動畫 Clip 名稱 & Duration 總表                      ║');
console.log('╠══════════════════════════════════════════════════════════════════════════════╣');

let currentModel = '';
for (const r of allResults) {
  if (r.modelId !== currentModel) {
    currentModel = r.modelId;
    console.log(`\n── ${currentModel} ──`);
  }
  if (!r.exists) {
    console.log(`  ${r.animType.padEnd(8)} ❌ 缺少檔案`);
  } else if (r.error) {
    console.log(`  ${r.animType.padEnd(8)} ⚠️ ${r.error}`);
  } else {
    console.log(`  ${r.animType.padEnd(8)} clip="${r.clipName}"  dur=${r.duration}s  tracks=${r.trackCount}  bones=${r.boneCount}`);
  }
}

// Summary: group by clipName to detect which Mixamo animations are used
console.log('\n\n═══ Mixamo 動畫使用統計 ═══');
const clipNameMap = {};
for (const r of allResults) {
  if (!r.clipName) continue;
  const key = `${r.animType}: ${r.clipName}`;
  if (!clipNameMap[key]) clipNameMap[key] = [];
  clipNameMap[key].push(r.modelId);
}
for (const [key, models] of Object.entries(clipNameMap).sort()) {
  console.log(`  ${key.padEnd(50)} → ${models.length} models: ${models.join(', ')}`);
}
