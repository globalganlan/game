/**
 * generate_hero.mjs — 英雄 3D 模型全自動生成管線
 *
 * 功能：AI 生成 3D 模型 → Mixamo 自動綁骨 + 動畫 → Blender 轉 GLB → 大頭照
 *
 * 使用方式：
 *   # 文字生成模型（Meshy text-to-3D）
 *   node .ai/scripts/generate_hero.mjs --id zombie_15 --prompt "A zombie warrior with dark armor and glowing red eyes"
 *
 *   # 圖片生成模型（Meshy image-to-3D）
 *   node .ai/scripts/generate_hero.mjs --id zombie_15 --image ./reference.png
 *
 *   # 已有 FBX/OBJ/GLB，只需綁骨 + 動畫
 *   node .ai/scripts/generate_hero.mjs --id zombie_15 --model ./my_character.fbx
 *
 *   # 跳過 Meshy，只做 Mixamo 動畫 + 轉換（已有綁骨模型）
 *   node .ai/scripts/generate_hero.mjs --id zombie_15 --model ./rigged.fbx --skip-rig
 *
 *   # 只做 FBX→GLB 轉換（已有所有 FBX 動畫檔）
 *   node .ai/scripts/generate_hero.mjs --id zombie_15 --convert-only
 *
 * 前置需求：
 *   - Node.js 18+
 *   - Blender 3.6+（GLB 轉換用）
 *   - .ai/scripts/hero-gen.env（API 金鑰）
 */

import fs from 'fs';
import path from 'path';
import { execSync, spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const MODELS_DIR = path.join(PROJECT_ROOT, 'public', 'models');

// ─── 設定載入 ──────────────────────────────────────────────

function loadEnv() {
  const envPath = path.join(__dirname, 'hero-gen.env');
  if (!fs.existsSync(envPath)) {
    console.error('❌ 找不到 .ai/scripts/hero-gen.env');
    console.error('   請複製 hero-gen.env.example 並填入 API 金鑰：');
    console.error('   cp .ai/scripts/hero-gen.env.example .ai/scripts/hero-gen.env');
    process.exit(1);
  }
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  const env = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    env[key] = value;
  }
  return env;
}

// ─── CLI 參數解析 ──────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    id: null,         // zombie_N
    prompt: null,     // Meshy text prompt
    image: null,      // Meshy image path
    model: null,      // existing FBX/OBJ/GLB path
    skipRig: false,   // skip Mixamo rigging
    convertOnly: false, // skip generation, only FBX→GLB
    skipThumbnail: false,
    artStyle: 'realistic', // Meshy art style
    topology: 'quad',      // Meshy topology
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--id': opts.id = args[++i]; break;
      case '--prompt': opts.prompt = args[++i]; break;
      case '--image': opts.image = args[++i]; break;
      case '--model': opts.model = args[++i]; break;
      case '--skip-rig': opts.skipRig = true; break;
      case '--convert-only': opts.convertOnly = true; break;
      case '--skip-thumbnail': opts.skipThumbnail = true; break;
      case '--art-style': opts.artStyle = args[++i]; break;
      case '--topology': opts.topology = args[++i]; break;
      case '--help': case '-h':
        printHelp();
        process.exit(0);
      default:
        console.error(`未知參數: ${args[i]}`);
        process.exit(1);
    }
  }

  if (!opts.id) {
    console.error('❌ 必須指定 --id (例如 zombie_15)');
    process.exit(1);
  }
  if (!opts.prompt && !opts.image && !opts.model && !opts.convertOnly) {
    console.error('❌ 必須指定 --prompt、--image、--model 或 --convert-only 其中一個');
    process.exit(1);
  }

  return opts;
}

