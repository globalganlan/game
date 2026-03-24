/**
 * test_more_anims.mjs — 補充搜索更多可用動畫
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

// 面向缺乏的類型搜索
const QUERIES = [
  // More runs
  'running', 'dash', 'sprint forward', 'fast run', 'slow run',
  'monster run', 'creature run forward', 'heavy run',
  // More hurts
  'hit back', 'flinch', 'react hit', 'damage', 
  'hurt reaction', 'pain', 'knocked back',
  // More dying
  'death', 'dead', 'collapse', 'fall down dead',
  'shot dead', 'knockout', 'fall over',
  // More attacks
  'kick', 'slash', 'bite', 'tackle', 'grab attack',
  'straight punch', 'jab', 'haymaker', 'axe attack', 'club attack',
  'one handed club', 'advancing punch',
  // More idles
  'idle', 'standing', 'breathing', 'waiting',
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

  const charId = 'cccc84b6-d072-4972-99da-75c5702e25f6'; // Mutant

  console.log('Setting primary character...');
  await fetch(`${API}/characters/update_primary`, {
    method: 'POST', headers: h,
    body: JSON.stringify({ primary_character_id: charId }),
  });
  await sleep(2000);

  // Load existing results to avoid retesting
  const existing = JSON.parse(fs.readFileSync(path.join(__dirname, 'working_anims.json'), 'utf-8'));
  const testedIds = new Set([...existing.working, ...existing.failing].map(x => x.mid));
  
  const working = [...existing.working];
  const failing = [...existing.failing];

  for (const query of QUERIES) {
    console.log(`\n🔍 "${query}"...`);
    
    const r = await fetch(`${API}/products?` + new URLSearchParams({ page: '1', limit: '8', type: 'Motion', query }), { headers: h });
    if (r.status === 429) { console.log('  ⏳ Rate limited'); await sleep(30000); continue; }
    if (!r.ok) { console.log(`  ❌ ${r.status}`); continue; }
    
    const d = await r.json();
    const results = (d.results || []).slice(0, 5);

    for (const prod of results) {
      const mid = Number(prod.thumbnail?.match(/motions\/(\d+)\//)?.[1]);
      if (!mid || testedIds.has(mid)) continue;
      testedIds.add(mid);
      
      const name = prod.description || prod.name;

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

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Total Working: ${working.length}, Failing: ${failing.length}`);
  
  // Categorize
  const categories = { idle: [], attack: [], hurt: [], dying: [], run: [], other: [] };
  for (const w of working) {
    const ln = w.name.toLowerCase();
    if (ln.includes('idle') || ln.includes('standing') || ln.includes('breathing') || ln.includes('looking around') || ln.includes('scratching')) categories.idle.push(w);
    else if (ln.includes('run') || ln.includes('sprint') || ln.includes('jog') || ln.includes('walk') || ln.includes('dash')) categories.run.push(w);
    else if (ln.includes('dying') || ln.includes('death') || ln.includes('dead') || ln.includes('falling back') || ln.includes('shot to') || ln.includes('knockout') || ln.includes('collapse')) categories.dying.push(w);
    else if (ln.includes('hit') || ln.includes('flinch') || ln.includes('hurt') || ln.includes('react') || ln.includes('damage') || ln.includes('knocked')) categories.hurt.push(w);
    else if (ln.includes('attack') || ln.includes('punch') || ln.includes('kick') || ln.includes('strike') || ln.includes('stab') || ln.includes('cast') || ln.includes('roar') || ln.includes('headbutt') || ln.includes('slash') || ln.includes('bite') || ln.includes('club') || ln.includes('grab')) categories.attack.push(w);
    else categories.other.push(w);
  }
  
  for (const [cat, items] of Object.entries(categories)) {
    const unique = [...new Map(items.map(i => [i.mid, i])).values()];
    console.log(`\n${cat.toUpperCase()} (${unique.length} unique):`);
    for (const i of unique) console.log(`  ${i.mid} — ${i.name}`);
  }

  fs.writeFileSync(path.join(__dirname, 'working_anims.json'), JSON.stringify({ working, failing }, null, 2));
}

main().catch(e => { console.error('❌', e); process.exit(1); });
