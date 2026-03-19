/**
 * fix_duplicate_models.mjs — 替換重複模型
 * 
 * 重複的 5 組：
 *   zombie_16 (Mutant) = zombie_2 → 替換為 Brute
 *   zombie_19 (Pumpkinhulk) = zombie_13 → 替換為 Copzombie
 *   zombie_22 (Vampire) = zombie_15 → 替換為 Nightshade
 *   zombie_25 (Warzombie) = zombie_12 → 替換為 Ganfaul (巫師)
 *   zombie_26 (Warrok) = zombie_3 → 替換為 Goblin
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

const REPLACEMENTS = [
  { zombieId: 'zombie_16', heroName: '腐蝕蟲',   charId: 'dfa221bf-4b73-47eb-bb80-fcac2df11458', charName: 'Brute' },
  { zombieId: 'zombie_19', heroName: '毒蕈師',   charId: '3d9daeb8-c2d5-45ce-b835-7cd403c72fc7', charName: 'Copzombie L Actisdato' },
  { zombieId: 'zombie_22', heroName: '血族伯爵', charId: 'b6d6b787-7378-4316-8db9-0434e51a44b4', charName: 'Nightshade J Friedrich' },
  { zombieId: 'zombie_25', heroName: '冰霜巫妖', charId: 'dc527621-d14a-41f6-aa74-dbdb20dbf017', charName: 'Ganfaul M Aure' },
  { zombieId: 'zombie_26', heroName: '深淵使徒', charId: '130a335c-bbdb-492f-971f-8faab0616b6e', charName: 'Goblin D Shareyko' },
];

// 動畫搜尋 + 對應的 model-id（dying 用修復版）
const ANIM_SEARCH = {
  idle:   { queries: ['zombie idle', 'breathing idle', 'idle'], skin: true },
  attack: { queries: ['zombie attack', 'punch', 'attack'],     skin: false },
  hurt:   { queries: ['hit reaction', 'getting hit', 'damage'],skin: false },
  dying:  { queries: ['dying front head', 'dying', 'death'],   skin: false },
};

// Dying 用固定的 model-id（之前測試過可用）
const DYING_FALLBACK_MODEL_ID = 101220904; // "Dying Front Head Impact To Two Knees"

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
  console.log(`\n🔧 替換 ${REPLACEMENTS.length} 個重複模型\n`);

  let success = 0, fail = 0;

  for (let i = 0; i < REPLACEMENTS.length; i++) {
    const hero = REPLACEMENTS[i];
    const outDir = path.join(MODELS_DIR, hero.zombieId);
    console.log(`\n[${i+1}/${REPLACEMENTS.length}] ${hero.zombieId} — ${hero.heroName} → ${hero.charName}`);

    // 清除舊 GLB 和 FBX
    const oldFiles = fs.readdirSync(outDir).filter(f => f.endsWith('.glb') || f.endsWith('.fbx'));
    for (const f of oldFiles) {
      fs.unlinkSync(path.join(outDir, f));
      console.log(`  🗑️ deleted ${f}`);
    }

    try {
      // 設定活躍角色
      await api.setPrimaryCharacter(hero.charId);
      await sleep(1000);

      // 下載 4 組動畫
      for (const [animName, config] of Object.entries(ANIM_SEARCH)) {
        let modelId = null;
        let productName = '';

        // 搜尋動畫
        for (const query of config.queries) {
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
          await sleep(500);
        }

        // dying 用固定 fallback
        if (animName === 'dying') {
          modelId = DYING_FALLBACK_MODEL_ID;
          productName = 'Dying Front Head Impact To Two Knees';
        }

        if (!modelId) {
          console.log(`  ⚠️ ${animName}: no model-id found, skipping`);
          fail++;
          continue;
        }

        console.log(`  📥 ${animName}: model-id=${modelId} (${productName})`);

        try {
          await api.requestExport(hero.charId, modelId, productName, config.skin);
          const downloadUrl = await api.waitForExport(hero.charId);
          const savePath = path.join(outDir, `${animName}.fbx`);
          const size = await api.downloadFile(downloadUrl, savePath);
          console.log(`  ✅ ${animName}: ${(size / 1024).toFixed(1)} KB`);
          success++;
        } catch (err) {
          console.log(`  ❌ ${animName}: ${err.message}`);
          fail++;
        }

        await sleep(2000);
      }
    } catch (err) {
      console.log(`  ❌ ERROR: ${err.message}`);
      fail += 4;
    }
  }

  console.log(`\n📊 完成：${success} 成功, ${fail} 失敗\n`);
}

main().catch(console.error);
