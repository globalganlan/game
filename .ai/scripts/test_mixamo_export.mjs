/**
 * test_mixamo_export.mjs — 測試 Mixamo export 流程
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

  const charId = 'cccc84b6-d072-4972-99da-75c5702e25f6'; // z16 Mutant

  // 1. setPrimary
  console.log('1. setPrimary...');
  let r = await fetch(`${API}/characters/update_primary`, {
    method: 'POST', headers: h,
    body: JSON.stringify({ primary_character_id: charId }),
  });
  console.log('  status:', r.status);
  await sleep(3000);

  // 2. Search zombie headbutt (known working)
  console.log('2. search "zombie headbutt"...');
  r = await fetch(`${API}/products?` + new URLSearchParams({ page: '1', limit: '3', type: 'Motion', query: 'zombie headbutt' }), { headers: h });
  const d = await r.json();
  const prod = d.results[0];
  const mid = Number(prod.thumbnail.match(/motions\/(\d+)\//)[1]);
  console.log(`  found: ${mid} "${prod.description}"`);

  // 3. Export with known-working model-id
  console.log('3. export zombie headbutt...');
  r = await fetch(`${API}/animations/export`, {
    method: 'POST', headers: h,
    body: JSON.stringify({
      gms_hash: [{ 'model-id': mid, mirror: false, trim: [0, 100], overdrive: 0, params: '0,0', 'arm-space': 0, inplace: false }],
      preferences: { format: 'fbx7_2019', skin: 'false', fps: '30', reducekf: '0' },
      character_id: charId, type: 'Motion', product_name: prod.description,
    }),
  });
  console.log('  export status:', r.status);

  // 4. Monitor
  console.log('4. monitor...');
  for (let i = 0; i < 20; i++) {
    await sleep(3000);
    r = await fetch(`${API}/characters/${charId}/monitor`, { headers: h });
    const m = await r.json();
    if (m.status === 'completed' && m.job_result) {
      console.log('  ✅ completed, URL starts:', m.job_result.substring(0, 80));
      break;
    }
    if (m.status === 'failed') {
      console.log('  ❌ failed:', JSON.stringify(m));
      break;
    }
    console.log(`  ... ${m.status} ${m.progress || ''}`);
  }

  // 5. Now test "breathing idle" (model-id 107900901 from catalog)
  console.log('\n--- Test hardcoded model-id 107900901 "Breathing Idle" ---');
  console.log('5. export with hardcoded model-id...');
  r = await fetch(`${API}/animations/export`, {
    method: 'POST', headers: h,
    body: JSON.stringify({
      gms_hash: [{ 'model-id': 107900901, mirror: false, trim: [0, 100], overdrive: 0, params: '0,0', 'arm-space': 0, inplace: false }],
      preferences: { format: 'fbx7_2019', skin: 'false', fps: '30', reducekf: '0' },
      character_id: charId, type: 'Motion', product_name: 'Breathing Idle',
    }),
  });
  console.log('  export status:', r.status);

  // 6. Monitor
  console.log('6. monitor breathing idle...');
  for (let i = 0; i < 20; i++) {
    await sleep(3000);
    r = await fetch(`${API}/characters/${charId}/monitor`, { headers: h });
    const m = await r.json();
    if (m.status === 'completed' && m.job_result) {
      console.log('  ✅ completed!');
      break;
    }
    if (m.status === 'failed') {
      console.log('  ❌ failed:', JSON.stringify(m));
      break;
    }
    console.log(`  ... ${m.status} ${m.progress || ''}`);
  }

  // 7. Search "breathing idle" and try with fresh model-id
  console.log('\n--- Test search+fresh model-id for "breathing idle" ---');
  r = await fetch(`${API}/products?` + new URLSearchParams({ page: '1', limit: '3', type: 'Motion', query: 'breathing idle' }), { headers: h });
  const d2 = await r.json();
  const prod2 = d2.results[0];
  const mid2 = Number(prod2.thumbnail.match(/motions\/(\d+)\//)[1]);
  console.log(`  search result: ${mid2} "${prod2.description}" (same? ${mid2 === 107900901})`);

  console.log('7. export with fresh model-id...');
  r = await fetch(`${API}/animations/export`, {
    method: 'POST', headers: h,
    body: JSON.stringify({
      gms_hash: [{ 'model-id': mid2, mirror: false, trim: [0, 100], overdrive: 0, params: '0,0', 'arm-space': 0, inplace: false }],
      preferences: { format: 'fbx7_2019', skin: 'false', fps: '30', reducekf: '0' },
      character_id: charId, type: 'Motion', product_name: prod2.description,
    }),
  });
  console.log('  export status:', r.status);

  console.log('8. monitor fresh model-id...');
  for (let i = 0; i < 20; i++) {
    await sleep(3000);
    r = await fetch(`${API}/characters/${charId}/monitor`, { headers: h });
    const m = await r.json();
    if (m.status === 'completed' && m.job_result) {
      console.log('  ✅ completed!');
      break;
    }
    if (m.status === 'failed') {
      console.log('  ❌ failed:', JSON.stringify(m));
      break;
    }
    console.log(`  ... ${m.status} ${m.progress || ''}`);
  }
}

main().catch(e => { console.error('❌', e); process.exit(1); });
