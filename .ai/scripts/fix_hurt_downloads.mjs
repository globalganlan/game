/**
 * fix_hurt_downloads.mjs — 修復 5 個 hurt 動畫下載失敗
 * 
 * "Hit Reaction From Rifle Crouched" (model-id=115720901) 連續失敗
 * 改用 "Hit To Body" 類動畫
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

const TARGETS = [
  { zombieId: 'zombie_16', charId: 'dfa221bf-4b73-47eb-bb80-fcac2df11458', charName: 'Brute' },
  { zombieId: 'zombie_19', charId: '3d9daeb8-c2d5-45ce-b835-7cd403c72fc7', charName: 'Copzombie' },
  { zombieId: 'zombie_22', charId: 'b6d6b787-7378-4316-8db9-0434e51a44b4', charName: 'Nightshade' },
  { zombieId: 'zombie_25', charId: 'dc527621-d14a-41f6-aa74-dbdb20dbf017', charName: 'Ganfaul' },
  { zombieId: 'zombie_26', charId: '130a335c-bbdb-492f-971f-8faab0616b6e', charName: 'Goblin' },
];

// 嘗試多個不同的 hurt 動畫 model-id
const HURT_CANDIDATES = [
  { modelId: 115400901, name: 'Standing React Small From Right' },
  { modelId: 113780901, name: 'Big Hit To Head' },
  { modelId: 102060901, name: 'Standing React Death Backward' },
  { modelId: 102320907, name: 'Getting Hit' },
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

  async requestExport(charId, modelId, productName) {
    const gmsHash = [{
      'model-id': modelId,
      'mirror': false,
      'trim': [0, 100],
      'overdrive': 0,
      'params': '0,0,0',
      'arm-space': 60,
      'inplace': false,
    }];

    const body = {
      gms_hash: gmsHash,
      preferences: { format: 'fbx7_2019', skin: 'false', fps: '30', reducekf: '0' },
      character_id: charId,
      type: 'Motion',
      product_name: productName,
    };

    const res = await fetch(`${MIXAMO_API}/animations/export`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`export failed: ${res.status}`);
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
  const api = new MixamoAPI(env.MIXAMO_TOKEN);
  
  // 先找一個可用的 hurt 動畫（搜尋方式）
  console.log('🔍 搜尋可用的 hurt 動畫...');
  
  // 用第一個角色測試
  await api.setPrimaryCharacter(TARGETS[0].charId);
  await sleep(1000);
  
  const hurtResults = await api.searchAnimations('getting hit');
  let workingModelId = null;
  let workingName = '';
  
  for (const r of hurtResults) {
    const mid = extractModelId(r.thumbnail);
    if (mid) {
      console.log(`  嘗試: ${r.description || r.name} (model-id=${mid})`);
      try {
        await api.requestExport(TARGETS[0].charId, mid, r.description || r.name);
        const url = await api.waitForExport(TARGETS[0].charId);
        if (url) {
          workingModelId = mid;
          workingName = r.description || r.name;
          // 下載第一個角色的 hurt
          const savePath = path.join(MODELS_DIR, TARGETS[0].zombieId, 'hurt.fbx');
          const size = await api.downloadFile(url, savePath);
          console.log(`  ✅ 找到可用動畫: ${workingName} (${(size/1024).toFixed(1)} KB)`);
          break;
        }
      } catch (err) {
        console.log(`  ❌ ${r.description || r.name}: ${err.message}`);
        await sleep(2000);
      }
    }
  }
  
  if (!workingModelId) {
    // Fallback: 嘗試候選列表
    for (const c of HURT_CANDIDATES) {
      console.log(`  嘗試 fallback: ${c.name} (${c.modelId})`);
      try {
        await api.requestExport(TARGETS[0].charId, c.modelId, c.name);
        const url = await api.waitForExport(TARGETS[0].charId);
        if (url) {
          workingModelId = c.modelId;
          workingName = c.name;
          const savePath = path.join(MODELS_DIR, TARGETS[0].zombieId, 'hurt.fbx');
          const size = await api.downloadFile(url, savePath);
          console.log(`  ✅ 找到可用動畫: ${workingName} (${(size/1024).toFixed(1)} KB)`);
          break;
        }
      } catch (err) {
        console.log(`  ❌ ${c.name}: ${err.message}`);
        await sleep(2000);
      }
    }
  }
  
  if (!workingModelId) {
    console.error('❌ 無法找到任何可用的 hurt 動畫！');
    process.exit(1);
  }
  
  console.log(`\n✅ 使用 hurt 動畫: ${workingName} (model-id=${workingModelId})`);
  console.log(`📥 下載剩餘 ${TARGETS.length - 1} 個角色的 hurt 動畫...\n`);
  
  let success = 1, fail = 0; // 第一個已下載
  
  for (let i = 1; i < TARGETS.length; i++) {
    const t = TARGETS[i];
    console.log(`[${i+1}/${TARGETS.length}] ${t.zombieId} (${t.charName})`);
    
    try {
      await api.setPrimaryCharacter(t.charId);
      await sleep(1000);
      await api.requestExport(t.charId, workingModelId, workingName);
      const url = await api.waitForExport(t.charId);
      const savePath = path.join(MODELS_DIR, t.zombieId, 'hurt.fbx');
      const size = await api.downloadFile(url, savePath);
      console.log(`  ✅ hurt: ${(size/1024).toFixed(1)} KB`);
      success++;
    } catch (err) {
      console.log(`  ❌ ${err.message}`);
      fail++;
    }
    
    await sleep(2000);
  }
  
  console.log(`\n📊 完成：${success} 成功, ${fail} 失敗\n`);
}

main().catch(console.error);
