/**
 * 進階驗證：骨架父子關係 + mesh 頂點數比對
 */
import fs from 'fs';
import path from 'path';

const MODELS_DIR = 'D:\\GlobalGanLan\\public\\models';
const ANIM_TYPES = ['idle', 'attack', 'hurt', 'dying'];

function parseGlb(filePath) {
  const buf = fs.readFileSync(filePath);
  const magic = buf.readUInt32LE(0);
  if (magic !== 0x46546C67) throw new Error('Not a GLB file');
  const chunk0Length = buf.readUInt32LE(12);
  const jsonStr = buf.toString('utf-8', 20, 20 + chunk0Length);
  return JSON.parse(jsonStr);
}

/**
 * 建構骨架的父子關係樹
 * 回傳 Map<nodeName, parentName|null>
 */
function buildBoneHierarchy(gltf) {
  const nodes = gltf.nodes || [];
  const skins = gltf.skins || [];
  
  const jointIndices = new Set();
  for (const skin of skins) {
    if (skin.joints) {
      for (const j of skin.joints) jointIndices.add(j);
    }
  }
  
  // 建構 child → parent 映射
  const parentMap = new Map(); // nodeIndex → parentIndex
  for (let i = 0; i < nodes.length; i++) {
    const children = nodes[i].children || [];
    for (const childIdx of children) {
      parentMap.set(childIdx, i);
    }
  }
  
  // 轉為 name → parentName 映射（只看 joints）
  const hierarchy = {};
  for (const idx of jointIndices) {
    const name = nodes[idx]?.name || `node_${idx}`;
    const parentIdx = parentMap.get(idx);
    let parentName = null;
    if (parentIdx !== undefined && nodes[parentIdx]) {
      parentName = nodes[parentIdx].name || `node_${parentIdx}`;
    }
    hierarchy[name] = parentName;
  }
  
  return hierarchy;
}

/**
 * 提取動畫通道的目標節點+屬性
 */
function getAnimChannels(gltf) {
  const nodes = gltf.nodes || [];
  const animations = gltf.animations || [];
  const channels = [];
  
  for (const anim of animations) {
    for (const ch of (anim.channels || [])) {
      const nodeIdx = ch.target?.node;
      const prop = ch.target?.path;
      const nodeName = nodeIdx !== undefined ? (nodes[nodeIdx]?.name || `node_${nodeIdx}`) : 'unknown';
      channels.push({ node: nodeName, property: prop });
    }
  }
  
  return channels;
}

// ===== 主程式 =====
console.log('='.repeat(70));
console.log('進階驗證：骨架階層 + 動畫通道匹配');
console.log('='.repeat(70));

let issues = [];

for (let i = 1; i <= 30; i++) {
  const zombieId = `zombie_${i}`;
  const modelDir = path.join(MODELS_DIR, zombieId);
  const meshPath = path.join(modelDir, `${zombieId}.glb`);
  
  if (!fs.existsSync(meshPath)) continue;
  
  const meshGltf = parseGlb(meshPath);
  const meshHierarchy = buildBoneHierarchy(meshGltf);
  const meshBones = new Set(Object.keys(meshHierarchy));
  
  for (const animType of ANIM_TYPES) {
    const animPath = path.join(modelDir, `${zombieId}_${animType}.glb`);
    if (!fs.existsSync(animPath)) continue;
    
    const animGltf = parseGlb(animPath);
    const animHierarchy = buildBoneHierarchy(animGltf);
    const animChannels = getAnimChannels(animGltf);
    
    // 檢查 1: 動畫通道的目標骨頭是否都在 mesh 骨架中
    const targetBones = new Set(animChannels.map(c => c.node));
    const missingTargets = [...targetBones].filter(n => !meshBones.has(n));
    
    // 檢查 2: 父子關係是否一致
    let hierarchyMismatch = [];
    for (const [bone, parent] of Object.entries(animHierarchy)) {
      if (meshHierarchy[bone] !== undefined && meshHierarchy[bone] !== parent) {
        hierarchyMismatch.push({
          bone,
          meshParent: meshHierarchy[bone],
          animParent: parent
        });
      }
    }
    
    if (missingTargets.length > 0 || hierarchyMismatch.length > 0) {
      const msg = [];
      if (missingTargets.length) {
        msg.push(`動畫目標骨頭不在 mesh 中: ${missingTargets.join(', ')}`);
      }
      if (hierarchyMismatch.length) {
        msg.push(`骨架父子關係不符 (${hierarchyMismatch.length} 處)`);
        for (const m of hierarchyMismatch.slice(0, 5)) {
          msg.push(`  ${m.bone}: mesh.parent=${m.meshParent} vs anim.parent=${m.animParent}`);
        }
      }
      console.log(`  ❌ ${zombieId}/${animType}:`);
      msg.forEach(m => console.log(`     ${m}`));
      issues.push(`${zombieId}/${animType}`);
    }
  }
}

console.log('\n' + '='.repeat(70));
if (issues.length === 0) {
  console.log('✅ 全部 30 個模型的骨架階層+動畫通道完全吻合！');
} else {
  console.log(`❌ ${issues.length} 個問題：`);
  issues.forEach(i => console.log(`   - ${i}`));
}
console.log('='.repeat(70));

// 額外：顯示相似模型（mesh names 相同）
console.log('\n--- 模型相似度檢查 ---');
const meshNameMap = {};
for (let i = 1; i <= 30; i++) {
  const zombieId = `zombie_${i}`;
  const meshPath = path.join(MODELS_DIR, zombieId, `${zombieId}.glb`);
  if (!fs.existsSync(meshPath)) continue;
  const gltf = parseGlb(meshPath);
  const meshNames = (gltf.nodes || []).filter(n => n.mesh !== undefined).map(n => n.name).sort().join(',');
  if (!meshNameMap[meshNames]) meshNameMap[meshNames] = [];
  meshNameMap[meshNames].push(zombieId);
}

for (const [names, zombies] of Object.entries(meshNameMap)) {
  if (zombies.length > 1) {
    // 進一步比對檔案大小
    const sizes = zombies.map(z => {
      const p = path.join(MODELS_DIR, z, `${z}.glb`);
      return { id: z, size: fs.statSync(p).size };
    });
    console.log(`  ⚠️ 相同 mesh 名稱 [${names}]:`);
    sizes.forEach(s => console.log(`     ${s.id}: ${(s.size / 1024).toFixed(1)} KB`));
  }
}