function printHelp() {
  console.log(`
英雄模型自動生成管線
====================

用法：
  node .ai/scripts/generate_hero.mjs --id <zombie_N> [選項]

必要參數：
  --id <zombie_N>       模型 ID（例如 zombie_15）

生成來源（擇一）：
  --prompt <文字>       Meshy text-to-3D 生成描述（英文效果最佳）
  --image <路徑>        Meshy image-to-3D 參考圖片
  --model <路徑>        已有的 FBX/OBJ/GLB 模型檔案
  --convert-only        跳過生成，直接轉換已存在的 FBX 檔案

可選參數：
  --skip-rig            跳過 Mixamo 自動綁骨（模型已有骨架）
  --skip-thumbnail      跳過大頭照生成
  --art-style <style>   Meshy 風格（realistic/cartoon/low-poly/sculpture）
  --topology <type>     Meshy 拓撲（quad/triangle）
  --help, -h            顯示此說明

範例：
  # AI 文字生成
  node .ai/scripts/generate_hero.mjs --id zombie_15 \\
    --prompt "A zombie warrior with dark armor and glowing red eyes"

  # AI 圖片生成
  node .ai/scripts/generate_hero.mjs --id zombie_15 --image ./ref.png

  # 已有模型，只需動畫
  node .ai/scripts/generate_hero.mjs --id zombie_15 --model ./char.fbx

  # 只轉換（FBX 已在 public/models/zombie_15/ 內）
  node .ai/scripts/generate_hero.mjs --id zombie_15 --convert-only
`);
}

