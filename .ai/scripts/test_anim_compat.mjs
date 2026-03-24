/**
 * test_anim_compat.mjs — 測試哪些動畫跟哪些角色相容
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

async function main() {
  const token = loadToken();
  const h = {
    'Authorization': `Bearer ${token}`,
    'X-Api-Key': 'mixamo2',
    'X-Requested-With': 'XMLHttpRequest',
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  };

  const CHARS = {
    mutant: 'cccc84b6-d072-4972-99da-75c5702e25f6',
    ninja: '39e74902-c602-49c0-9d0b-d35d1ba0c341',
    vanguard: '45d387cb-2276-426b-9547-95f501296b68',
    vampire: '90815396-6b00-4efc-b670-4c3497dbb605',
  };

  const ANIMS = [
    'zombie idle', 'breathing idle', 'standing idle', 'fight idle',
    'zombie attack', 'punch combo', 'hit reaction', 'getting hit',
    'zombie death', 'dying', 'zombie run', 'run forward', 'sprint',
  ];

  // Test each character with each animation
  for (const [charName, charId] of Object.entries(CHARS)) {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`🧪 Character: ${charName} (${charId.substring(0, 8)}...)`);
    console.log(`${'='.repeat(50)}`);

    // Set primary
    await fetch(`${API}/characters/update_primary`, {
      method: 'POST', headers: h,
      body: JSON.stringify({ primary_character_id: charId }),
    });
    await sleep(2000);

    for (const query of ANIMS) {
      // Search
      const r = await fetch(`${API}/products?` + new URLSearchParams({ page: '1', limit: '1', type: 'Motion', query }), { headers: h });
      if (r.status === 429) { console.log('  ⏳ Rate limited'); await sleep(30000); continue; }
      const d = await r.json();
      const prod = (d.results || [])[0];
      if (!prod) { console.log(`  "${query}": no results`); continue; }
      
      const mid = Number(prod.thumbnail?.match(/motions\/(\d+)\//)?.[1]);
      if (!mid) { console.log(`  "${query}": no model-id`); continue; }

      // Try export
      const er = await fetch(`${API}/animations/export`, {
        method: 'POST', headers: h,
        body: JSON.stringify({
          gms_hash: [{ 'model-id': mid, mirror: false, trim: [0, 100], overdrive: 0, params: '0,0', 'arm-space': 0, inplace: false }],
          preferences: { format: 'fbx7_2019', skin: 'false', fps: '30', reducekf: '0' },
          character_id: charId, type: 'Motion', product_name: prod.description,
        }),
      });

      if (er.status !== 202) {
        console.log(`  "${query}" (${mid}): export HTTP ${er.status}`);
        await sleep(1500);
        continue;
      }

      // Monitor (quick check)
      let result = '???';
      for (let i = 0; i < 15; i++) {
        await sleep(2000);
        const mr = await fetch(`${API}/characters/${charId}/monitor`, { headers: h });
        const m = await mr.json();
        if (m.status === 'completed') { result = '✅'; break; }
        if (m.status === 'failed') { result = '❌'; break; }
      }

      console.log(`  ${result} "${query}" → ${prod.description} (${mid})`);
      await sleep(500);
    }
  }
}

main().catch(e => { console.error('❌', e); process.exit(1); });
