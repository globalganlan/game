/**
 * download_targeted_anims.mjs — 只下載指定的動畫替換
 * 用法: node .ai/scripts/download_targeted_anims.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const MODELS_DIR = path.join(PROJECT_ROOT, 'public', 'models');
const MIXAMO_API = 'https://www.mixamo.com/api/v1';

function loadToken() {
  const text = fs.readFileSync(path.join(__dirname, 'hero-gen.env'), 'utf-8');
  return text.match(/MIXAMO_TOKEN=(.+)/)[1].trim();
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const CHAR_IDS = {
  zombie_5:  '91d02eaa-1b0a-4d34-b859-01bcd092c713',
  zombie_7:  '45d387cb-2276-426b-9547-95f501296b68',
  zombie_8:  '45d387cb-2276-426b-9547-95f501296b68',
  zombie_15: '90815396-6b00-4efc-b670-4c3497dbb605',
  zombie_16: 'cccc84b6-d072-4972-99da-75c5702e25f6',
  zombie_19: 'a4440477-3191-424b-8703-8126d1982f67',
  zombie_20: '45d387cb-2276-426b-9547-95f501296b68',
  zombie_22: '90815396-6b00-4efc-b670-4c3497dbb605',
  zombie_25: '3576fd60-beef-49ec-a3d0-f93231f4fc29',
  zombie_26: 'efb06b46-a470-49b2-b7da-a06755d4dba7',
  zombie_28: '555df3c3-74b7-493b-a790-3b6dbba30fed',
};

// 只列出需要替換的動畫（18 個改動）
const REPLACEMENTS = [
  { hero: 'zombie_5',  type: 'attack', modelId: 102320902, label: 'Zombie Attack With Right Hand' },
  { hero: 'zombie_7',  type: 'attack', modelId: 113870901, label: 'Uppercut Jab Palm Strike Combo' },
  { hero: 'zombie_7',  type: 'hurt',   modelId: 115720901, label: 'Hit Reaction From Rifle Crouched' },
  { hero: 'zombie_7',  type: 'run',    modelId: 104020901, label: 'Zombie Run' },
  { hero: 'zombie_8',  type: 'attack', modelId: 100970901, label: 'Spinning Back Kick Advancing' },
  { hero: 'zombie_15', type: 'run',    modelId: 121370901, label: 'Zombie Running' },
  { hero: 'zombie_16', type: 'attack', modelId: 102320906, label: 'Zombie Overhead Two-Hand Attack' },
  { hero: 'zombie_16', type: 'hurt',   modelId: 102460901, label: 'Zombie Reaction Hit Flinches' },
  { hero: 'zombie_19', type: 'attack', modelId: 103010901, label: 'Street Fighter Hadouken' },
  { hero: 'zombie_19', type: 'hurt',   modelId: 102460901, label: 'Zombie Reaction Hit Flinches' },
  { hero: 'zombie_20', type: 'attack', modelId: 113650901, label: 'Vertical Elbow Strike' },
  { hero: 'zombie_20', type: 'run',    modelId: 104020901, label: 'Zombie Run' },
  { hero: 'zombie_22', type: 'hurt',   modelId: 102460901, label: 'Zombie Reaction Hit Flinches' },
  { hero: 'zombie_25', type: 'hurt',   modelId: 102460901, label: 'Zombie Reaction Hit Flinches' },
  { hero: 'zombie_25', type: 'run',    modelId: 121370901, label: 'Zombie Running' },
  { hero: 'zombie_26', type: 'hurt',   modelId: 102460901, label: 'Zombie Reaction Hit Flinches' },
  { hero: 'zombie_26', type: 'run',    modelId: 121370901, label: 'Zombie Running' },
  { hero: 'zombie_28', type: 'run',    modelId: 121370901, label: 'Zombie Running' },
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
  async setPrimary(charId) {
    const r = await fetch(`${MIXAMO_API}/characters/update_primary`, {
      method: 'POST', headers: this.headers,
      body: JSON.stringify({ primary_character_id: charId }),
    });
    if (!r.ok) throw new Error(`setPrimary ${r.status}: ${await r.text()}`);
  }
  async requestExport(characterId, modelId, productName) {
    const body = {
      gms_hash: [{ 'model-id': modelId, mirror: false, trim: [0, 100], overdrive: 0, params: '0,0', 'arm-space': 0, inplace: false }],
      preferences: { format: 'fbx7_2019', skin: 'false', fps: '30', reducekf: '0' },
      character_id: characterId, type: 'Motion', product_name: productName,
    };
    const r = await fetch(`${MIXAMO_API}/animations/export`, {
      method: 'POST', headers: this.headers, body: JSON.stringify(body),
    });
    if (r.status === 429) { await sleep(30000); return this.requestExport(characterId, modelId, productName); }
    if (!r.ok) throw new Error(`export ${r.status}: ${await r.text()}`);
  }
  async waitForExport(characterId, maxWait = 120000) {
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      const r = await fetch(`${MIXAMO_API}/characters/${characterId}/monitor`, { headers: this.headers });
      if (!r.ok) throw new Error(`monitor ${r.status}`);
      const d = await r.json();
      if (d.status === 'completed' && d.job_result) return d.job_result;
      if (d.status === 'failed') throw new Error(`Export FAILED: ${JSON.stringify(d)}`);
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

async function main() {
  const token = loadToken();
  const api = new MixamoAPI(token);
  
  console.log(`\n🏃 目標動畫替換下載 — ${REPLACEMENTS.length} 個動畫\n`);
  
  let lastCharId = null;
  let success = 0, fail = 0;
  
  for (let i = 0; i < REPLACEMENTS.length; i++) {
    const { hero, type, modelId, label } = REPLACEMENTS[i];
    const charId = CHAR_IDS[hero];
    const destDir = path.join(MODELS_DIR, hero);
    const fbxDest = path.join(destDir, `${type}.fbx`);
    
    // 備份舊 GLB
    const bakDir = path.join(destDir, 'bak_anim_audit');
    if (!fs.existsSync(bakDir)) fs.mkdirSync(bakDir, { recursive: true });
    const oldGlb = path.join(destDir, `${hero}_${type}.glb`);
    if (fs.existsSync(oldGlb)) {
      const bakPath = path.join(bakDir, `${hero}_${type}.glb`);
      if (!fs.existsSync(bakPath)) fs.copyFileSync(oldGlb, bakPath);
    }
    
    // 切換角色（只在 charId 變化時）
    if (charId !== lastCharId) {
      console.log(`  🔄 setPrimary: ${charId.substring(0, 8)}...`);
      await api.setPrimary(charId);
      await sleep(500);
      lastCharId = charId;
    }
    
    console.log(`[${i + 1}/${REPLACEMENTS.length}] ${hero} ${type}: ${label} (${modelId})`);
    try {
      await api.requestExport(charId, modelId, label);
      await sleep(1000);
      const url = await api.waitForExport(charId);
      const size = await api.downloadFile(url, fbxDest);
      console.log(`  ✅ ${(size / 1024).toFixed(0)} KB`);
      success++;
    } catch (e) {
      console.log(`  ❌ ${e.message}`);
      fail++;
    }
    await sleep(1500);
  }
  
  console.log(`\n${'='.repeat(50)}`);
  console.log(`✅ ${success} 成功 | ❌ ${fail} 失敗`);
  console.log(`\n下一步: D:\\Blender\\blender.exe --background --python .ai/scripts/convert_anim_safe.py -- --only=${[...new Set(REPLACEMENTS.map(r => r.hero))].join(',')}`);
}

main().catch(e => { console.error(e); process.exit(1); });