// ─── 工具函式 ──────────────────────────────────────────────

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function downloadFile(url, destPath, headers = {}) {
  console.log(`  ⬇️  下載: ${url.slice(0, 80)}...`);
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`下載失敗 (${res.status}): ${url}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(destPath, buffer);
  console.log(`  ✅ 已存: ${path.basename(destPath)} (${(buffer.length / 1024).toFixed(0)} KB)`);
  return destPath;
}

function findBlender() {
  // 1. 環境變數
  const envPath = process.env.BLENDER_PATH;
  if (envPath && fs.existsSync(envPath)) return envPath;

  // 2. 專案常用位置
  const knownPaths = [
    'D:\\Blender\\blender.exe',
    'C:\\Program Files\\Blender Foundation\\Blender 4.0\\blender.exe',
    'C:\\Program Files\\Blender Foundation\\Blender 3.6\\blender.exe',
    'C:\\Program Files\\Blender Foundation\\Blender 5.0\\blender.exe',
  ];
  for (const p of knownPaths) {
    if (fs.existsSync(p)) return p;
  }

  // 3. PATH
  try {
    const result = execSync('where blender', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    const first = result.trim().split('\n')[0].trim();
    if (first && fs.existsSync(first)) return first;
  } catch { /* not in PATH */ }

  return null;
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

// ─── Meshy.ai API 客戶端 ──────────────────────────────────

const MESHY_BASE = 'https://api.meshy.ai/openapi';

class MeshyClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * 文字生成 3D 模型（兩階段：Preview → Refine）
   */
  async textTo3D(prompt, options = {}) {
    console.log('\n🎨 [Meshy] 開始文字生成 3D 模型...');
    console.log(`  提示詞: "${prompt}"`);

    // Stage 1: Preview（快速低精度）
    console.log('\n  📦 Stage 1: 生成預覽模型...');
    const previewRes = await fetch(`${MESHY_BASE}/v2/text-to-3d`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        mode: 'preview',
        prompt,
        art_style: options.artStyle || 'realistic',
        topology: options.topology || 'quad',
        target_polycount: options.polycount || 30000,
      }),
    });
    if (!previewRes.ok) {
      const err = await previewRes.text();
      throw new Error(`Meshy Preview 失敗 (${previewRes.status}): ${err}`);
    }
    const { result: previewTaskId } = await previewRes.json();
    console.log(`  Task ID: ${previewTaskId}`);

    // 等待 Preview 完成
    const previewResult = await this.waitForTask('v2/text-to-3d', previewTaskId);
    console.log(`  ✅ Preview 完成！`);

    // Stage 2: Refine（高精度）
    console.log('\n  🔧 Stage 2: 精細化模型...');
    const refineRes = await fetch(`${MESHY_BASE}/v2/text-to-3d`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        mode: 'refine',
        preview_task_id: previewTaskId,
        texture_richness: 'high',
      }),
    });
    if (!refineRes.ok) {
      const err = await refineRes.text();
      throw new Error(`Meshy Refine 失敗 (${refineRes.status}): ${err}`);
    }
    const { result: refineTaskId } = await refineRes.json();
    console.log(`  Task ID: ${refineTaskId}`);

    // 等待 Refine 完成
    const refineResult = await this.waitForTask('v2/text-to-3d', refineTaskId);
    console.log(`  ✅ Refine 完成！`);

    return refineResult;
  }

  /**
   * 圖片生成 3D 模型
   */
  async imageTo3D(imagePath) {
    console.log('\n🖼️  [Meshy] 開始圖片生成 3D 模型...');
    console.log(`  圖片: ${imagePath}`);

    // 讀取圖片為 base64 data URI
    const imageBuffer = fs.readFileSync(imagePath);
    const ext = path.extname(imagePath).toLowerCase();
    const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';
    const dataUri = `data:${mimeType};base64,${imageBuffer.toString('base64')}`;

    const res = await fetch(`${MESHY_BASE}/v1/image-to-3d`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        image_url: dataUri,
        topology: 'quad',
        target_polycount: 30000,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Meshy Image-to-3D 失敗 (${res.status}): ${err}`);
    }
    const { result: taskId } = await res.json();
    console.log(`  Task ID: ${taskId}`);

    const result = await this.waitForTask('v1/image-to-3d', taskId);
    console.log(`  ✅ 模型生成完成！`);
    return result;
  }

  /**
   * 輪詢等待任務完成
   */
  async waitForTask(endpoint, taskId, maxWait = 600000) {
    const startTime = Date.now();
    let lastStatus = '';

    while (Date.now() - startTime < maxWait) {
      const res = await fetch(`${MESHY_BASE}/${endpoint}/${taskId}`, {
        headers: this.headers,
      });
      if (!res.ok) throw new Error(`查詢任務失敗 (${res.status})`);

      const data = await res.json();

      if (data.status !== lastStatus) {
        lastStatus = data.status;
        const progress = data.progress || 0;
        console.log(`  ⏳ 狀態: ${data.status} (${progress}%)`);
      }

      if (data.status === 'SUCCEEDED') return data;
      if (data.status === 'FAILED' || data.status === 'EXPIRED') {
        throw new Error(`Meshy 任務失敗: ${data.task_error?.message || data.status}`);
      }

      await sleep(5000);
    }
    throw new Error(`Meshy 任務超時 (${maxWait / 1000}s)`);
  }

  /**
   * 從任務結果下載模型檔案
   */
  async downloadModel(taskResult, destDir) {
    ensureDir(destDir);

    // Meshy 回傳多種格式的下載連結
    const urls = taskResult.model_urls || {};
    // 優先下載 FBX（Mixamo 需要），其次 GLB / OBJ
    const formats = ['fbx', 'glb', 'obj'];
    let downloaded = null;

    for (const fmt of formats) {
      if (urls[fmt]) {
        const destFile = path.join(destDir, `generated_model.${fmt}`);
        await downloadFile(urls[fmt], destFile);
        downloaded = destFile;
        if (fmt === 'fbx') break; // FBX 是首選
      }
    }

    if (!downloaded) {
      throw new Error('Meshy 沒有回傳可用的模型下載連結');
    }

    // 也下載貼圖
    if (taskResult.texture_urls) {
      for (const [name, url] of Object.entries(taskResult.texture_urls)) {
        if (url && typeof url === 'string') {
          const texFile = path.join(destDir, `texture_${name}.png`);
          try {
            await downloadFile(url, texFile);
          } catch (e) {
            console.warn(`  ⚠️  貼圖 ${name} 下載失敗: ${e.message}`);
          }
        }
      }
    }

    return downloaded;
  }
}

