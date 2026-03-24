/**
 * download_targeted_anims_v3.mjs — 第三輪動畫品質替換
 * 
 * 根據 model-viewer 視覺檢查結果，替換有嚴重問題的動畫：
 * - z7: attack/hurt/run（頭縮胸 + 前傾飄浮）
 * - z8: attack（空手做刺刀動作不合理）
 * - z19: attack（頭前傾下垂）
 * - z25: hurt/run（頭下轉 + 前傾）
 * - z26: hurt/run（頭嚴重低下 + 前傾）
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.join(__dirname, 'hero-gen.env');
const envText = fs.readFileSync(ENV_PATH, 'utf8');
const MIXAMO_TOKEN = envText.match(/MIXAMO_TOKEN=(.*)/)?.[1]?.trim();
if (!MIXAMO_TOKEN) { console.error('Missing MIXAMO_TOKEN'); process.exit(1); }

const API_BASE = 'https://www.mixamo.com/api/v1';
const HEADERS = {
  Authorization: `Bearer ${MIXAMO_TOKEN}`,
  'X-Api-Key': 'mixamo2',
  'Content-Type': 'application/json',
};

// 英雄 charId 對照
const CHAR_IDS = {
  zombie_7:  '45d387cb-2276-426b-9547-95f501296b68',  // Vanguard
  zombie_8:  '45d387cb-2276-426b-9547-95f501296b68',  // Vanguard
  zombie_19: 'a4440477-3191-424b-8703-8126d1982f67',  // Pumpkinhulk
  zombie_25: '3576fd60-beef-49ec-a3d0-f93231f4fc29',  // Warzombie
  zombie_26: 'efb06b46-a470-49b2-b7da-a06755d4dba7',  // Warrok
};

// 替換清單
const REPLACEMENTS = [
  // z7 屍警: attack → Zombie Punching, hurt → Zombie Reaction Stumble Back, run → Zombie Run
  { hero: 'zombie_7', type: 'attack', modelId: 102320901, label: 'ZombiePunching' },
  { hero: 'zombie_7', type: 'hurt',   modelId: 102460902, label: 'ZombieStumbleBack' },
  { hero: 'zombie_7', type: 'run',    modelId: 104020901, label: 'ZombieRun' },
  // z8 怨武者: attack → Zombie Punching (空手攻擊，不是刺刀了)
  { hero: 'zombie_8', type: 'attack', modelId: 102320901, label: 'ZombiePunching' },
  // z19 星蝕者: attack → Zombie Overhead Two Hand (雙手高舉砸下)
  { hero: 'zombie_19', type: 'attack', modelId: 102320906, label: 'ZombieOverheadTwoHand' },
  // z25 骸骨騎士: hurt → Zombie Stumble Back, run → Zombie Run
  { hero: 'zombie_25', type: 'hurt', modelId: 102460902, label: 'ZombieStumbleBack' },
  { hero: 'zombie_25', type: 'run',  modelId: 104020901, label: 'ZombieRun' },
  // z26 老魔獵人: hurt → Zombie Stumble Back, run → Zombie Run
  { hero: 'zombie_26', type: 'hurt', modelId: 102460902, label: 'ZombieStumbleBack' },
  { hero: 'zombie_26', type: 'run',  modelId: 104020901, label: 'ZombieRun' },
];

const OUTPUT_DIR = path.join(__dirname, '..', '..', 'public', 'models');

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function downloadAnim({ hero, type, modelId, label }) {
  const charId = CHAR_IDS[hero];
  const outDir = path.join(OUTPUT_DIR, hero);
  const outFile = path.join(outDir, `${hero}_${type}.fbx`);

  console.log(`\n→ ${hero}/${type}: ${label} (modelId=${modelId})`);

  // Step 1: Export
  const exportBody = {
    character_id: charId,
    gms_hash: [{ 'model-id': modelId, mirror: false, trim: [0, 100], overdrive: 0, params: '0,0', 'arm-space': 0, inplace: false }],
    preferences: { format: 'fbx7_2019', skin: 'false', fps: '30', reducekf: '0' },
    type: 'Motion',
    product_name: label,
  };

  const exportRes = await fetch(`${API_BASE}/animations/export`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(exportBody),
  });

  if (exportRes.status === 429) {
    console.log('  ⏳ Rate limited, waiting 30s...');
    await sleep(30000);
    return downloadAnim({ hero, type, modelId, label }); // retry
  }

  if (!exportRes.ok) {
    const txt = await exportRes.text();
    console.error(`  ✗ Export failed: ${exportRes.status} — ${txt}`);
    return false;
  }
  const exportData = await exportRes.json().catch(() => null);
  console.log(`  Export response:`, JSON.stringify(exportData)?.slice(0, 200));

  // Step 2: Poll for download URL
  let downloadUrl = null;
  for (let i = 0; i < 30; i++) {
    await sleep(2000);
    const monHeaders = { ...HEADERS };
    delete monHeaders['Content-Type'];
    const monitorRes = await fetch(
      `${API_BASE}/characters/${charId}/monitor`,
      { headers: monHeaders }
    );
    if (monitorRes.status === 429) {
      console.log('\n  ⏳ Monitor rate limited, waiting 30s...');
      await sleep(30000);
      i--; continue;
    }
    if (!monitorRes.ok) continue;
    const mon = await monitorRes.json();
    if (mon.status === 'completed' && mon.job_result) {
      downloadUrl = mon.job_result;
      break;
    }
    if (mon.status === 'failed') {
      console.error(`  ✗ Job failed`, JSON.stringify(mon));
      return false;
    }
    if (mon.message) process.stdout.write(`[${mon.status}:${mon.message}]`);
    else process.stdout.write('.');
  }

  if (!downloadUrl) {
    console.error(`  ✗ Timeout waiting for download`);
    return false;
  }

  // Step 3: Download FBX
  const dlRes = await fetch(downloadUrl);
  if (!dlRes.ok) {
    console.error(`  ✗ Download failed: ${dlRes.status}`);
    return false;
  }
  const buf = Buffer.from(await dlRes.arrayBuffer());
  fs.writeFileSync(outFile, buf);
  console.log(`  ✓ ${outFile} (${(buf.length / 1024).toFixed(1)} KB)`);
  return true;
}

async function main() {
  console.log(`=== 第三輪動畫替換 — ${REPLACEMENTS.length} 個動畫 ===\n`);

  let success = 0, fail = 0;
  for (const r of REPLACEMENTS) {
    const ok = await downloadAnim(r);
    if (ok) success++; else fail++;
    await sleep(3000); // rate limit — 3s between downloads
  }

  console.log(`\n=== 完成: ${success} 成功, ${fail} 失敗 ===`);
}

main().catch(e => { console.error(e); process.exit(1); });
