"""
strip_position_tracks.py — 從 GLB 動畫中移除 translation channels
保留:
  - rotation (quaternion) — 關節角度，跨骨架通用
  - scale — 通常不變但保留
  - Hips translation — dying/hurt 需要倒地位移
移除:
  - 所有非 Hips 骨骼的 translation — 防止代理骨架比例差異造成的畸變
"""
import struct
import json
import sys
import os

Z7_DIR = os.path.join('public', 'models', 'zombie_7')
ANIMS = ['idle', 'attack', 'hurt', 'dying', 'run']

# 哪些動畫需要保留 Hips position (倒地/位移用)
KEEP_HIPS_POS = {'dying', 'hurt', 'run'}

def process_glb(glb_path, anim_type):
    with open(glb_path, 'rb') as f:
        # GLB header: magic(4) + version(4) + length(4)
        magic, version, total_length = struct.unpack('<III', f.read(12))
        assert magic == 0x46546C67, f'Not a GLB file: {glb_path}'
        
        # JSON chunk: length(4) + type(4) + data
        json_chunk_len, json_chunk_type = struct.unpack('<II', f.read(8))
        assert json_chunk_type == 0x4E4F534A, 'First chunk is not JSON'
        json_data = f.read(json_chunk_len)
        
        # Binary chunk (rest of file)
        remaining = f.read()
    
    gltf = json.loads(json_data)
    
    # Find node names for identifying Hips
    nodes = gltf.get('nodes', [])
    
    anims = gltf.get('animations', [])
    total_removed = 0
    
    for anim in anims:
        channels = anim.get('channels', [])
        new_channels = []
        removed = 0
        
        for ch in channels:
            target = ch.get('target', {})
            path = target.get('path', '')
            node_idx = target.get('node')
            
            if path == 'translation':
                # Check if this is Hips
                node_name = ''
                if node_idx is not None and node_idx < len(nodes):
                    node_name = nodes[node_idx].get('name', '')
                
                is_hips = 'Hips' in node_name
                
                if is_hips and anim_type in KEEP_HIPS_POS:
                    new_channels.append(ch)  # Keep Hips position for dying/hurt/run
                else:
                    removed += 1  # Strip this position track
            else:
                new_channels.append(ch)  # Keep rotation/scale
        
        anim['channels'] = new_channels
        total_removed += removed
    
    # Rebuild GLB
    new_json = json.dumps(gltf, separators=(',', ':')).encode('utf-8')
    # Pad JSON to 4-byte alignment
    while len(new_json) % 4 != 0:
        new_json += b' '
    
    # Rebuild file
    with open(glb_path, 'wb') as f:
        new_total = 12 + 8 + len(new_json) + len(remaining)
        f.write(struct.pack('<III', 0x46546C67, 2, new_total))
        f.write(struct.pack('<II', len(new_json), 0x4E4F534A))
        f.write(new_json)
        f.write(remaining)
    
    return total_removed

# Process all z7 animations
for anim_type in ANIMS:
    glb_path = os.path.join(Z7_DIR, f'zombie_7_{anim_type}.glb')
    if not os.path.exists(glb_path):
        print(f'[SKIP] {glb_path}')
        continue
    
    removed = process_glb(glb_path, anim_type)
    size_kb = os.path.getsize(glb_path) / 1024
    keep_hips = '(kept Hips pos)' if anim_type in KEEP_HIPS_POS else ''
    print(f'[OK] {anim_type}: stripped {removed} position tracks {keep_hips} → {size_kb:.0f} KB')
