/**
 * download_mixamo_batch.mjs — 批次從 Mixamo 下載角色 + 4 組動畫 FBX
 *
 * API 流程（2025 實測）:
 *   1. POST /characters/update_primary { primary_character_id } → 設定活躍角色
 *   2. GET  /products?type=Motion&query=...           → 搜尋動畫（含 thumbnail 內的 model-id）
 *   3. POST /animations/export { gms_hash, preferences, character_id, type, product_name }
 *   4. GET  /characters/{charId}/monitor              → 輪詢直到 job_result 出現
 *   5. 下載 job_result URL 的 FBX 檔案
 *
 * 使用方式：
 *   node .ai/scripts/download_mixamo_batch.mjs
 *
 * 前置需求：
 *   - .ai/scripts/hero-gen.env 中已設定 MIXAMO_TOKEN（從 Mixamo 瀏覽器 localStorage 取得）
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const MODELS_DIR = path.join(PROJECT_ROOT, 'public', 'models');

// ─── 設定 ──────────────────────────────────────────────

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

// ─── 英雄 → Mixamo 角色對照（UUID 來自 /products?type=Character） ──

const HERO_CHARACTER_MAP = [
  { zombieId: 'zombie_16', heroName: '腐蝕蟲',     charId: 'cccc84b6-d072-4972-99da-75c5702e25f6', charName: 'Mutant' },
  { zombieId: 'zombie_17', heroName: '枯骨兵',     charId: '91d02eaa-1b0a-4d34-b859-01bcd092c713', charName: 'Skeletonzombie T Avelange' },
  { zombieId: 'zombie_18', heroName: '影行者',     charId: '39e74902-c602-49c0-9d0b-d35d1ba0c341', charName: 'Ninja' },
  { zombieId: 'zombie_19', heroName: '毒蕈師',     charId: 'a4440477-3191-424b-8703-8126d1982f67', charName: 'Pumpkinhulk L Shaw' },
  { zombieId: 'zombie_20', heroName: '鏽鋼衛士',   charId: '45d387cb-2276-426b-9547-95f501296b68', charName: 'Vanguard By T. Choonyung' },
  { zombieId: 'zombie_21', heroName: '亡靈弓手',   charId: 'd0496a75-08b9-4f4e-9f1d-f65820323cc2', charName: 'Erika Archer' },
  { zombieId: 'zombie_22', heroName: '血族伯爵',   charId: '90815396-6b00-4efc-b670-4c3497dbb605', charName: 'Vampire A Lusth' },
  { zombieId: 'zombie_23', heroName: '炎魔',       charId: '447a4990-f669-436e-a066-e2e2968bdcba', charName: 'Demon T Wiezzorek' },
  { zombieId: 'zombie_24', heroName: '魂縛者',     charId: 'ef7eb018-7cf3-4ae1-99ac-bab1c2c5d419', charName: 'Exo Gray' },
  { zombieId: 'zombie_25', heroName: '冰霜巫妖',   charId: '3576fd60-beef-49ec-a3d0-f93231f4fc29', charName: 'Warzombie F Pedroso' },
  { zombieId: 'zombie_26', heroName: '深淵使徒',   charId: 'efb06b46-a470-49b2-b7da-a06755d4dba7', charName: 'Warrok W Kurniawan' },
  { zombieId: 'zombie_27', heroName: '末日審判者', charId: 'eface83a-acc0-4036-a15e-3c650df1510d', charName: 'Paladin J Nordstrom' },
  { zombieId: 'zombie_28', heroName: '瘟疫女王',   charId: '555df3c3-74b7-493b-a790-3b6dbba30fed', charName: 'Medea By M. Arrebola' },
  { zombieId: 'zombie_29', heroName: '虛空獵手',   charId: '75fb0e3e-cf4c-4828-b72b-63b42a4a5cbb', charName: 'Alien Soldier' },
  { zombieId: 'zombie_30', heroName: '不朽將軍',   charId: 'c9012369-6099-4f23-b1e8-e45cbdc23d74', charName: 'The Boss' },
];

// 動畫搜尋關鍵字（idle 帶 skin，其餘不帶）
const ANIM_SEARCH = {
  idle:   { queries: ['zombie idle', 'breathing idle', 'idle'], skin: true },
  attack: { queries: ['zombie attack', 'punch', 'attack'],     skin: false },
  hurt:   { queries: ['hit reaction', 'getting hit', 'damage'],skin: false },
  dying:  { queries: ['zombie death', 'dying', 'death'],       skin: false },
};

// ─── 工具函數 ──────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/** 從 thumbnail URL 提取數字 model-id（gms_hash 需要） */
function extractModelId(thumbnail) {
  const match = thumbnail && thumbnail.match(/motions\/(\d+)\//);
  return match ? Number(match[1]) : null;
}

// ─── API 客戶端 ──────────────────────────────────────────

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

  /** 設定活躍角色 */
  async setPrimaryCharacter(charId) {
    const res = await fetch(`${MIXAMO_API}/characters/update_primary`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ primary_character_id: charId }),
    });
    if (!res.ok) throw new Error(`setPrimary failed (${res.status}): ${await res.text()}`);
    return res.json();
  }

  /** 搜尋動畫 */
  async searchAnimations(query) {
    const params = new URLSearchParams({
      page: '1', limit: '10', order: '', type: 'Motion', query,
    });
    const res = await fetch(`${MIXAMO_API}/products?${params}`, { headers: this.headers });
    if (!res.ok) throw new Error(`searchAnimations failed (${res.status})`);
    return res.json();
  }

  /** 匯出動畫 FBX */
  async requestExport(characterId, modelId, productName, withSkin) {
    const body = {
      gms_hash: [{
        'model-id': modelId,
        mirror: false,
        trim: [0, 100],
        overdrive: 0,
        params: '0,0',
        'arm-space': 0,
        inplace: false,
      }],
      preferences: {
        format: 'fbx7_2019',
        skin: withSkin ? 'true' : 'false',
        fps: '30',
        reducekf: '0',
      },
      character_id: characterId,
      type: 'Motion',
      product_name: productName,
    };
    const res = await fetch(`${MIXAMO_API}/animations/export`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`requestExport failed (${res.status}): ${await res.text()}`);
    return res.json();
  }

  /** 輪詢匯出進度 */
  async waitForExport(characterId, maxWait = 120000) {
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      const res = await fetch(`${MIXAMO_API}/characters/${characterId}/monitor`, {
        headers: this.headers,
      });
      if (!res.ok) throw new Error(`monitor failed (${res.status})`);
      const data = await res.json();
      if (data.status === 'completed' && data.job_result) return data.job_result;
      if (data.status === 'failed') throw new Error('Export job failed');
      await sleep(3000);
    }
    throw new Error('Export timeout');
  }

  /** 下載檔案 */
  async downloadFile(url, destPath) {
    console.log(`    ⬇ ${path.basename(destPath)}...`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Download failed (${res.status})`);
    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(destPath, buffer);
    console.log(`    ✅ ${path.basename(destPath)} (${(buffer.length / 1024).toFixed(0)} KB)`);
  }
}

// ─── 主流程 ──────────────────────────────────────────────

async function main() {
  const env = loadEnv();
  const token = env.MIXAMO_TOKEN;
  if (!token) { console.error('❌ MIXAMO_TOKEN 未設定'); process.exit(1); }

  const api = new MixamoAPI(token);
  console.log(`🎯 準備下載 ${HERO_CHARACTER_MAP.length} 個角色 × ${Object.keys(ANIM_SEARCH).length} 組動畫\n`);

  for (let i = 0; i < HERO_CHARACTER_MAP.length; i++) {
    const hero = HERO_CHARACTER_MAP[i];
    const destDir = path.join(MODELS_DIR, hero.zombieId);
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

    console.log(`\n[${i + 1}/${HERO_CHARACTER_MAP.length}] ${hero.zombieId} — ${hero.heroName} (${hero.charName})`);

    // 設定此角色為活躍角色
    await api.setPrimaryCharacter(hero.charId);
    await sleep(500);

    for (const [animName, { queries, skin }] of Object.entries(ANIM_SEARCH)) {
      const destFile = path.join(destDir, `${animName}.fbx`);
      if (fs.existsSync(destFile) && fs.statSync(destFile).size > 10000) {
        console.log(`  ⏭ ${animName}.fbx 已存在，跳過`);
        continue;
      }

      // 搜尋動畫
      let animProduct = null;
      for (const q of queries) {
        try {
          const data = await api.searchAnimations(q);
          const results = data.results || [];
          if (results.length > 0) { animProduct = results[0]; break; }
        } catch (e) {
          console.warn(`    ⚠ 搜尋 "${q}" 失敗: ${e.message}`);
        }
        await sleep(300);
      }
      if (!animProduct) { console.error(`  ❌ ${animName}: 找不到動畫`); continue; }

      // 從 thumbnail 提取 model-id
      const modelId = extractModelId(animProduct.thumbnail);
      if (!modelId) { console.error(`  ❌ ${animName}: 無法取得 model-id`); continue; }

      const animLabel = animProduct.description || animProduct.name;
      console.log(`  🎬 ${animName}: "${animLabel}" [model-id=${modelId}, skin=${skin}]`);

      try {
        await api.requestExport(hero.charId, modelId, animLabel, skin);
        await sleep(1000);
        const downloadUrl = await api.waitForExport(hero.charId);
        await api.downloadFile(downloadUrl, destFile);
      } catch (e) {
        console.error(`  ❌ ${animName} 失敗: ${e.message}`);
      }
      await sleep(1500);
    }
  }

  console.log('\n🎉 批次下載完成！');
  console.log('下一步: 使用 Blender 轉換 FBX → GLB');
}

main().catch(e => { console.error('❌ 致命錯誤:', e); process.exit(1); });
