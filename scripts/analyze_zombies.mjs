import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();

function parseGLB(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  // Header: magic(4) + version(4) + length(4)
  const magic = view.getUint32(0, true);
  if (magic !== 0x46546C67) throw new Error('Not a GLB file');
  const version = view.getUint32(4, true);

  // Chunk 0 (JSON)
  const chunk0Length = view.getUint32(12, true);
  const chunk0Type = view.getUint32(16, true);
  if (chunk0Type !== 0x4E4F534A) throw new Error('First chunk is not JSON');
  const jsonBytes = buffer.slice(20, 20 + chunk0Length);
  const json = JSON.parse(new TextDecoder().decode(jsonBytes));
  return { version, json };
}

function analyzeZombie(id) {
  const glbPath = join(ROOT, 'public', 'models', `zombie_${id}`, `zombie_${id}.glb`);
  const buf = readFileSync(glbPath);
  const { json } = parseGLB(buf);

  const result = { id, fileSize: buf.length };

  // Nodes
  result.nodeNames = (json.nodes || []).map((n, i) => n.name || `node_${i}`);
  
  // Meshes
  result.meshes = (json.meshes || []).map(m => {
    const prims = m.primitives || [];
    let totalTriangles = 0;
    for (const p of prims) {
      if (p.indices !== undefined) {
        const acc = json.accessors[p.indices];
        totalTriangles += acc.count / 3;
      }
    }
    return {
      name: m.name,
      primitiveCount: prims.length,
      triangles: Math.round(totalTriangles),
      materialIndices: prims.map(p => p.material)
    };
  });

  result.totalTriangles = result.meshes.reduce((s, m) => s + m.triangles, 0);

  // Materials
  result.materials = (json.materials || []).map(mat => {
    const info = { name: mat.name };
    if (mat.pbrMetallicRoughness) {
      const pbr = mat.pbrMetallicRoughness;
      if (pbr.baseColorFactor) info.baseColorFactor = pbr.baseColorFactor;
      if (pbr.baseColorTexture !== undefined) info.hasBaseColorTexture = true;
      if (pbr.metallicFactor !== undefined) info.metallicFactor = pbr.metallicFactor;
      if (pbr.roughnessFactor !== undefined) info.roughnessFactor = pbr.roughnessFactor;
    }
    if (mat.normalTexture) info.hasNormalMap = true;
    if (mat.emissiveFactor) info.emissiveFactor = mat.emissiveFactor;
    if (mat.alphaMode) info.alphaMode = mat.alphaMode;
    if (mat.doubleSided) info.doubleSided = true;
    return info;
  });

  // Textures & Images
  result.textureCount = (json.textures || []).length;
  result.images = (json.images || []).map(img => ({
    name: img.name,
    mimeType: img.mimeType,
    uri: img.uri
  }));

  // Skins (skeleton)
  result.skins = (json.skins || []).map(s => ({
    name: s.name,
    boneCount: (s.joints || []).length
  }));

  // Accessors for bounding box — find position accessors
  // Look through meshes for POSITION attribute
  const posAccessors = [];
  for (const mesh of (json.meshes || [])) {
    for (const prim of (mesh.primitives || [])) {
      if (prim.attributes && prim.attributes.POSITION !== undefined) {
        posAccessors.push(json.accessors[prim.attributes.POSITION]);
      }
    }
  }

  if (posAccessors.length > 0) {
    let minAll = [Infinity, Infinity, Infinity];
    let maxAll = [-Infinity, -Infinity, -Infinity];
    for (const acc of posAccessors) {
      if (acc.min && acc.max) {
        for (let i = 0; i < 3; i++) {
          minAll[i] = Math.min(minAll[i], acc.min[i]);
          maxAll[i] = Math.max(maxAll[i], acc.max[i]);
        }
      }
    }
    result.boundingBox = {
      min: minAll,
      max: maxAll,
      sizeX: +(maxAll[0] - minAll[0]).toFixed(3),
      sizeY: +(maxAll[1] - minAll[1]).toFixed(3),
      sizeZ_height: +(maxAll[2] - minAll[2]).toFixed(3),
      note: 'Z is height (Blender Z-up export)'
    };
  }

  // Bone names (from skin joints → node names)
  if (json.skins && json.skins.length > 0) {
    const joints = json.skins[0].joints || [];
    result.boneNames = joints.map(j => json.nodes[j]?.name || `node_${j}`);
  }

  return result;
}

