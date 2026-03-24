/**
 * download_round2.mjs — 第二輪下載（使用舊版相容動畫）
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
  zombie_15: '90815396-6b00-4efc-b670-4c3497dbb605',
  zombie_18: '39e74902-c602-49c0-9d0b-d35d1ba0c341',
  zombie_19: 'a4440477-3191-424b-8703-8126d1982f67',
  zombie_20: '45d387cb-2276-426b-9547-95f501296b68',
  zombie_21: 'd0496a75-08b9-4f4e-9f1d-f65820323cc2',
  zombie_22: '90815396-6b00-4efc-b670-4c3497dbb605',
  zombie_24: 'ef7eb018-7cf3-4ae1-99ac-bab1c2c5d419',
  zombie_25: '3576fd60-beef-49ec-a3d0-f93231f4fc29',
  zombie_26: 'efb06b46-a470-49b2-b7da-a06755d4dba7',
  zombie_28: '555df3c3-74b7-493b-a790-3b6dbba30fed',
  zombie_29: '75fb0e3e-cf4c-4828-b72b-63b42a4a5cbb',
  zombie_30: 'c9012369-6099-4f23-b1e8-e45cbdc23d74',
};

// 第二輪：使用舊版相容動畫（ID < 125000000）
// hurt → 混合使用多種站立受擊反應
// run → 使用 Jogging (116500901)
// attack → 針對第一輪失敗的英雄
const CHANGES = {
  // === HURT ===
  // z7 (Vanguard) hurt
  zombie_7: {
    hurt: [
      { modelId: 116910908, label: 'Big Hit Head From Straight Punch' },
      { modelId: 102460902, label: 'Zombie Reaction Hit Stumble Back' },
    ],
    run: [
      { modelId: 116500901, label: 'Jogging' },
      { modelId: 104230901, label: 'Jogging Slowly' },
    ],
  },
  // z15 (Vampire) hurt + run
  zombie_15: {
    hurt: [
      { modelId: 116890905, label: 'Body Hit By Straight Punch' },
      { modelId: 102460902, label: 'Zombie Reaction Hit Stumble Back' },
    ],
    run: [
      { modelId: 116500901, label: 'Jogging' },
      { modelId: 104230901, label: 'Jogging Slowly' },
    ],
  },
  // z18 (Ninja) hurt
  zombie_18: {
    hurt: [
      { modelId: 116910905, label: 'Big Hit Head From Right Punch' },
      { modelId: 102460902, label: 'Zombie Reaction Hit Stumble Back' },
    ],
  },
  // z19 (Pumpkinhulk) attack + hurt
  zombie_19: {
    attack: [
      { modelId: 114810901, label: 'Casting Spell Two Hands' },
      { modelId: 110980901, label: 'Conjuring Magic And Throwing' },
    ],
    hurt: [
      { modelId: 102460902, label: 'Zombie Reaction Hit Stumble Back' },
      { modelId: 116890906, label: 'Body Hit By Uppercut' },
    ],
  },
  // z20 (Vanguard) hurt + run
  zombie_20: {
    hurt: [
      { modelId: 116900905, label: 'Big Hit From Right Punch' },
      { modelId: 102460902, label: 'Zombie Reaction Hit Stumble Back' },
    ],
    run: [
      { modelId: 116500901, label: 'Jogging' },
      { modelId: 104230901, label: 'Jogging Slowly' },
    ],
  },
  // z21 (Erika Archer) hurt
  zombie_21: {
    hurt: [
      { modelId: 116890906, label: 'Body Hit By Uppercut' },
      { modelId: 102460902, label: 'Zombie Reaction Hit Stumble Back' },
    ],
  },
  // z22 (Vampire) hurt
  zombie_22: {
    hurt: [
      { modelId: 116900902, label: 'Big Hit From Left Punch' },
      { modelId: 102460902, label: 'Zombie Reaction Hit Stumble Back' },
    ],
  },
  // z24 (Exo Gray) attack + hurt
  zombie_24: {
    attack: [
      { modelId: 113920901, label: 'Elbow-Uppercut Strike Combo' },
      { modelId: 113910901, label: 'Jab To Elbow Combo' },
    ],
    hurt: [
      { modelId: 116910908, label: 'Big Hit Head From Straight Punch' },
      { modelId: 102460902, label: 'Zombie Reaction Hit Stumble Back' },
    ],
  },
  // z25 (Warzombie) run (hurt already succeeded with 102460902)
  zombie_25: {
    run: [
      { modelId: 116500901, label: 'Jogging' },
      { modelId: 104230901, label: 'Jogging Slowly' },
    ],
  },
  // z26 (Warrok) hurt + run
  zombie_26: {
    hurt: [
      { modelId: 102460902, label: 'Zombie Reaction Hit Stumble Back' },
      { modelId: 116890905, label: 'Body Hit By Straight Punch' },
    ],
    run: [
      { modelId: 116500901, label: 'Jogging' },
      { modelId: 104230901, label: 'Jogging Slowly' },
    ],
  },
  // z28 (Medea) hurt + run
  zombie_28: {
    hurt: [
      { modelId: 116890905, label: 'Body Hit By Straight Punch' },
      { modelId: 102460902, label: 'Zombie Reaction Hit Stumble Back' },
    ],
    run: [
      { modelId: 116500901, label: 'Jogging' },
      { modelId: 104230901, label: 'Jogging Slowly' },
    ],
  },
  // z29 (Alien Soldier) hurt
  zombie_29: {
    hurt: [
      { modelId: 116900908, label: 'Big Hit From Straight Punch' },
      { modelId: 102460902, label: 'Zombie Reaction Hit Stumble Back' },
    ],
  },
  // z30 (The Boss) hurt
  zombie_30: {
    hurt: [
      { modelId: 116900902, label: 'Big Hit From Left Punch' },
      { modelId: 102460902, label: 'Zombie Reaction Hit Stumble Back' },
    ],
  },
  // z5 (Skeletonzombie) attack (第一輪 Zombie Swipe 失敗)
  zombie_5: {
    attack: [
      { modelId: 102320903, label: 'Zombie Headbutt' },
      { modelId: 102320901, label: 'Zombie Jab Punch Attack' },
    ],
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
      if (d.status === 'failed') throw new Error(`Export FAILED`);
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

  const heroIds = Object.keys(CHANGES).sort((a, b) =>
    parseInt(a.replace('zombie_', '')) - parseInt(b.replace('zombie_', ''))
  );

  let totalAnims = 0;
  for (const h of heroIds) totalAnims += Object.keys(CHANGES[h]).length;
  console.log(`\n🎬 Round 2 下載 — ${heroIds.length} 英雄, ${totalAnims} 動畫類型 (含 fallback)\n`);

  let success = 0, fail = 0;

  for (let i = 0; i < heroIds.length; i++) {
    const heroId = heroIds[i];
    const charId = CHAR_IDS[heroId];
    const changes = CHANGES[heroId];
    const destDir = path.join(MODELS_DIR, heroId);

    console.log(`[${i + 1}/${heroIds.length}] ${heroId}`);
    await api.setPrimary(charId);
    await sleep(500);

    for (const [animType, candidates] of Object.entries(changes)) {
      const fbxDest = path.join(destDir, `${animType}.fbx`);
      let downloaded = false;

      for (const animDef of candidates) {
        console.log(`  ${animType}: trying ${animDef.label} (${animDef.modelId})...`);
        try {
          await api.requestExport(charId, animDef.modelId, animDef.label);
          await sleep(1000);
          const url = await api.waitForExport(charId);
          const size = await api.downloadFile(url, fbxDest);
          console.log(`    ✅ ${(size / 1024).toFixed(0)} KB`);
          success++;
          downloaded = true;
          break; // success, no need for fallback
        } catch (e) {
          console.log(`    ⚠ Failed: ${e.message}`);
        }
        await sleep(1500);
      }

      if (!downloaded) {
        console.log(`    ❌ All candidates failed for ${heroId}/${animType}`);
        fail++;
      }
      await sleep(500);
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`🎉 Round 2 完成！成功: ${success}, 失敗: ${fail}`);
}

main().catch(e => { console.error('❌', e); process.exit(1); });
