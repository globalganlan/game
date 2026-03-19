/**
 * 驗證每個 zombie 模型的動畫骨架是否與 mesh 骨架吻合
 * 直接解析 GLB 二進制格式，不需要 Blender
 * 用法: node verify_anim_compat.mjs
 */
import fs from 'fs';
import path from 'path';

const MODELS_DIR = 'D:\\GlobalGanLan\\public\\models';
const ANIM_TYPES = ['idle', 'attack', 'hurt', 'dying', 'run'];

/**
 * 解析 GLB 檔案，提取 glTF JSON 部分
 */
function parseGlb(filePath) {
  const buf = fs.readFileSync(filePath);
  // GLB header: magic(4) + version(4) + length(4) = 12 bytes
  const magic = buf.readUInt32LE(0);
  if (magic !== 0x46546C67) throw new Error('Not a GLB file');
  
  // Chunk 0: JSON
  const chunk0Length = buf.readUInt32LE(12);
  const chunk0Type = buf.readUInt32LE(16);
  if (chunk0Type !== 0x4E4F534A) throw new Error('First chunk is not JSON');
  
  const jsonStr = buf.toString('utf-8', 20, 20 + chunk0Length);
  return JSON.parse(jsonStr);
}

/**
 * 從 glTF JSON 提取骨架關節名稱
 */
function extractSkeletonInfo(gltf) {
  const nodes = gltf.nodes || [];
  const skins = gltf.skins || [];
  const animations = gltf.animations || [];
  
  // 從 skins 取得 joints
  const jointIndices = new Set();
  for (const skin of skins) {
    if (skin.joints) {
      for (const j of skin.joints) jointIndices.add(j);
    }
  }
  
  // 骨骼名稱
  const jointNames = [];
  for (const idx of jointIndices) {
    if (nodes[idx]) {
      jointNames.push(nodes[idx].name || `node_${idx}`);
    }
  }
  jointNames.sort();
  
  // 動畫資訊
  const animInfo = animations.map(a => ({
    name: a.name || 'unnamed',
    channels: a.channels?.length || 0,
    samplers: a.samplers?.length || 0
  }));
  
  // 從動畫 channels 提取被動畫的節點
  const animatedNodeIndices = new Set();
  for (const anim of animations) {
    for (const ch of (anim.channels || [])) {
      if (ch.target?.node !== undefined) {
        animatedNodeIndices.add(ch.target.node);
      }
    }
  }
  const animatedNodeNames = [];
  for (const idx of animatedNodeIndices) {
    if (nodes[idx]) {
      animatedNodeNames.push(nodes[idx].name || `node_${idx}`);
    }
  }
  animatedNodeNames.sort();
  
  // meshes
  const meshNodeNames = [];
  for (const node of nodes) {
    if (node.mesh !== undefined) {
      meshNodeNames.push(node.name || 'unnamed_mesh');
    }
  }
  
  return {
    jointNames,
    jointCount: jointNames.length,
    animatedNodeNames,
    animInfo,
    meshNodeNames,
    totalNodes: nodes.length,
    skinCount: skins.length
  };
}

// ===== 主程式 =====
const results = {};
let issueCount = 0;