console.log('=== Zombie GLB Model Analysis ===\n');

for (let id = 1; id <= 14; id++) {
  try {
    const r = analyzeZombie(id);
    console.log(`\n${'='.repeat(60)}`);
    console.log(`  ZOMBIE ${id}  (file: ${(r.fileSize / 1024 / 1024).toFixed(2)} MB)`);
    console.log(`${'='.repeat(60)}`);

    console.log(`\n  Total Triangles: ${r.totalTriangles.toLocaleString()}`);

    console.log(`\n  Meshes (${r.meshes.length}):`);
    for (const m of r.meshes) {
      console.log(`    - "${m.name}" — ${m.triangles.toLocaleString()} tris, ${m.primitiveCount} primitive(s), material(s): [${m.materialIndices.join(', ')}]`);
    }

    console.log(`\n  Materials (${r.materials.length}):`);
    for (const m of r.materials) {
      let desc = `    - "${m.name}"`;
      if (m.baseColorFactor) desc += ` | baseColor: rgba(${m.baseColorFactor.map(v => v.toFixed(3)).join(', ')})`;
      if (m.hasBaseColorTexture) desc += ' | has base color texture';
      if (m.hasNormalMap) desc += ' | has normal map';
      if (m.metallicFactor !== undefined) desc += ` | metallic: ${m.metallicFactor}`;
      if (m.roughnessFactor !== undefined) desc += ` | roughness: ${m.roughnessFactor}`;
      if (m.emissiveFactor) desc += ` | emissive: [${m.emissiveFactor.join(', ')}]`;
      if (m.alphaMode) desc += ` | alpha: ${m.alphaMode}`;
      if (m.doubleSided) desc += ' | doubleSided';
      console.log(desc);
    }

    console.log(`\n  Textures: ${r.textureCount}`);
    if (r.images.length > 0) {
      console.log(`  Images (${r.images.length}):`);
      for (const img of r.images) {
        console.log(`    - "${img.name || '(unnamed)'}" [${img.mimeType || 'unknown'}]`);
      }
    }

    if (r.skins.length > 0) {
      for (const s of r.skins) {
        console.log(`\n  Skeleton: "${s.name}" — ${s.boneCount} bones`);
      }
    }

    if (r.boundingBox) {
      const bb = r.boundingBox;
      console.log(`\n  Bounding Box:`);
      console.log(`    Width  (X): ${bb.sizeX}`);
      console.log(`    Depth  (Y): ${bb.sizeY}`);
      console.log(`    Height (Z): ${bb.sizeZ_height}  ← character height`);
      console.log(`    Min: [${bb.min.map(v => v.toFixed(3)).join(', ')}]`);
      console.log(`    Max: [${bb.max.map(v => v.toFixed(3)).join(', ')}]`);
    }

    // Print node names (non-bone) for appearance hints
    const boneSet = new Set(r.boneNames || []);
    const nonBoneNodes = r.nodeNames.filter(n => !boneSet.has(n));
    if (nonBoneNodes.length > 0) {
      console.log(`\n  Scene Nodes (non-bone):`);
      for (const n of nonBoneNodes) {
        console.log(`    - ${n}`);
      }
    }

    // Print bone names grouped
    if (r.boneNames && r.boneNames.length > 0) {
      console.log(`\n  Bone Names (${r.boneNames.length}):`);
      // Group by prefix
      const grouped = {};
      for (const bn of r.boneNames) {
        const prefix = bn.split(':')[0] || bn.split('.')[0] || 'other';
        if (!grouped[prefix]) grouped[prefix] = [];
        grouped[prefix].push(bn);
      }
      for (const [prefix, bones] of Object.entries(grouped)) {
        if (bones.length <= 5) {
          console.log(`    [${prefix}]: ${bones.join(', ')}`);
        } else {
          console.log(`    [${prefix}]: ${bones.slice(0, 5).join(', ')} ... (${bones.length} total)`);
        }
      }
    }

  } catch (err) {
    console.log(`\n  ZOMBIE ${id}: ERROR — ${err.message}`);
  }
}

console.log('\n\nDone.');