// ─── Mixamo API 客戶端 ────────────────────────────────────

const MIXAMO_BASE = 'https://www.mixamo.com/api/v1';

// 預設動畫名稱 → Mixamo 搜尋關鍵字 + 推薦動畫 ID
// 這些是經過篩選的，適合喪屍風格遊戲的動畫
const ANIMATION_PRESETS = {
  idle:    { query: 'zombie idle',    fallbackQuery: 'breathing idle',  productId: null },
  attack:  { query: 'zombie attack',  fallbackQuery: 'punch',           productId: null },
  hurt:    { query: 'hit reaction',   fallbackQuery: 'getting hit',     productId: null },
  dying:   { query: 'zombie death',   fallbackQuery: 'dying',           productId: null },
  run:     { query: 'zombie run',     fallbackQuery: 'run forward',     productId: null },
};

class MixamoClient {
  constructor(token, csrf) {
    this.headers = {
      'Authorization': `Bearer ${token}`,
      'X-Api-Key': 'mixamo2-g',
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    };
    if (csrf) {
      this.headers['x-csrf-token'] = csrf;
    }
  }

  /**
   * 上傳角色模型給 Mixamo 進行自動綁骨
   */
  async uploadCharacter(filePath) {
    console.log('\n🦴 [Mixamo] 上傳角色模型進行自動綁骨...');
    console.log(`  檔案: ${path.basename(filePath)}`);

    const fileBuffer = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);

