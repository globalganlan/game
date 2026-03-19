/**
 * fix_dying_downloads.mjs — 修復缺失的 dying 動畫 + zombie_29 idle
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const MODELS_DIR = path.join(PROJECT_ROOT, 'public', 'models');
const API = 'https://www.mixamo.com/api/v1';

function loadToken() {
  const lines = fs.readFileSync(path.join(__dirname, 'hero-gen.env'), 'utf-8').split('\n');
  for (const line of lines) {
    if (line.startsWith('MIXAMO_TOKEN=')) return line.slice(13).trim();
  }
  throw new Error('No MIXAMO_TOKEN');
}

const token = loadToken();
const headers = {
  Authorization: `Bearer ${token}`,
  'X-Api-Key': 'mixamo2',
  'X-Requested-With': 'XMLHttpRequest',
  Accept: 'application/json',
  'Content-Type': 'application/json',
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Verified working model-id for dying animation
const DYING_MODEL_ID = 101220904; // "Dying Front Head Impact To Two Knees"
// Working idle
const IDLE_MODEL_ID = 102250901; // "Zombie Alert Idle"

const ALL_CHARS = [
  { zombieId: 'zombie_16', charId: 'cccc84b6-d072-4972-99da-75c5702e25f6' },
  { zombieId: 'zombie_17', charId: '91d02eaa-1b0a-4d34-b859-01bcd092c713' },
  { zombieId: 'zombie_18', charId: '39e74902-c602-49c0-9d0b-d35d1ba0c341' },
  { zombieId: 'zombie_19', charId: 'a4440477-3191-424b-8703-8126d1982f67' },
  { zombieId: 'zombie_20', charId: '45d387cb-2276-426b-9547-95f501296b68' },
  { zombieId: 'zombie_21', charId: 'd0496a75-08b9-4f4e-9f1d-f65820323cc2' },
  { zombieId: 'zombie_22', charId: '90815396-6b00-4efc-b670-4c3497dbb605' },
  { zombieId: 'zombie_23', charId: '447a4990-f669-436e-a066-e2e2968bdcba' },
  { zombieId: 'zombie_24', charId: 'ef7eb018-7cf3-4ae1-99ac-bab1c2c5d419' },
  { zombieId: 'zombie_25', charId: '3576fd60-beef-49ec-a3d0-f93231f4fc29' },
  { zombieId: 'zombie_26', charId: 'efb06b46-a470-49b2-b7da-a06755d4dba7' },
  { zombieId: 'zombie_27', charId: 'eface83a-acc0-4036-a15e-3c650df1510d' },
  { zombieId: 'zombie_28', charId: '555df3c3-74b7-493b-a790-3b6dbba30fed' },
  { zombieId: 'zombie_29', charId: '75fb0e3e-cf4c-4828-b72b-63b42a4a5cbb' },
  { zombieId: 'zombie_30', charId: 'c9012369-6099-4f23-b1e8-e45cbdc23d74' },
];

async function exportAndDownload(charId, modelId, productName, skin, destFile) {
  // Set primary
  await fetch(`${API}/characters/update_primary`, {
    method: 'POST', headers,
    body: JSON.stringify({ primary_character_id: charId }),
  });
  await sleep(500);

  // Request export
  const exportRes = await fetch(`${API}/animations/export`, {
    method: 'POST', headers,
    body: JSON.stringify({
      gms_hash: [{ 'model-id': modelId, mirror: false, trim: [0, 100], overdrive: 0, params: '0,0', 'arm-space': 0, inplace: false }],
      preferences: { format: 'fbx7_2019', skin: skin ? 'true' : 'false', fps: '30', reducekf: '0' },
      character_id: charId, type: 'Motion', product_name: productName,
    }),
  });
  if (!exportRes.ok) throw new Error(`Export request failed: ${exportRes.status}`);
  await sleep(1000);

  // Poll monitor
  for (let i = 0; i < 40; i++) {
    await sleep(3000);
    const monRes = await fetch(`${API}/characters/${charId}/monitor`, { headers });
    const mon = await monRes.json();
    if (mon.status === 'completed' && mon.job_result) {
      const dlRes = await fetch(mon.job_result);
      const buf = Buffer.from(await dlRes.arrayBuffer());
      fs.writeFileSync(destFile, buf);
      console.log(`  ✅ ${path.basename(destFile)} (${(buf.length / 1024).toFixed(0)} KB)`);
      return;
    }
    if (mon.status === 'failed') throw new Error('Export failed');
  }
  throw new Error('Export timeout');
}

async function main() {
  let ok = 0, fail = 0;

  // Fix zombie_29 idle first
  const idle29 = path.join(MODELS_DIR, 'zombie_29', 'idle.fbx');
  if (!fs.existsSync(idle29) || fs.statSync(idle29).size < 10000) {
    console.log('[FIX] zombie_29 idle...');
    try {
      await exportAndDownload('75fb0e3e-cf4c-4828-b72b-63b42a4a5cbb', IDLE_MODEL_ID, 'Zombie Alert Idle', true, idle29);
      ok++;
    } catch (e) { console.error('  ❌', e.message); fail++; }
    await sleep(2000);
  }

  // Fix all dying animations
  for (const c of ALL_CHARS) {
    const destFile = path.join(MODELS_DIR, c.zombieId, 'dying.fbx');
    if (fs.existsSync(destFile) && fs.statSync(destFile).size > 10000) {
      console.log(`⏭ ${c.zombieId} dying already exists`);
      continue;
    }
    console.log(`[${c.zombieId}] dying...`);
    try {
      await exportAndDownload(c.charId, DYING_MODEL_ID, 'Dying Front Head Impact', false, destFile);
      ok++;
    } catch (e) { console.error('  ❌', e.message); fail++; }
    await sleep(2000);
  }

  console.log(`\n完成: ${ok} 成功, ${fail} 失敗`);
}

main().catch(e => { console.error('致命錯誤:', e); process.exit(1); });
