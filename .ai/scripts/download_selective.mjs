/**
 * download_selective.mjs — 只下載指定英雄的指定動畫
 * 用法: node .ai/scripts/download_selective.mjs
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

// charId 對照表
const CHAR_IDS = {
  zombie_5:  '91d02eaa-1b0a-4d34-b859-01bcd092c713',  // Skeletonzombie
  zombie_7:  '45d387cb-2276-426b-9547-95f501296b68',  // Vanguard
  zombie_8:  '45d387cb-2276-426b-9547-95f501296b68',  // Vanguard
  zombie_15: '90815396-6b00-4efc-b670-4c3497dbb605',  // Vampire
  zombie_18: '39e74902-c602-49c0-9d0b-d35d1ba0c341',  // Ninja
  zombie_19: 'a4440477-3191-424b-8703-8126d1982f67',  // Pumpkinhulk
  zombie_20: '45d387cb-2276-426b-9547-95f501296b68',  // Vanguard
  zombie_21: 'd0496a75-08b9-4f4e-9f1d-f65820323cc2',  // Erika Archer
  zombie_22: '90815396-6b00-4efc-b670-4c3497dbb605',  // Vampire
  zombie_24: 'ef7eb018-7cf3-4ae1-99ac-bab1c2c5d419',  // Exo Gray
  zombie_25: '3576fd60-beef-49ec-a3d0-f93231f4fc29',  // Warzombie
  zombie_26: 'efb06b46-a470-49b2-b7da-a06755d4dba7',  // Warrok
  zombie_28: '555df3c3-74b7-493b-a790-3b6dbba30fed',  // Medea
  zombie_29: '75fb0e3e-cf4c-4828-b72b-63b42a4a5cbb',  // Alien Soldier
  zombie_30: 'c9012369-6099-4f23-b1e8-e45cbdc23d74',  // The Boss
};

// ═══ 要替換的動畫 ═══
// 只列出需要更換的動畫類型
const CHANGES = {
  // z7 屍警 (Vanguard, 輔助)
  zombie_7: {
    attack: { modelId: 113920901, label: 'Elbow-Uppercut Strike Combo' },
    hurt:   { modelId: 128670945, label: 'Small Hit Reaction From The Right' },
    run:    { modelId: 128630905, label: 'Running Fast' },
  },
  // z5 口器者 (Skeletonzombie, 特殊)
  zombie_5: {
    attack: { modelId: 121360901, label: 'Zombie Swipe Attack' },
  },
  // z8 怨武者 (Vanguard, 力量)
  zombie_8: {
    attack: { modelId: 102320906, label: 'Zombie Overhead Two-Hand Attack' },
  },
  // z15 暗焰祭司 (Vampire, 特殊)
  zombie_15: {
    hurt: { modelId: 128670939, label: 'Large Hit Reaction From The Front' },
    run:  { modelId: 128630905, label: 'Running Fast' },
  },
  // z18 影行者 (Ninja, 敏捷)
  zombie_18: {
    attack: { modelId: 113910901, label: 'Jab To Elbow Combo' },
    hurt:   { modelId: 128670945, label: 'Small Hit Reaction From The Right' },
  },
  // z19 星蝕者 (Pumpkinhulk, 智慧)
  zombie_19: {
    attack: { modelId: 128670910, label: 'One Handed Casting Spell Fowards' },
    hurt:   { modelId: 128670941, label: 'Large Hit Reaction From The Right' },
  },
  // z20 鏽鋼衛士 (Vanguard, 力量)
  zombie_20: {
    attack: { modelId: 104840901, label: 'Advancing And Punching' },
    hurt:   { modelId: 128670939, label: 'Large Hit Reaction From The Front' },
    run:    { modelId: 128630905, label: 'Running Fast' },
  },
  // z21 暗影弓手 (Erika Archer, 敏捷)
  zombie_21: {
    hurt: { modelId: 128670944, label: 'Small Hit Reaction From The Left' },
  },
  // z22 魔瞳領主 (Vampire, 智慧)
  zombie_22: {
    hurt: { modelId: 128670940, label: 'Large Hit Reaction From The Left' },
  },
  // z24 鏈甲獵兵 (Exo Gray, 智慧)
  zombie_24: {
    attack: { modelId: 113830902, label: 'Four Punch Combo' },
    hurt:   { modelId: 128670938, label: 'Large Hit Reaction From The Back' },
  },
  // z25 骸骨騎士 (Warzombie, 智慧)
  zombie_25: {
    hurt: { modelId: 102460902, label: 'Zombie Reaction Hit Stumble Back' },
    run:  { modelId: 128630905, label: 'Running Fast' },
  },
  // z26 老魔獵人 (Warrok, 平衡)
  zombie_26: {
    hurt: { modelId: 128670939, label: 'Large Hit Reaction From The Front' },
    run:  { modelId: 128630905, label: 'Running Fast' },
  },
  // z28 末日歌姬 (Medea, 智慧)
  zombie_28: {
    hurt: { modelId: 128670944, label: 'Small Hit Reaction From The Left' },
    run:  { modelId: 128630905, label: 'Running Fast' },
  },
  // z29 虛空獵手 (Alien Soldier, 敏捷)
  zombie_29: {
    attack: { modelId: 113640901, label: 'Roundhouse Kick' },
    hurt:   { modelId: 128670942, label: 'Small Hit Reaction From The Back' },
  },
  // z30 傭兵頭子 (The Boss, 力量)
  zombie_30: {
    hurt: { modelId: 128670941, label: 'Large Hit Reaction From The Right' },
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
      character_id: characterId,
      type: 'Motion',
      product_name: productName,
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

  const heroIds = Object.keys(CHANGES).sort((a, b) => {
    return parseInt(a.replace('zombie_', '')) - parseInt(b.replace('zombie_', ''));
  });

  const totalAnims = heroIds.reduce((sum, h) => sum + Object.keys(CHANGES[h]).length, 0);
  console.log(`\n🎬 選擇性動畫下載 — ${heroIds.length} 英雄, ${totalAnims} 動畫\n`);

  let success = 0, fail = 0;

  for (let i = 0; i < heroIds.length; i++) {
    const heroId = heroIds[i];
    const charId = CHAR_IDS[heroId];
    const changes = CHANGES[heroId];
    const destDir = path.join(MODELS_DIR, heroId);

    console.log(`[${i + 1}/${heroIds.length}] ${heroId} (${Object.keys(changes).join(', ')})`);

    await api.setPrimary(charId);
    await sleep(500);

    for (const [animType, animDef] of Object.entries(changes)) {
      const fbxDest = path.join(destDir, `${animType}.fbx`);

      console.log(`  🎬 ${animType}: ${animDef.label} (${animDef.modelId})`);
      try {
        await api.requestExport(charId, animDef.modelId, animDef.label);
        await sleep(1000);
        const url = await api.waitForExport(charId);
        const size = await api.downloadFile(url, fbxDest);
        console.log(`    ✅ ${(size / 1024).toFixed(0)} KB`);
        success++;
      } catch (e) {
        console.log(`    ❌ ${e.message}`);
        fail++;
      }
      await sleep(1500);
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`🎉 完成！成功: ${success}, 失敗: ${fail}, 共: ${totalAnims}`);
}

main().catch(e => { console.error('❌', e); process.exit(1); });