    // Step 1: 取得上傳 URL
    const uploadRes = await fetch(`${MIXAMO_BASE}/characters/upload`, {
      method: 'POST',
      headers: {
        ...this.headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filename: fileName,
        filesize: fileBuffer.length,
      }),
    });
    if (!uploadRes.ok) {
      const err = await uploadRes.text();
      throw new Error(`Mixamo 上傳請求失敗 (${uploadRes.status}): ${err}`);
    }
    const uploadData = await uploadRes.json();
    const { url: presignedUrl, reference_id: refId } = uploadData;

    // Step 2: 上傳檔案到 presigned URL
    console.log('  📤 上傳中...');
    const putRes = await fetch(presignedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: fileBuffer,
    });
    if (!putRes.ok) {
      throw new Error(`Mixamo 檔案上傳失敗 (${putRes.status})`);
    }

    // Step 3: 觸發自動綁骨
    console.log('  🔗 觸發自動綁骨...');
    const rigRes = await fetch(`${MIXAMO_BASE}/characters`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        reference_id: refId,
        filename: fileName,
      }),
    });
    if (!rigRes.ok) {
      const err = await rigRes.text();
      throw new Error(`Mixamo 綁骨請求失敗 (${rigRes.status}): ${err}`);
    }
    const rigData = await rigRes.json();
    const characterId = rigData.id || rigData.character_id;

    console.log(`  角色 ID: ${characterId}`);

    // Step 4: 等待綁骨完成
    await this.waitForRig(characterId);
    console.log('  ✅ 自動綁骨完成！');

    return characterId;
  }

  /**
   * 等待綁骨處理完成
   */
  async waitForRig(characterId, maxWait = 300000) {
    const startTime = Date.now();
    while (Date.now() - startTime < maxWait) {
      const res = await fetch(`${MIXAMO_BASE}/characters/${characterId}`, {
        headers: this.headers,
      });
      if (!res.ok) throw new Error(`查詢綁骨狀態失敗 (${res.status})`);
      const data = await res.json();

      if (data.status === 'completed' || data.status === 'ready') return data;
      if (data.status === 'failed' || data.status === 'error') {
        throw new Error(`Mixamo 綁骨失敗: ${data.message || data.status}`);
      }

      const progress = data.progress ?? '?';
      process.stdout.write(`\r  ⏳ 綁骨進度: ${progress}%   `);
      await sleep(3000);
    }
    throw new Error('Mixamo 綁骨超時');
  }

  /**
   * 搜尋動畫
   */
  async searchAnimations(query, characterId) {
    const params = new URLSearchParams({
      query,
      page: '1',
      limit: '24',
      type: 'Motion',
    });
    if (characterId) params.set('character_id', characterId);

    const res = await fetch(`${MIXAMO_BASE}/products?${params}`, {
      headers: this.headers,
    });
    if (!res.ok) throw new Error(`搜尋動畫失敗 (${res.status})`);
    const data = await res.json();
    return data.results || data.products || [];
  }

  /**
   * 匯出並下載動畫 FBX
   */
  async downloadAnimation(characterId, productId, animName, destPath) {
    console.log(`  🎬 下載動畫: ${animName}...`);

    // 請求匯出
    const exportRes = await fetch(`${MIXAMO_BASE}/exports`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        character_id: characterId,
        product_id: productId,
        product_name: animName,
        preferences: {
          format: 'fbx7_2019',
          skin: 'false',         // 動畫檔不含 mesh
          fps: '30',
          reducekf: 0,
        },
      }),
    });
    if (!exportRes.ok) {
      const err = await exportRes.text();
      throw new Error(`Mixamo 匯出失敗 (${exportRes.status}): ${err}`);
    }
    const exportData = await exportRes.json();
    const exportId = exportData.id || exportData.export_id;

    // 等待匯出完成
    let downloadUrl = null;
    const startTime = Date.now();
    while (Date.now() - startTime < 120000) {
      const statusRes = await fetch(`${MIXAMO_BASE}/exports/${exportId}`, {
        headers: this.headers,
      });
      if (!statusRes.ok) throw new Error(`查詢匯出狀態失敗 (${statusRes.status})`);
      const statusData = await statusRes.json();

      if (statusData.status === 'completed') {
        downloadUrl = statusData.url || statusData.download_url;
        break;
      }
      if (statusData.status === 'failed') {
        throw new Error(`Mixamo 匯出失敗: ${animName}`);
      }
      await sleep(2000);
    }

    if (!downloadUrl) throw new Error(`Mixamo 匯出超時: ${animName}`);

    // 下載 FBX
    await downloadFile(downloadUrl, destPath, this.headers);
    return destPath;
  }

  /**
   * 下載角色 Mesh（含骨骼，T-pose）
   */
  async downloadCharacterMesh(characterId, destPath) {
    console.log('  📦 下載綁骨後的角色模型...');
    const exportRes = await fetch(`${MIXAMO_BASE}/exports`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        character_id: characterId,
        product_id: null,
        preferences: {
          format: 'fbx7_2019',
          skin: 'true',
          fps: '30',
          pose: 'tpose',
        },
      }),
    });
    if (!exportRes.ok) {
      const err = await exportRes.text();
      throw new Error(`Mixamo Mesh 匯出失敗 (${exportRes.status}): ${err}`);
    }
    const exportData = await exportRes.json();
    const exportId = exportData.id || exportData.export_id;

    let downloadUrl = null;
    const startTime = Date.now();
    while (Date.now() - startTime < 120000) {
      const statusRes = await fetch(`${MIXAMO_BASE}/exports/${exportId}`, {
        headers: this.headers,
      });
      const statusData = await statusRes.json();
      if (statusData.status === 'completed') {
        downloadUrl = statusData.url || statusData.download_url;
        break;
      }
      if (statusData.status === 'failed') throw new Error('Mixamo Mesh 匯出失敗');
      await sleep(2000);
    }

    if (!downloadUrl) throw new Error('Mixamo Mesh 匯出超時');
    await downloadFile(downloadUrl, destPath, this.headers);
    return destPath;
  }

  /**
   * 完整動畫下載流程（5 個動畫）
   */
  async downloadAllAnimations(characterId, destDir) {
    console.log('\n🎭 [Mixamo] 下載 5 個動畫（idle / attack / hurt / dying / run）...');
    ensureDir(destDir);

    const results = {};

    for (const [animName, preset] of Object.entries(ANIMATION_PRESETS)) {
      const destFile = path.join(destDir, `${animName}.fbx`);

      // 搜尋適合的動畫
      let products = await this.searchAnimations(preset.query, characterId);
      if (products.length === 0 && preset.fallbackQuery) {
        console.log(`  ⚠️  "${preset.query}" 無結果，嘗試 "${preset.fallbackQuery}"...`);
        products = await this.searchAnimations(preset.fallbackQuery, characterId);
      }

      if (products.length === 0) {
        console.error(`  ❌ 找不到合適的 ${animName} 動畫，請手動至 Mixamo 網站下載`);
        continue;
      }

      // 選第一個結果
      const selectedProduct = products[0];
      const productId = selectedProduct.id || selectedProduct.product_id;
      console.log(`  💡 ${animName}: 選用 "${selectedProduct.description || selectedProduct.name}" (ID: ${productId})`);

      try {
        await this.downloadAnimation(characterId, productId, animName, destFile);
        results[animName] = destFile;
      } catch (err) {
        console.error(`  ❌ ${animName} 下載失敗: ${err.message}`);
      }

      // 避免 rate limit
      await sleep(1000);
    }

    return results;
  }
}

