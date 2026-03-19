/**
 * fix_anim_fitness.mjs — 為角色類型不適合殭屍動畫的模型重新下載適合的動畫
 * 
 * 問題：zombie_16~30 全部使用 "zombie idle/attack/death" 動畫搜尋，
 *       但許多角色（弓箭手、法師、聖騎士、忍者等）需要符合其風格的動畫。
 * 
 * 修復策略：只替換 attack（和必要時 idle），保留 hurt/dying（通用反應動畫）
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

// ===== 角色 charId 對照表 =====
const CHARACTER_IDS = {
  zombie_16: 'dfa221bf-4b73-47eb-bb80-fcac2df11458',  // Brute（持戰斧）
  zombie_17: '91d02eaa-1b0a-4d34-b859-01bcd092c713',  // Skeletonzombie
  zombie_18: '39e74902-c602-49c0-9d0b-d35d1ba0c341',  // Ninja
  zombie_19: '3d9daeb8-c2d5-45ce-b835-7cd403c72fc7',  // Copzombie
  zombie_20: '45d387cb-2276-426b-9547-95f501296b68',  // Vanguard
  zombie_21: 'd0496a75-08b9-4f4e-9f1d-f65820323cc2',  // Erika Archer
  zombie_22: 'b6d6b787-7378-4316-8db9-0434e51a44b4',  // Nightshade
  zombie_23: '447a4990-f669-436e-a066-e2e2968bdcba',  // Demon
  zombie_24: 'ef7eb018-7cf3-4ae1-99ac-bab1c2c5d419',  // Exo Gray
  zombie_25: 'dc527621-d14a-41f6-aa74-dbdb20dbf017',  // Ganfaul（法師）
  zombie_26: '130a335c-bbdb-492f-971f-8faab0616b6e',  // Goblin
  zombie_27: 'eface83a-acc0-4036-a15e-3c650df1510d',  // Paladin
  zombie_28: '555df3c3-74b7-493b-a790-3b6dbba30fed',  // Medea（女巫）
  zombie_29: '75fb0e3e-cf4c-4828-b72b-63b42a4a5cbb',  // Alien Soldier
  zombie_30: 'c9012369-6099-4f23-b1e8-e45cbdc23d74',  // The Boss
};

// ===== 需要替換的動畫定義 =====
// key: zombieId, value: { animType: { queries, skin, fallbackModelId? } }
const ANIM_FIXES = {
  zombie_16: {
    // Brute 持戰斧 — 需要重擊/揮斧動畫
    idle:   { queries: ['sword and shield idle', 'standing idle', 'idle'], skin: true },
    attack: { queries: ['great sword slash', 'sword slash', 'overhead slash', 'slash'], skin: false },
  },
  zombie_18: {
    // Ninja — 需要武術動畫
    idle:   { queries: ['fight idle', 'martial arts idle', 'boxing idle'], skin: true },
    attack: { queries: ['flying kick', 'roundhouse kick', 'karate kick', 'kick'], skin: false },
  },
  zombie_21: {
    // Erika Archer — 需要射箭動畫
    idle:   { queries: ['standing aim idle', 'archer idle', 'guard'], skin: true },
    attack: { queries: ['standing aim overdraw', 'bow attack', 'standing aim recoil', 'archery'], skin: false },
  },
  zombie_22: {
    // Nightshade 刺客 — 需要快速刺擊
    attack: { queries: ['stab', 'quick slash', 'dagger attack', 'knife attack'], skin: false },
  },
  zombie_23: {
    // Demon 炎魔 — 需要魔法/爪擊
    attack: { queries: ['magic attack', 'fireball', 'cast spell', 'spell'], skin: false },
  },
  zombie_25: {
    // Ganfaul 法師  — 需要施法動畫
    idle:   { queries: ['magic idle', 'standing idle', 'idle'], skin: true },
    attack: { queries: ['magic attack', 'cast spell', 'spell casting', 'fireball'], skin: false },
  },
  zombie_27: {
    // Paladin 聖騎士 — 需要揮劍動畫
    idle:   { queries: ['sword and shield idle', 'standing idle', 'guard'], skin: true },
    attack: { queries: ['sword slash', 'great sword slash', 'slash', 'melee'], skin: false },
  },
  zombie_28: {
    // Medea 女巫 — 需要施法動畫
    attack: { queries: ['magic attack', 'cast spell', 'spell casting', 'magic'], skin: false },
  },
  zombie_30: {
    // The Boss — 需要拳擊/踢擊
    idle:   { queries: ['standing idle', 'confident idle', 'idle'], skin: true },
    attack: { queries: ['punch', 'hook punch', 'cross punch', 'boxing'], skin: false },
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
  if (!token) { console.error('Missing MIXAMO_TOKEN in hero-gen.env'); process.exit(1); }

  const api = new MixamoAPI(token);

  // 計算總任務數
  let totalTasks = 0;
  for (const anims of Object.values(ANIM_FIXES)) {
    totalTasks += Object.keys(anims).length;
  }
  console.log(`\n🎬 動畫適配性修復：${Object.keys(ANIM_FIXES).length} 個角色，${totalTasks} 個動畫\n`);

  let success = 0, fail = 0, taskNum = 0;

  for (const [zombieId, anims] of Object.entries(ANIM_FIXES)) {
    const charId = CHARACTER_IDS[zombieId];
    if (!charId) {
      console.log(`  ❌ ${zombieId}: charId not found`);
      fail += Object.keys(anims).length;
      continue;
    }

    const outDir = path.join(MODELS_DIR, zombieId);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    console.log(`\n━━━ ${zombieId} (${charId.slice(0,8)}...) ━━━`);

    // 設定角色
    await api.setPrimaryCharacter(charId);
    await sleep(1000);

    for (const [animType, config] of Object.entries(anims)) {
      taskNum++;
      let modelId = null;
      let productName = '';

      // 搜尋動畫
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
          console.log(`    ⚠️ search "${query}" failed: ${e.message}`);
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

      try {
        await api.requestExport(charId, modelId, productName, config.skin);
        const jobResult = await api.waitForExport(charId);
        const size = await api.downloadFile(jobResult, savePath);
        console.log(`    ✅ ${(size/1024).toFixed(0)} KB → ${path.basename(savePath)}`);
        success++;
      } catch (e) {
        console.log(`    ❌ failed: ${e.message}`);
        fail++;
      }

      await sleep(1500);
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`結果：✅ ${success} 成功 / ❌ ${fail} 失敗 / 共 ${totalTasks} 個動畫`);
  console.log(`${'='.repeat(60)}`);

  if (fail > 0) {
    console.log('\n⚠️ 有失敗的動畫，請手動檢查或重試');
  }
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
