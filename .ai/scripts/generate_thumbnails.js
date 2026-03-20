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
  const projectRoot = path.join(path.dirname(__filename), '..', '..');
  const publicRoot = path.join(projectRoot, 'public');
  const modelsRoot = path.join(publicRoot, 'models');

  // --force flag: regenerate even if thumbnail exists
  // --only=zombie_17,zombie_19: regenerate specific models only
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const onlyArg = args.find(a => a.startsWith('--only='));
  const onlyList = onlyArg ? onlyArg.slice(7).split(',') : null;

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
      if (onlyList && !onlyList.includes(name)) continue;
      const dir = path.join(modelsRoot, name);
      const files = fs.readdirSync(dir);
      
      const outPath = path.join(dir, 'thumbnail.png');
      if (fs.existsSync(outPath) && !force && !onlyList) {
        console.log('Thumbnail exists, skipping:', name);
        continue;
      }

      // Try FBX first, then GLB mesh
      let modelFile = files.find(f => /idle.*\.fbx$/i.test(f)) || files.find(f => /\.fbx$/i.test(f));
      if (!modelFile) {
        // Fall back to GLB mesh file (zombie_N.glb, not animation files)
        modelFile = files.find(f => f === `${name}.glb`);
      }
      if (!modelFile) {
        console.log('no model for', name); continue;
      }

      // Find separate idle animation GLB (zombie_N_idle.glb)
      const idleAnimFile = files.find(f => f === `${name}_idle.glb`);

      const modelPath = `/models/${name}/${modelFile}`;
      let url = `${baseUrl}/thumbnail.html?model=${encodeURIComponent(modelPath)}&size=512`;
      if (idleAnimFile) {
        const animPath = `/models/${name}/${idleAnimFile}`;
        url += `&anim=${encodeURIComponent(animPath)}`;
      }
      console.log('Generating thumbnail for', name, '→', modelFile, idleAnimFile ? `+ ${idleAnimFile}` : '(no idle anim)');

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