// ─── GLB 轉換器（呼叫 Blender）──────────────────────────────

class GlbConverter {
  constructor(blenderPath) {
    this.blenderPath = blenderPath;
  }

  /**
   * 使用既有的 fbx_to_glb.py 轉換單一 zombie
   */
  convert(zombieId) {
    const scriptPath = path.join(__dirname, 'fbx_to_glb.py');
    if (!fs.existsSync(scriptPath)) {
      throw new Error(`找不到轉換腳本: ${scriptPath}`);
    }

    console.log(`\n⚙️  [Blender] 轉換 ${zombieId} FBX → GLB (Draco 壓縮)...`);

    const cmd = `"${this.blenderPath}" --background --python "${scriptPath}" -- --only ${zombieId}`;
    try {
      const output = execSync(cmd, {
        encoding: 'utf-8',
        cwd: PROJECT_ROOT,
        timeout: 300000, // 5 分鐘
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      // 檢查是否有成功輸出
      if (output.includes('ERROR') && !output.includes('FINISHED')) {
        console.error('  ⚠️  轉換過程出現錯誤，請檢查輸出');
        console.error(output.slice(-500));
      } else {
        console.log('  ✅ GLB 轉換完成！');
      }
    } catch (err) {
      console.error('  ❌ Blender 轉換失敗:', err.message);
      throw err;
    }
  }

  /**
   * 檢查轉換結果
   */
  verify(zombieId) {
    const zombieDir = path.join(MODELS_DIR, zombieId);
    const required = [
      `${zombieId}.glb`,
      `${zombieId}_idle.glb`,
      `${zombieId}_attack.glb`,
      `${zombieId}_hurt.glb`,
      `${zombieId}_dying.glb`,
      `${zombieId}_run.glb`,
    ];

    const results = {};
    let allOk = true;
    for (const file of required) {
      const filePath = path.join(zombieDir, file);
      const exists = fs.existsSync(filePath);
      const size = exists ? fs.statSync(filePath).size : 0;
      results[file] = { exists, size };
      if (!exists) allOk = false;
    }

    return { ok: allOk, files: results };
  }
}

// ─── 大頭照生成器 ──────────────────────────────────────────

async function generateThumbnail(zombieId) {
  console.log(`\n📸 [Thumbnail] 生成大頭照: ${zombieId}...`);

  const thumbnailPath = path.join(MODELS_DIR, zombieId, 'thumbnail.png');
  if (fs.existsSync(thumbnailPath)) {
    // 刪除舊的，重新生成
    fs.unlinkSync(thumbnailPath);
  }

  try {
    // 呼叫現有的 generate_thumbnails.js（它會偵測缺少 thumbnail 的資料夾）
    execSync(`node "${path.join(__dirname, 'generate_thumbnails.js')}"`, {
      encoding: 'utf-8',
      cwd: PROJECT_ROOT,
      timeout: 120000,
      stdio: 'pipe',
    });

    if (fs.existsSync(thumbnailPath)) {
      console.log('  ✅ 大頭照已生成！');
    } else {
      console.log('  ⚠️  大頭照生成可能失敗，請手動檢查');
    }
  } catch (err) {
    console.error('  ⚠️  大頭照生成失敗:', err.message);
    console.error('  可稍後手動執行: node .ai/scripts/generate_thumbnails.js');
  }
}

// ─── 主流程 ───────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  🧟 英雄模型自動生成管線 v1.0');
  console.log('═══════════════════════════════════════════════════');

  const opts = parseArgs();
  const zombieId = opts.id;
  const zombieDir = path.join(MODELS_DIR, zombieId);
  const tempDir = path.join(PROJECT_ROOT, '.ai', 'temp', zombieId);

  console.log(`\n📋 設定:`);
  console.log(`  模型 ID:  ${zombieId}`);
  console.log(`  輸出目錄: ${zombieDir}`);

  ensureDir(zombieDir);
  ensureDir(tempDir);

  // ───────────── Phase 0: 載入設定 ─────────────
  let env = {};
  if (!opts.convertOnly) {
    env = loadEnv();
  }

  // ───────────── Phase 1: 取得 3D 模型 ─────────────
  let modelPath = opts.model;

  if (opts.convertOnly) {
    console.log('\n🔄 [模式] 僅轉換 — 跳過模型生成，使用既有 FBX 檔案');
    // 檢查 FBX 是否已存在
    const idleFbx = path.join(zombieDir, 'idle.fbx');
    if (!fs.existsSync(idleFbx)) {
      throw new Error(`找不到 ${idleFbx}，請確認 FBX 檔案已放入`);
    }
  } else if (opts.prompt || opts.image) {
    // 使用 Meshy 生成
    const meshyKey = env.MESHY_API_KEY;
    if (!meshyKey || meshyKey.includes('your_')) {
      throw new Error('請在 hero-gen.env 中設定有效的 MESHY_API_KEY');
    }
    const meshy = new MeshyClient(meshyKey);

    let taskResult;
    if (opts.prompt) {
      taskResult = await meshy.textTo3D(opts.prompt, {
        artStyle: opts.artStyle,
        topology: opts.topology,
      });
    } else {
      if (!fs.existsSync(opts.image)) {
        throw new Error(`找不到圖片: ${opts.image}`);
      }
      taskResult = await meshy.imageTo3D(opts.image);
    }

    modelPath = await meshy.downloadModel(taskResult, tempDir);
    console.log(`\n  📦 模型已下載: ${modelPath}`);
  } else if (opts.model) {
    if (!fs.existsSync(opts.model)) {
      throw new Error(`找不到模型檔案: ${opts.model}`);
    }
    console.log(`\n📂 使用現有模型: ${opts.model}`);
  }

  // ───────────── Phase 2: Mixamo 綁骨 + 動畫 ─────────────
  if (!opts.convertOnly) {
    const mixamoToken = env.MIXAMO_TOKEN;
    const mixamoCsrf = env.MIXAMO_CSRF;

    if (!mixamoToken || mixamoToken.includes('your_')) {
      console.log('\n⚠️  未設定 MIXAMO_TOKEN，跳過自動綁骨與動畫下載');
      console.log('   請手動至 https://www.mixamo.com/ 下載動畫 FBX：');
      console.log(`   並放入 ${zombieDir}/`);
      console.log('   需要的檔案: idle.fbx, attack.fbx, hurt.fbx, dying.fbx, run.fbx');
      console.log('\n   完成後執行：');
      console.log(`   node .ai/scripts/generate_hero.mjs --id ${zombieId} --convert-only`);
    } else {
      const mixamo = new MixamoClient(mixamoToken, mixamoCsrf);

      // 上傳模型
      const uploadPath = modelPath;
      if (!uploadPath) throw new Error('沒有可上傳的模型檔案');

      let characterId;
      if (opts.skipRig) {
        // 如果不需要綁骨（已有骨架），直接用上傳後的 ID
        // 但仍需上傳以取得 character_id 供動畫下載
        characterId = await mixamo.uploadCharacter(uploadPath);
      } else {
        characterId = await mixamo.uploadCharacter(uploadPath);
      }

      // 下載綁骨後的 Mesh
      const meshFbxPath = path.join(zombieDir, 'idle.fbx');
      await mixamo.downloadCharacterMesh(characterId, meshFbxPath);

      // 下載 5 個動畫
      const animResults = await mixamo.downloadAllAnimations(characterId, zombieDir);

      // 檢查結果
      const expectedAnims = ['idle', 'attack', 'hurt', 'dying', 'run'];
      const missing = expectedAnims.filter(a => !animResults[a]);
      if (missing.length > 0) {
        console.log(`\n⚠️  以下動畫需要手動下載: ${missing.join(', ')}`);
        console.log(`   請至 Mixamo 網站下載對應 FBX 放入 ${zombieDir}/`);
      }
    }
  }

  // ───────────── Phase 3: FBX → GLB 轉換 ─────────────
  const blenderPath = findBlender();
  if (!blenderPath) {
    console.error('\n❌ 找不到 Blender！');
    console.error('   請安裝 Blender 3.6+ 並確保可被偵測到：');
    console.error('   - D:\\Blender\\blender.exe');
    console.error('   - 或加入 PATH');
    console.error('   - 或在 hero-gen.env 設定 BLENDER_PATH');
    console.error('\n   安裝 Blender：winget install BlenderFoundation.Blender');
    process.exit(1);
  }
  console.log(`\n🔧 Blender: ${blenderPath}`);

  const converter = new GlbConverter(blenderPath);
  converter.convert(zombieId);

  // 驗證轉換結果
  const verifyResult = converter.verify(zombieId);
  console.log('\n📊 轉換結果檢查:');
  for (const [file, info] of Object.entries(verifyResult.files)) {
    const status = info.exists ? `✅ ${(info.size / 1024).toFixed(0)} KB` : '❌ 缺少';
    console.log(`  ${file}: ${status}`);
  }

  if (!verifyResult.ok) {
    console.error('\n⚠️  部分 GLB 檔案缺少，請檢查 FBX 來源檔案');
  }

  // ───────────── Phase 4: 大頭照 ─────────────
  if (!opts.skipThumbnail && verifyResult.ok) {
    await generateThumbnail(zombieId);
  }

  // ───────────── 清理暫存 ─────────────
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  // ───────────── 完成報告 ─────────────
  console.log('\n═══════════════════════════════════════════════════');
  console.log(`  ✅ ${zombieId} 模型生成完成！`);
  console.log('═══════════════════════════════════════════════════');
  console.log(`\n📁 檔案位置: ${zombieDir}`);
  console.log('\n📋 下一步：');
  console.log(`  1. 在 Google Sheets heroes 表新增英雄記錄（ModelID = "${zombieId}"）`);
  console.log('  2. 部署 Workers 以同步資料：cd workers && npx wrangler deploy');
  console.log('  3. 開啟遊戲確認模型顯示正常');
  console.log(`\n💡 測試模型：在瀏覽器 console 執行`);
  console.log(`   fetch('/models/${zombieId}/${zombieId}.glb').then(r => console.log('OK', r.status))`);
}

// ─── 執行 ────────────────────────────────────────────────

main().catch(err => {
  console.error('\n💀 流程發生錯誤:', err.message);
  process.exit(1);
});
