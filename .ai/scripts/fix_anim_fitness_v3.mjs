/**
 * fix_anim_fitness_v3.mjs — 用已知可工作的 model-id 修復剩餘失敗的 attack
 * 
 * 失敗角色：zombie_16, zombie_21, zombie_25, zombie_28
 * 策略：使用已經在其他角色成功的 model-id
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const MODELS_DIR = path.join(PROJECT_ROOT, 'public', 'models');

function loadEnv() {
  const envPath = path.join(__dirname, 'hero-gen.env');
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  const env = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
  }
  return env;
}

const MIXAMO_API = 'https://www.mixamo.com/api/v1';
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const CHARACTER_IDS = {
  zombie_16: 'dfa221bf-4b73-47eb-bb80-fcac2df11458',  // Brute
  zombie_21: 'd0496a75-08b9-4f4e-9f1d-f65820323cc2',  // Erika Archer
  zombie_25: 'dc527621-d14a-41f6-aa74-dbdb20dbf017',  // Ganfaul
  zombie_28: '555df3c3-74b7-493b-a790-3b6dbba30fed',  // Medea
};

// 已知成功的 attack model-id 列表，按優先順序嘗試
const ATTACK_MODEL_IDS = [
  { id: 113550901, name: 'A Hook Punch' },           // 成功: z23, z27
  { id: 90007, name: 'Jab Punch' },                   // 成功: z30
  { id: 111370901, name: 'Flying Bicycle Kick' },     // 成功: z18
  { id: 100800901, name: 'Male Knife Stab' },         // 成功: z22
];

class MixamoAPI {
  constructor(token) {
    this.headers = {
      'Authorization': `Bearer ${token}`,
      'X-Api-Key': 'mixamo2',
      'X-Requested-With': 'XMLHttpRequest',
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    };
  }

  async setPrimaryCharacter(charId) {
    const res = await fetch(`${MIXAMO_API}/characters/update_primary`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ primary_character_id: charId }),
    });
    if (!res.ok) throw new Error(`setPrimary failed: ${res.status}`);
  }

  async searchAnimations(query) {
    const url = `${MIXAMO_API}/products?type=Motion&query=${encodeURIComponent(query)}&page=1&limit=20`;
    const res = await fetch(url, { headers: this.headers });
    if (!res.ok) throw new Error(`search failed: ${res.status}`);
    return (await res.json()).results || [];
  }

  async requestExport(charId, modelId, productName, skin) {
    const gmsHash = [{
      'model-id': modelId,
      'mirror': false,
      'trim': [0, 100],
      'overdrive': 0,
      'params': '0,0,0',
      'arm-space': skin ? 0 : 60,
      'inplace': false,
    }];

    const body = {
      gms_hash: gmsHash,
      preferences: { format: 'fbx7_2019', skin: skin ? 'true' : 'false', fps: '30', reducekf: '0' },
      character_id: charId,
      type: 'Motion',
      product_name: productName,
    };

    const res = await fetch(`${MIXAMO_API}/animations/export`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`export failed: ${res.status} ${await res.text()}`);
  }

  async waitForExport(charId, maxWait = 120000) {
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      await sleep(3000);
      const res = await fetch(`${MIXAMO_API}/characters/${charId}/monitor`, { headers: this.headers });
      if (!res.ok) continue;
      const data = await res.json();
      if (data.status === 'completed' && data.job_result) return data.job_result;
      if (data.status === 'failed') throw new Error('Export job failed');
    }
    throw new Error('Export timeout');
  }

  async downloadFile(url, savePath) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(savePath, buffer);
    return buffer.length;
  }
}

async function tryExportWithFallbacks(api, charId, zombieId, animType, modelIds, skin) {
  const outDir = path.join(MODELS_DIR, zombieId);
  const savePath = path.join(outDir, `${zombieId}_${animType}.fbx`);

  // 如果是 search 模式，先搜尋
  for (const { id: modelId, name } of modelIds) {
    console.log(`  🔄 嘗試 model-id=${modelId} "${name}"`);
    try {
      await api.requestExport(charId, modelId, name, skin);
      const jobResult = await api.waitForExport(charId);
      const size = await api.downloadFile(jobResult, savePath);
      console.log(`    ✅ ${(size/1024).toFixed(0)} KB`);
      return true;
    } catch (e) {
      console.log(`    ❌ ${e.message}`);
      await sleep(2000);
    }
  }

  // 最後嘗試：用 search API 找 "elbow strike", "standing melee attack"
  const extraQueries = ['elbow strike', 'standing melee attack downward', 'cross body punch', 'uppercut'];
  for (const query of extraQueries) {
    try {
      const results = await api.searchAnimations(query);
      for (const r of results) {
        const match = r.thumbnail?.match(/motions\/(\d+)\//);
        if (!match) continue;
        const mid = Number(match[1]);
        console.log(`  🔄 搜尋 "${query}" → model-id=${mid} "${r.description || r.name}"`);
        try {
          await api.requestExport(charId, mid, r.description || query, skin);
          const jobResult = await api.waitForExport(charId);
          const size = await api.downloadFile(jobResult, savePath);
          console.log(`    ✅ ${(size/1024).toFixed(0)} KB`);
          return true;
        } catch (e2) {
          console.log(`    ❌ ${e2.message}`);
          await sleep(2000);
        }
      }
    } catch (e) {
      console.log(`    ⚠️ search "${query}": ${e.message}`);
    }
    await sleep(500);
  }

  return false;
}

async function main() {
  const env = loadEnv();
  const token = env.MIXAMO_TOKEN;
  if (!token) { console.error('Missing MIXAMO_TOKEN'); process.exit(1); }

  const api = new MixamoAPI(token);
  const zombies = Object.entries(CHARACTER_IDS);

  console.log(`\n🎬 動畫修復 v3：${zombies.length} 個角色的 attack 動畫\n`);

  let success = 0, fail = 0;

  for (const [zombieId, charId] of zombies) {
    console.log(`\n━━━ ${zombieId} ━━━`);
    await api.setPrimaryCharacter(charId);
    await sleep(1000);

    const ok = await tryExportWithFallbacks(api, charId, zombieId, 'attack', ATTACK_MODEL_IDS, false);
    if (ok) {
      success++;
    } else {
      fail++;
      console.log(`  ❌ ${zombieId} attack: 所有嘗試都失敗`);
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`結果：✅ ${success} / ❌ ${fail} / 共 ${zombies.length}`);
  console.log(`${'='.repeat(60)}`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
