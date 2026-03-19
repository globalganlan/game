/**
 * fix_anim_fitness_v2.mjs — 重試失敗的動畫，使用更通用的搜尋
 * 
 * 策略：避免武器專屬動畫（sword/bow/shield），
 * 改用通用肢體動畫（punch/kick/melee/cast）
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

function extractModelId(thumbnail) {
  const match = thumbnail && thumbnail.match(/motions\/(\d+)\//);
  return match ? Number(match[1]) : null;
}

const CHARACTER_IDS = {
  zombie_16: 'dfa221bf-4b73-47eb-bb80-fcac2df11458',  // Brute
  zombie_21: 'd0496a75-08b9-4f4e-9f1d-f65820323cc2',  // Erika Archer
  zombie_23: '447a4990-f669-436e-a066-e2e2968bdcba',  // Demon
  zombie_25: 'dc527621-d14a-41f6-aa74-dbdb20dbf017',  // Ganfaul (法師)
  zombie_27: 'eface83a-acc0-4036-a15e-3c650df1510d',  // Paladin
  zombie_28: '555df3c3-74b7-493b-a790-3b6dbba30fed',  // Medea (女巫)
  zombie_30: 'c9012369-6099-4f23-b1e8-e45cbdc23d74',  // The Boss
};

// 只修復上一輪失敗的 + zombie_23（上一輪被截斷）
const ANIM_FIXES = {
  zombie_16: {
    // Brute 蠻族 — 避免 sword/shield，用通用重擊
    idle:   { queries: ['breathing idle', 'idle'], skin: true },
    attack: { queries: ['mutant punch', 'strong punch', 'hook punch', 'punch'], skin: false },
  },
  zombie_21: {
    // Erika Archer — 避免 bow 專屬，用遠程通用
    idle:   { queries: ['breathing idle', 'idle'], skin: true },
    attack: { queries: ['throwing', 'throw', 'shove', 'push'], skin: false },
  },
  zombie_23: {
    // Demon 炎魔 — 通用攻擊
    attack: { queries: ['belly button punch', 'hook punch', 'punch combo'], skin: false },
  },
  zombie_25: {
    // Ganfaul 法師 — 通用施法
    idle:   { queries: ['breathing idle', 'idle'], skin: true },
    attack: { queries: ['belly button punch', 'standing melee', 'push'], skin: false },
  },
  zombie_27: {
    // Paladin 聖騎 — 避免 sword/shield 專屬
    idle:   { queries: ['breathing idle', 'idle'], skin: true },
    attack: { queries: ['hook punch', 'elbow punch', 'punch combo', 'punch'], skin: false },
  },
  zombie_28: {
    // Medea 女巫 — 通用攻擊
    attack: { queries: ['belly button punch', 'standing melee', 'push'], skin: false },
  },
  zombie_30: {
    // The Boss — idle
    idle: { queries: ['breathing idle', 'idle'], skin: true },
  },
};

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

async function main() {
  const env = loadEnv();
  const token = env.MIXAMO_TOKEN;
  if (!token) { console.error('Missing MIXAMO_TOKEN'); process.exit(1); }

  const api = new MixamoAPI(token);

  let totalTasks = 0;
  for (const anims of Object.values(ANIM_FIXES)) {
    totalTasks += Object.keys(anims).length;
  }
  console.log(`\n🎬 動畫修復 v2：${Object.keys(ANIM_FIXES).length} 個角色，${totalTasks} 個動畫\n`);

  let success = 0, fail = 0, taskNum = 0;

  for (const [zombieId, anims] of Object.entries(ANIM_FIXES)) {
    const charId = CHARACTER_IDS[zombieId];
    const outDir = path.join(MODELS_DIR, zombieId);

    console.log(`\n━━━ ${zombieId} ━━━`);
    await api.setPrimaryCharacter(charId);
    await sleep(1000);

    for (const [animType, config] of Object.entries(anims)) {
      taskNum++;
      let modelId = null;
      let productName = '';

      // 搜尋動畫，逐一嘗試 query
      for (const query of config.queries) {
        try {
          const results = await api.searchAnimations(query);
          for (const r of results) {
            const mid = extractModelId(r.thumbnail);
            if (mid) {
              modelId = mid;
              productName = r.description || r.name || query;
              break;
            }
          }
          if (modelId) break;
        } catch (e) {
          console.log(`    ⚠️ search "${query}": ${e.message}`);
        }
        await sleep(500);
      }

      if (!modelId) {
        console.log(`  ❌ [${taskNum}/${totalTasks}] ${animType}: no animation found`);
        fail++;
        continue;
      }

      const savePath = path.join(outDir, `${zombieId}_${animType}.fbx`);
      console.log(`  📥 [${taskNum}/${totalTasks}] ${animType}: model-id=${modelId} "${productName}"`);

      // 嘗試匯出
      let downloaded = false;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          await api.requestExport(charId, modelId, productName, config.skin);
          const jobResult = await api.waitForExport(charId);
          const size = await api.downloadFile(jobResult, savePath);
          console.log(`    ✅ ${(size/1024).toFixed(0)} KB → ${path.basename(savePath)}`);
          downloaded = true;
          success++;
          break;
        } catch (e) {
          console.log(`    ⚠️ attempt ${attempt}: ${e.message}`);
          if (attempt < 2) {
            console.log('    🔄 retrying...');
            await sleep(2000);
          }
        }
      }

      if (!downloaded) {
        fail++;
        console.log(`    ❌ ${animType} 完全失敗`);
      }

      await sleep(1500);
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`結果：✅ ${success} / ❌ ${fail} / 共 ${totalTasks}`);
  console.log(`${'='.repeat(60)}`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