for (let i = 1; i <= 30; i++) {
  const zombieId = `zombie_${i}`;
  const modelDir = path.join(MODELS_DIR, zombieId);
  
  if (!fs.existsSync(modelDir)) {
    results[zombieId] = { error: 'DIR_NOT_FOUND' };
    continue;
  }
  
  const meshPath = path.join(modelDir, `${zombieId}.glb`);
  if (!fs.existsSync(meshPath)) {
    results[zombieId] = { error: 'MESH_NOT_FOUND' };
    continue;
  }
  
  let meshInfo;
  try {
    const meshGltf = parseGlb(meshPath);
    meshInfo = extractSkeletonInfo(meshGltf);
  } catch (e) {
    results[zombieId] = { error: `MESH_PARSE_ERROR: ${e.message}` };
    continue;
  }
  
  const entry = {
    mesh_joints: meshInfo.jointCount,
    mesh_meshes: meshInfo.meshNodeNames,
    animations: {}
  };
  
  for (const animType of ANIM_TYPES) {
    const animPath = path.join(modelDir, `${zombieId}_${animType}.glb`);
    if (!fs.existsSync(animPath)) {
      entry.animations[animType] = { status: 'FILE_MISSING' };
      continue;
    }
    
    let animInfo;
    try {
      const animGltf = parseGlb(animPath);
      animInfo = extractSkeletonInfo(animGltf);
    } catch (e) {
      entry.animations[animType] = { status: `PARSE_ERROR: ${e.message}` };
      continue;
    }
    
    // 比對骨架
    const meshJointSet = new Set(meshInfo.jointNames);
    const animJointSet = new Set(animInfo.jointNames);
    
    // 如果動畫 GLB 沒有 skin（純動畫，無幾何體），用 animatedNodeNames 比對
    let comparisonTarget;
    let comparisonLabel;
    if (animInfo.jointCount === 0 && animInfo.animatedNodeNames.length > 0) {
      // 純動畫檔 — 比對被動畫的節點是否都存在於 mesh 的 joints 中
      comparisonTarget = animInfo.animatedNodeNames;
      comparisonLabel = 'animated_nodes';
    } else {
      comparisonTarget = animInfo.jointNames;
      comparisonLabel = 'joints';
    }
    
    const compSet = new Set(comparisonTarget);
    const onlyInMesh = meshInfo.jointNames.filter(n => !compSet.has(n));
    const onlyInAnim = comparisonTarget.filter(n => !meshJointSet.has(n));
    const common = meshInfo.jointNames.filter(n => compSet.has(n));
    
    if (onlyInMesh.length === 0 && onlyInAnim.length === 0) {
      entry.animations[animType] = {
        status: 'PERFECT_MATCH',
        anim_names: animInfo.animInfo.map(a => a.name),
        comparison: comparisonLabel,
        joint_count: meshInfo.jointCount,
        has_mesh: animInfo.meshNodeNames.length > 0
      };
    } else if (onlyInAnim.length === 0 && onlyInMesh.length > 0) {
      // 動畫骨架是 mesh 骨架的子集 — 通常 OK（動畫沒有動到所有骨頭）
      entry.animations[animType] = {
        status: 'SUBSET_OK',
        anim_names: animInfo.animInfo.map(a => a.name),
        comparison: comparisonLabel,
        mesh_joints: meshInfo.jointCount,
        anim_count: comparisonTarget.length,
        common: common.length,
        unused_in_anim: onlyInMesh.length
      };
    } else {
      // 有不匹配的骨頭
      entry.animations[animType] = {
        status: 'MISMATCH',
        anim_names: animInfo.animInfo.map(a => a.name),
        comparison: comparisonLabel,
        mesh_joints: meshInfo.jointCount,
        anim_count: comparisonTarget.length,
        common: common.length,
        only_in_mesh: onlyInMesh.slice(0, 15),
        only_in_anim: onlyInAnim.slice(0, 15),
        only_in_mesh_count: onlyInMesh.length,
        only_in_anim_count: onlyInAnim.length
      };
    }
  }
  
  results[zombieId] = entry;
}

// ===== 輸出報告 =====
const reportPath = path.join(MODELS_DIR, '..', 'anim_compat_report.json');
fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));

console.log('\n' + '='.repeat(70));
console.log('動畫骨架吻合度檢查報告');
console.log('='.repeat(70));

for (let i = 1; i <= 30; i++) {
  const zombieId = `zombie_${i}`;
  const entry = results[zombieId];
  
  if (entry.error) {
    console.log(`  ❌ ${zombieId}: ${entry.error}`);
    issueCount++;
    continue;
  }
  
  const anims = entry.animations || {};
  let hasIssue = false;
  const statusParts = [];
  
  for (const animType of ANIM_TYPES) {
    const info = anims[animType];
    if (!info) continue;
    
    switch (info.status) {
      case 'PERFECT_MATCH':
        statusParts.push(`${animType}:✅`);
        break;
      case 'SUBSET_OK':
        statusParts.push(`${animType}:⚠️(${info.common}/${info.mesh_joints})`);
        break;
      case 'FILE_MISSING':
        statusParts.push(`${animType}:⬜`);
        break;
      case 'MISMATCH':
        hasIssue = true;
        statusParts.push(`${animType}:❌(mesh:${info.only_in_mesh_count} anim:${info.only_in_anim_count})`);
        break;
      default:
        hasIssue = true;
        statusParts.push(`${animType}:❓${info.status}`);
    }
  }
  
  const icon = hasIssue ? '❌' : '✅';
  console.log(`  ${icon} ${zombieId} [${entry.mesh_joints} joints, mesh: ${entry.mesh_meshes?.join(',')}]`);
  console.log(`     ${statusParts.join(' | ')}`);
  
  // 列出不匹配的詳情
  if (hasIssue) {
    issueCount++;
    for (const animType of ANIM_TYPES) {
      const info = anims[animType];
      if (info?.status === 'MISMATCH') {
        console.log(`     ── ${animType} MISMATCH 詳情:`);
        if (info.only_in_mesh?.length) {
          console.log(`        僅在 mesh: ${info.only_in_mesh.join(', ')}`);
        }
        if (info.only_in_anim?.length) {
          console.log(`        僅在 anim: ${info.only_in_anim.join(', ')}`);
        }
      }
    }
  }
}

console.log('\n' + '='.repeat(70));
console.log(`結果：${30 - issueCount}/30 模型動畫吻合 | ${issueCount} 個有問題`);
console.log('='.repeat(70));
