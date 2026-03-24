/**
 * search_mixamo_catalog.mjs — 搜尋 Mixamo 動畫建立完整目錄
 * 用法: node .ai/scripts/search_mixamo_catalog.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIXAMO_API = 'https://www.mixamo.com/api/v1';

function loadToken() {
  const text = fs.readFileSync(path.join(__dirname, 'hero-gen.env'), 'utf-8');
  const m = text.match(/MIXAMO_TOKEN=(.+)/);
  return m[1].trim();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function extractModelId(thumbnail) {
  const m = thumbnail && thumbnail.match(/motions\/(\d+)\//);
  return m ? Number(m[1]) : null;
}

const SEARCHES = [
  // === IDLE ===
  'zombie idle', 'breathing idle', 'fighting idle', 'guard idle',
  'alert idle', 'standing idle', 'defensive idle', 'sword idle',
  'creature idle', 'floating idle',
  // === ATTACK ===
  'sword slash', 'sword attack', 'claw attack', 'creature attack',
  'ground slam', 'ground smash', 'ninja attack', 'stab',
  'dagger attack', 'punch combo', 'kick combo', 'magic attack',
  'fireball', 'bite attack', 'monster attack', 'heavy punch',
  'cross punch', 'hook punch', 'palm strike',
  // === HURT ===
  'hit reaction', 'getting hit', 'standing react', 'stumble backward',
  'big hit', 'damage reaction',
  // === DYING ===
  'dying backward', 'dramatic death', 'death fall', 'zombie death',
  'creature death', 'falling death',
  // === RUN ===
  'sprint forward', 'heavy run', 'creature run', 'jog forward',
  'run forward', 'zombie walk',
];

async function main() {
  const token = loadToken();
  const headers = {
    'Authorization': `Bearer ${token}`,
    'X-Api-Key': 'mixamo2',
    'X-Requested-With': 'XMLHttpRequest',
    'Accept': 'application/json',
  };

  const catalog = {};

  for (const query of SEARCHES) {
    console.log(`🔍 "${query}"...`);
    try {
      const params = new URLSearchParams({ page: '1', limit: '15', order: '', type: 'Motion', query });
      const r = await fetch(`${MIXAMO_API}/products?${params}`, { headers });
      
      if (r.status === 429) {
        console.log('  ⏳ Rate limited, waiting 30s...');
        await sleep(30000);
        continue;
      }
      if (!r.ok) {
        console.log(`  ❌ ${r.status}`);
        continue;
      }
      
      const data = await r.json();
      const results = (data.results || []).slice(0, 8);
      const items = [];
      
      for (const prod of results) {
        const modelId = extractModelId(prod.thumbnail);
        if (!modelId) continue;
        items.push({
          modelId,
          name: prod.description || prod.name || query,
          duration: prod.duration || null,
        });
      }
      
      catalog[query] = items;
      console.log(`  → ${items.length} 結果: ${items.map(i => `${i.name}(${i.modelId})`).join(', ')}`);
    } catch (e) {
      console.log(`  ❌ ${e.message}`);
    }
    await sleep(800);
  }

  // 輸出完整目錄
  const outPath = path.join(__dirname, 'mixamo_catalog.json');
  fs.writeFileSync(outPath, JSON.stringify(catalog, null, 2));
  console.log(`\n📋 完整目錄已寫入: ${outPath}`);
  console.log(`共 ${Object.keys(catalog).length} 類, ${Object.values(catalog).flat().length} 個動畫`);
}

main().catch(e => { console.error('❌', e); process.exit(1); });
