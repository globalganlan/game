/**
 * rebind_mixamo_anims.mjs — 從 Mixamo 為指定英雄重新下載動畫 FBX
 *
 * 針對 diag_bone_mismatch.py 檢測出有 anim_only 不匹配的 7 個模型，
 * 使用各自的 Mixamo charId 重新下載 5 組動畫。
 *
 * 用法: node .ai/scripts/rebind_mixamo_anims.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const MODELS_DIR = path.join(PROJECT_ROOT, 'public', 'models');
const MIXAMO_API = 'https://www.mixamo.com/api/v1';

// ─── 載入 Token ────────────────────────────────────
function loadToken() {
  const envPath = path.join(__dirname, 'hero-gen.env');
  const text = fs.readFileSync(envPath, 'utf-8');
  const m = text.match(/MIXAMO_TOKEN=(.+)/);
  if (!m) throw new Error('MIXAMO_TOKEN not found in hero-gen.env');
  return m[1].trim();
}

// ─── 需要重綁的 7 個模型 ────────────────────────────
// charId 來自 download_mixamo_batch.mjs 的 HERO_CHARACTER_MAP
const TARGETS = [
  { zombieId: 'zombie_16', charId: 'cccc84b6-d072-4972-99da-75c5702e25f6', charName: 'Mutant' },
  { zombieId: 'zombie_17', charId: '91d02eaa-1b0a-4d34-b859-01bcd092c713', charName: 'Skeletonzombie' },
  { zombieId: 'zombie_19', charId: 'a4440477-3191-424b-8703-8126d1982f67', charName: 'Pumpkinhulk' },
  { zombieId: 'zombie_21', charId: 'd0496a75-08b9-4f4e-9f1d-f65820323cc2', charName: 'Erika Archer' },
  { zombieId: 'zombie_25', charId: '3576fd60-beef-49ec-a3d0-f93231f4fc29', charName: 'Warzombie' },
  { zombieId: 'zombie_26', charId: 'efb06b46-a470-49b2-b7da-a06755d4dba7', charName: 'Warrok' },
  { zombieId: 'zombie_28', charId: '555df3c3-74b7-493b-a790-3b6dbba30fed', charName: 'Medea' },
];

// ─── 動畫 model-id（從 hero-creation-workflow 確認可匯出的） ────
// idle 用 skin=true（提供 mesh+skeleton 參考），其他 skin=false
const ANIMS = [
  // 使用確認可匯出的 model-id + 多組 fallback
  {
    name: 'idle',
    skin: true,
    candidates: [
      { modelId: 101470907, label: 'Male Fight Idle Boxing Stance' },
      { modelId: 104210901, label: 'Ready To Combat Defensive Idle' },
      { modelId: 111330901, label: 'Standing Around Bored Idle' },
    ],
  },
  {
    name: 'attack',
    skin: false,
    candidates: [
      { modelId: 102320903, label: 'Zombie Headbutt' },
      { modelId: 102320906, label: 'Zombie Overhead Two-Hand Attack' },
      { modelId: 102320902, label: 'Zombie Right Hand Attack' },
      { modelId: 113870901, label: 'Uppercut Jab Palm Strike Combo' },
      { modelId: 113650901, label: 'Vertical Elbow Strike' },
    ],
  },
  {
    name: 'hurt',
    skin: false,
    candidates: [
      { modelId: 115720901, label: 'Hit Reaction From Rifle' },
    ],
  },
  {
    name: 'dying',
    skin: false,
    candidates: [
      { modelId: 101170903, label: 'Dying With Front Impact' },
    ],
  },
  {
    name: 'run',
    skin: false,
    // run 動畫需要搜尋 — 沒有確認的 model-id
    candidates: [],
    searchQueries: ['zombie run', 'run forward', 'running', 'jog forward'],
  },
];

// ─── 工具 ──────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function extractModelId(thumbnail) {
  const m = thumbnail && thumbnail.match(/motions\/(\d+)\//);
  return m ? Number(m[1]) : null;
}

// ─── API ──────────────────────────────────────────
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

  async setPrimary(charId) {
    const r = await fetch(`${MIXAMO_API}/characters/update_primary`, {
      method: 'POST', headers: this.headers,
      body: JSON.stringify({ primary_character_id: charId }),
    });
    if (!r.ok) throw new Error(`setPrimary ${r.status}: ${await r.text()}`);
  }

  async searchAnimations(query) {
    const params = new URLSearchParams({ page: '1', limit: '10', order: '', type: 'Motion', query });
    const r = await fetch(`${MIXAMO_API}/products?${params}`, { headers: this.headers });
    if (r.status === 429) { console.log('    ⏳ 429 rate limit, waiting 30s...'); await sleep(30000); return this.searchAnimations(query); }
    if (!r.ok) throw new Error(`search ${r.status}`);
    return r.json();
  }

  async requestExport(characterId, modelId, productName, withSkin) {
    const body = {
      gms_hash: [{ 'model-id': modelId, mirror: false, trim: [0, 100], overdrive: 0, params: '0,0', 'arm-space': 0, inplace: false }],
      preferences: { format: 'fbx7_2019', skin: withSkin ? 'true' : 'false', fps: '30', reducekf: '0' },
      character_id: characterId,
      type: 'Motion',
      product_name: productName,
    };
    const r = await fetch(`${MIXAMO_API}/animations/export`, {
      method: 'POST', headers: this.headers, body: JSON.stringify(body),
    });
    if (r.status === 429) { console.log('    ⏳ 429 rate limit, waiting 30s...'); await sleep(30000); return this.requestExport(characterId, modelId, productName, withSkin); }
    if (!r.ok) throw new Error(`export ${r.status}: ${await r.text()}`);
  }

  async waitForExport(characterId, maxWait = 120000) {
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      const r = await fetch(`${MIXAMO_API}/characters/${characterId}/monitor`, { headers: this.headers });
      if (!r.ok) throw new Error(`monitor ${r.status}`);
      const d = await r.json();
      if (d.status === 'completed' && d.job_result) return d.job_result;
      if (d.status === 'failed') throw new Error('Export FAILED');
      await sleep(3000);
    }
    throw new Error('Export timeout');
  }

  async downloadFile(url, dest) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`download ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    fs.writeFileSync(dest, buf);
    return buf.length;
  }
}

// ─── 下載一組動畫 ──────────────────────────────────
async function downloadAnim(api, charId, charName, animDef, destPath) {
  // 方法 1: 使用已知 model-id
  for (const c of animDef.candidates) {
    try {
      console.log(`    嘗試 [${c.label}] model-id=${c.modelId}...`);
      await api.requestExport(charId, c.modelId, c.label, animDef.skin);
      await sleep(1000);
      const url = await api.waitForExport(charId);
      const size = await api.downloadFile(url, destPath);
      console.log(`    ✅ ${path.basename(destPath)} (${(size / 1024).toFixed(0)} KB)`);
      return true;
    } catch (e) {
      console.log(`    ⚠ ${c.label} 失敗: ${e.message}`);
      await sleep(2000);
    }
  }

  // 方法 2: 搜尋 fallback
  if (animDef.searchQueries) {
    for (const q of animDef.searchQueries) {
      try {
        console.log(`    搜尋 "${q}"...`);
        const data = await api.searchAnimations(q);
        const results = data.results || [];
        for (const prod of results.slice(0, 3)) {
          const modelId = extractModelId(prod.thumbnail);
          if (!modelId) continue;
          const label = prod.description || prod.name || q;
          try {
            console.log(`    嘗試搜尋結果 [${label}] model-id=${modelId}...`);
            await api.requestExport(charId, modelId, label, animDef.skin);
            await sleep(1000);
            const url = await api.waitForExport(charId);
            const size = await api.downloadFile(url, destPath);
            console.log(`    ✅ ${path.basename(destPath)} (${(size / 1024).toFixed(0)} KB)`);
            return true;
          } catch (e2) {
            console.log(`    ⚠ ${label} 失敗: ${e2.message}`);
            await sleep(2000);
          }
        }
      } catch (e) {
        console.log(`    ⚠ 搜尋 "${q}" 失敗: ${e.message}`);
      }
      await sleep(1000);
    }
  }

  console.log(`    ❌ ${animDef.name} 全部失敗!`);
  return false;
}

// ─── 主流程 ──────────────────────────────────────────
async function main() {
  const token = loadToken();
  const api = new MixamoAPI(token);

  console.log(`\n🎯 Mixamo 重綁動畫 — ${TARGETS.length} 個模型 × ${ANIMS.length} 組動畫\n`);

  const results = { success: 0, fail: 0 };

  for (let i = 0; i < TARGETS.length; i++) {
    const t = TARGETS[i];
    const destDir = path.join(MODELS_DIR, t.zombieId);
    // 備份舊動畫到 .bak
    const bakDir = path.join(destDir, 'bak_mixamo_rebind');
    if (!fs.existsSync(bakDir)) fs.mkdirSync(bakDir, { recursive: true });

    console.log(`\n[${i + 1}/${TARGETS.length}] ${t.zombieId} — ${t.charName}`);

    // 設此角色為 primary
    await api.setPrimary(t.charId);
    await sleep(500);

    for (const animDef of ANIMS) {
      const fbxDest = path.join(destDir, `${animDef.name}.fbx`);

      // 備份舊 FBX（如有）
      if (fs.existsSync(fbxDest)) {
        const bakPath = path.join(bakDir, `${animDef.name}.fbx`);
        if (!fs.existsSync(bakPath)) fs.copyFileSync(fbxDest, bakPath);
      }

      console.log(`  🎬 ${animDef.name} (skin=${animDef.skin}):`);
      const ok = await downloadAnim(api, t.charId, t.charName, animDef, fbxDest);
      if (ok) results.success++;
      else results.fail++;
      await sleep(1500);
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`🎉 完成！成功: ${results.success}, 失敗: ${results.fail}`);
  console.log(`下一步: Blender 將 FBX → GLB 轉換`);
}

main().catch(e => { console.error('❌', e); process.exit(1); });
