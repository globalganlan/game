/**
 * 批次截圖每個模型的所有動畫（40% 進度幀），輸出到 qa_screenshots/
 * 用法: node .ai/scripts/screenshot_animations.mjs [--only=zombie_3,zombie_14]
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
const outDir = path.join(projectRoot, 'qa_screenshots', 'animations');

const args = process.argv.slice(2);
const onlyArg = args.find(a => a.startsWith('--only='));
const onlyList = onlyArg ? onlyArg.slice(7).split(',') : null;

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

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
await page.setViewport({ width: 512, height: 512 });

const ANIM_TYPES = ['idle', 'attack', 'hurt', 'dying', 'run'];

const dirs = fs.readdirSync(modelsRoot, { withFileTypes: true })
  .filter(d => d.isDirectory() && /^zombie_\d+$/.test(d.name))
  .sort((a, b) => parseInt(a.name.replace('zombie_', '')) - parseInt(b.name.replace('zombie_', '')));

for (const dir of dirs) {
  const name = dir.name;
  if (onlyList && !onlyList.includes(name)) continue;
  const files = fs.readdirSync(path.join(modelsRoot, name));

  for (const animType of ANIM_TYPES) {
    const fileName = `${name}_${animType}.glb`;
    if (!files.includes(fileName)) continue;

    const url = `${baseUrl}/anim-inspect.html?model=${name}&anim=${animType}`;
    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      await page.waitForFunction(() => window.__INSPECT_DONE__ === true, { timeout: 15000 });

      const outPath = path.join(outDir, `${name}_${animType}.png`);
      await page.screenshot({ path: outPath, clip: { x: 0, y: 0, width: 512, height: 512 } });
      console.log(`Saved ${name}_${animType}.png`);
    } catch (err) {
      console.error(`Error ${name}_${animType}: ${err.message}`);
    }
  }
}

await browser.close();
server.close();
console.log(`\nDone! Screenshots in: ${outDir}`);
