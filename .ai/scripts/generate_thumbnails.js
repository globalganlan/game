import express from 'express';
import path from 'path';
import fs from 'fs';
import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';

async function startServer(root) {
  const app = express();
  app.use(express.static(root));
  const nodeModulesPath = path.join(root, '..', 'node_modules');
  if (fs.existsSync(nodeModulesPath)) {
    app.use('/node_modules', express.static(nodeModulesPath));
  }
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const addr = server.address();
      resolve({server, port: addr.port});
    });
    server.on('error', reject);
  });
}

function writeDataUrlToFile(dataUrl, outPath) {
  const matches = dataUrl.match(/^data:image\/png;base64,(.*)$/);
  if (!matches) throw new Error('unexpected data url');
  const buf = Buffer.from(matches[1], 'base64');
  fs.writeFileSync(outPath, buf);
}

(async ()=>{
  const __filename = fileURLToPath(import.meta.url);
  const projectRoot = path.join(path.dirname(__filename), '..');
  const publicRoot = path.join(projectRoot, 'public');
  const modelsRoot = path.join(publicRoot, 'models');

  if (!fs.existsSync(modelsRoot)) {
    console.error('models folder not found:', modelsRoot);
    process.exit(1);
  }

  const {server, port} = await startServer(publicRoot);
  const baseUrl = `http://localhost:${port}`;
  console.log('Serving', publicRoot, 'on', baseUrl);

  const browser = await puppeteer.launch({headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox']});
  const page = await browser.newPage();

  try {
    const entries = fs.readdirSync(modelsRoot, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const name = e.name;
      if (!/^zombie/i.test(name)) continue;
      const dir = path.join(modelsRoot, name);
      const files = fs.readdirSync(dir);
      
      const outPath = path.join(dir, 'thumbnail.png');
      if (fs.existsSync(outPath)) {
        console.log('Thumbnail exists, skipping:', name);
        continue;
      }

      const fbx = files.find(f => /idle.*\.fbx$/i.test(f)) || files.find(f => /\.fbx$/i.test(f));
      if (!fbx) {
        console.log('no fbx for', name); continue;
      }

      const modelPath = `/models/${name}/${fbx}`;
      const url = `${baseUrl}/thumbnail.html?model=${encodeURIComponent(modelPath)}&size=512`;
      console.log('Generating thumbnail for', name, '→', modelPath);

      page.on('console', msg => console.log('PAGE LOG:', msg.text()));
      page.on('pageerror', err => console.error('PAGE ERROR:', err.toString()));
      page.on('requestfailed', req => console.log('REQUEST FAILED:', req.url(), req.failure() && req.failure().errorText));
      page.on('response', res => {
        if (res.status() >= 400) console.log('RESPONSE', res.status(), res.url());
      });

      await page.goto(url, {waitUntil: 'networkidle2', timeout: 60000});
      // wait for the page to signal readiness
      await page.waitForFunction(() => window.__THUMBNAIL_READY__ === true, {timeout: 60000});
      const dataUrl = await page.evaluate(() => {
        const c = document.querySelector('canvas');
        return c.toDataURL('image/png');
      });

      // outPath is defined at top of loop
      writeDataUrlToFile(dataUrl, outPath);
      console.log('Saved', outPath);
    }
  } catch (err) {
    console.error(err);
  } finally {
    await browser.close();
    server.close();
  }
})();
