/**
 * test_working_ids.mjs — 大規模測試 Mixamo 可用的 model-ID
 * 
 * 搜尋多種動畫類型，逐一測試 export 是否成功
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API = 'https://www.mixamo.com/api/v1';

function loadToken() {
  const text = fs.readFileSync(path.join(__dirname, 'hero-gen.env'), 'utf-8');
  return text.match(/MIXAMO_TOKEN=(.+)/)[1].trim();
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// 搜尋關鍵字 — 覆蓋我需要的所有動畫類型
const QUERIES = [
  // IDLE (需要 6+ 種以上)
  'zombie idle', 'mutant idle', 'creature idle', 'fight idle', 'combat idle', 'guard idle',
  'twitching idle', 'scratching idle', 'looking around',
  // ATTACK (需要 20+ 種以上)
  'zombie attack', 'zombie headbutt', 'zombie swipe', 'claw attack',
  'elbow strike', 'cross punch', 'hook punch', 'uppercut',
  'roundhouse kick', 'front kick', 'spinning kick', 'capoeira kick',
  'dagger stab', 'knife attack', 'casting spell', 'magic attack',
  'slam ground', 'roar', 'body slam',
  // HURT (需要 5+ 種)
  'hit reaction rifle', 'big hit', 'stumble', 'zombie flinch',
  // DYING (需要 5+ 種)
  'dying impact', 'dying forward', 'dying backward', 'dying falling', 'zombie death falling',
  // RUN (需要 5+ 種)
  'zombie run', 'mutant run', 'zombie walk', 'run forward rifle', 'jog forward',
];

async function main() {
  const token = loadToken();
  const h = {
    'Authorization': `Bearer ${token}`,
    'X-Api-Key': 'mixamo2',
    'X-Requested-With': 'XMLHttpRequest',
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  };

  // Use Mutant as test character
  const charId = 'cccc84b6-d072-4972-99da-75c5702e25f6';
  
  console.log('Setting primary character...');
  await fetch(`${API}/characters/update_primary`, {
    method: 'POST', headers: h,
    body: JSON.stringify({ primary_character_id: charId }),
  });
  await sleep(2000);

  const working = [];
  const failing = [];

  for (const query of QUERIES) {
    console.log(`\n🔍 "${query}"...`);
    
    // Search - get up to 5 results
    const r = await fetch(`${API}/products?` + new URLSearchParams({ page: '1', limit: '5', type: 'Motion', query }), { headers: h });
    if (r.status === 429) { console.log('  ⏳ Rate limited, wait 30s'); await sleep(30000); continue; }
    if (!r.ok) { console.log(`  ❌ ${r.status}`); continue; }
    
    const d = await r.json();
    const results = (d.results || []).slice(0, 3); // Test top 3

    for (const prod of results) {
      const mid = Number(prod.thumbnail?.match(/motions\/(\d+)\//)?.[1]);
      if (!mid) continue;
      const name = prod.description || prod.name;

      // Try export
      const er = await fetch(`${API}/animations/export`, {
        method: 'POST', headers: h,
        body: JSON.stringify({
          gms_hash: [{ 'model-id': mid, mirror: false, trim: [0, 100], overdrive: 0, params: '0,0', 'arm-space': 0, inplace: false }],
          preferences: { format: 'fbx7_2019', skin: 'false', fps: '30', reducekf: '0' },
          character_id: charId, type: 'Motion', product_name: name,
        }),
      });

      if (er.status !== 202) {
        console.log(`  ❌ ${name} (${mid}) HTTP ${er.status}`);
        failing.push({ mid, name, query });
        await sleep(1000);
        continue;
      }

      // Wait for result
      let ok = false;
      for (let i = 0; i < 12; i++) {
        await sleep(2500);
        const mr = await fetch(`${API}/characters/${charId}/monitor`, { headers: h });
        const m = await mr.json();
        if (m.status === 'completed') { ok = true; break; }
        if (m.status === 'failed') break;
      }

      if (ok) {
        console.log(`  ✅ ${name} (${mid})`);
        working.push({ mid, name, query });
      } else {
        console.log(`  ❌ ${name} (${mid})`);
        failing.push({ mid, name, query });
      }
      await sleep(500);
    }
  }

  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log(`✅ Working: ${working.length}`);
  for (const w of working) {
    console.log(`  ${w.mid} — ${w.name} [${w.query}]`);
  }
  console.log(`\n❌ Failing: ${failing.length}`);
  for (const f of failing) {
    console.log(`  ${f.mid} — ${f.name} [${f.query}]`);
  }

  // Save results
  const out = path.join(__dirname, 'working_anims.json');
  fs.writeFileSync(out, JSON.stringify({ working, failing }, null, 2));
  console.log(`\n💾 ${out}`);
}

main().catch(e => { console.error('❌', e); process.exit(1); });
