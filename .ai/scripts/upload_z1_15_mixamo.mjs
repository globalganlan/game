/**
 * upload_z1_15_mixamo.mjs — 上傳 z1-z15 模型到 Mixamo 取得 charId
 * 
 * 用法: node .ai/scripts/upload_z1_15_mixamo.mjs [--only z1,z2,...] [--test z1]
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

class MixamoAPI {
  constructor(token) {
    this.headers = {
      'Authorization': `Bearer ${token}`,
      'X-Api-Key': 'mixamo2-g',
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    };
  }

  async uploadCharacter(filePath) {
    const fileBuffer = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);
    console.log(`  📤 Step 1: 取得 presigned URL (${fileName}, ${(fileBuffer.length/1024).toFixed(0)} KB)...`);

    const uploadRes = await fetch(`${MIXAMO_API}/characters/upload`, {
      method: 'POST',
      headers: { ...this.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: fileName, filesize: fileBuffer.length }),
    });
    if (!uploadRes.ok) {
      const err = await uploadRes.text();
      throw new Error(`取得上傳 URL 失敗 (${uploadRes.status}): ${err}`);
    }
    const { url: presignedUrl, reference_id: refId } = await uploadRes.json();
    console.log(`  📤 Step 2: 上傳到 S3...`);

    const putRes = await fetch(presignedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: fileBuffer,
    });
    if (!putRes.ok) throw new Error(`S3 上傳失敗 (${putRes.status})`);

    console.log(`  🔗 Step 3: 觸發自動綁骨 (ref: ${refId})...`);
    const rigRes = await fetch(`${MIXAMO_API}/characters`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ reference_id: refId, filename: fileName }),
    });
    if (!rigRes.ok) {
      const err = await rigRes.text();
      throw new Error(`綁骨請求失敗 (${rigRes.status}): ${err}`);
    }
    const rigData = await rigRes.json();
    const characterId = rigData.id || rigData.character_id;
    console.log(`  🆔 charId: ${characterId}`);

    // 等待綁骨完成
    await this.waitForRig(characterId);
    return characterId;
  }

  async waitForRig(characterId, maxWait = 300000) {
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      const r = await fetch(`${MIXAMO_API}/characters/${characterId}`, {
        headers: this.headers,
      });
      if (!r.ok) throw new Error(`查詢綁骨狀態失敗 (${r.status})`);
      const d = await r.json();
      if (d.status === 'completed' || d.status === 'ready') {
        console.log(`  ✅ 綁骨完成！`);
        return d;
      }
      if (d.status === 'failed' || d.status === 'error') {
        throw new Error(`綁骨失敗: ${d.message || d.status}`);
      }
      const p = d.progress ?? '?';
      process.stdout.write(`\r  ⏳ 綁骨進度: ${p}%   `);
      await sleep(3000);
    }
    throw new Error('綁骨超時');
  }
}

async function main() {
  const args = process.argv.slice(2);
  const testArg = args.find(a => a.startsWith('--test'));
  const onlyArg = args.find(a => a.startsWith('--only='));

  let targets;
  if (testArg) {
    // 只測試一個模型
    const testId = args[args.indexOf(testArg) + 1] || 'z1';
    const num = testId.replace('z', '');
    targets = [parseInt(num)];
  } else if (onlyArg) {
    targets = onlyArg.split('=')[1].split(',').map(s => parseInt(s.replace('z', '')));
  } else {
    targets = Array.from({ length: 15 }, (_, i) => i + 1);
  }

  const token = loadToken();
  const api = new MixamoAPI(token);

  console.log(`\n🦴 上傳 z1-z15 到 Mixamo 取得 charId`);
  console.log(`📋 目標: ${targets.map(n => `z${n}`).join(', ')}\n`);

  const results = {};

  for (const num of targets) {
    const heroId = `zombie_${num}`;
    const modelFile = path.join(MODELS_DIR, heroId, `${heroId}.glb`);

    if (!fs.existsSync(modelFile)) {
      console.log(`❌ z${num}: ${modelFile} 不存在`);
      continue;
    }

    console.log(`\n[z${num}] ${heroId}`);
    try {
      const charId = await api.uploadCharacter(modelFile);
      results[heroId] = charId;
      console.log(`  🎯 ${heroId}: ${charId}`);
    } catch (e) {
      console.log(`  ❌ 失敗: ${e.message}`);
      // 如果是 GLB 不支持，嘗試上傳 idle.glb（含 mesh+skin）
      if (e.message.includes('format') || e.message.includes('unsupported')) {
        console.log(`  🔄 嘗試上傳 idle.glb...`);
        const idleFile = path.join(MODELS_DIR, heroId, `${heroId}_idle.glb`);
        if (fs.existsSync(idleFile)) {
          try {
            const charId = await api.uploadCharacter(idleFile);
            results[heroId] = charId;
            console.log(`  🎯 ${heroId}: ${charId}`);
          } catch (e2) {
            console.log(`  ❌ idle.glb 也失敗: ${e2.message}`);
          }
        }
      }
    }

    // Mixamo API 限流：每次上傳之間等
    await sleep(5000);
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 結果：${Object.keys(results).length}/${targets.length} 成功\n`);
  console.log('// ─── 新增到 CHAR_IDS ───');
  for (const [heroId, charId] of Object.entries(results)) {
    console.log(`  ${heroId}: '${charId}',`);
  }

  // 寫入結果到 JSON 檔
  const outFile = path.join(__dirname, 'z1_15_charids.json');
  fs.writeFileSync(outFile, JSON.stringify(results, null, 2));
  console.log(`\n💾 結果已寫入 ${outFile}`);
}

main().catch(e => { console.error('❌', e); process.exit(1); });
