"""
inspect_model_meshes.py — 掃描所有英雄模型，列出 Mesh 名稱
用於判斷模型是否手持武器（弓、劍、槍等）

用法: D:\Blender\blender.exe --background --python .ai/scripts/inspect_model_meshes.py
"""
import bpy
import os
import json

MODELS_DIR = r"D:\GlobalGanLan\public\models"

results = {}

dirs = sorted(
    [d for d in os.listdir(MODELS_DIR)
     if os.path.isdir(os.path.join(MODELS_DIR, d)) and d.startswith("zombie_")],
    key=lambda x: int(x.replace("zombie_", ""))
)

for dirname in dirs:
    mesh_file = os.path.join(MODELS_DIR, dirname, f"{dirname}.glb")
    if not os.path.exists(mesh_file):
        continue

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=mesh_file)

    meshes = []
    for obj in bpy.data.objects:
        if obj.type == 'MESH':
            # 取得 mesh 的 bounding box 尺寸
            dims = obj.dimensions
            meshes.append({
                'name': obj.name,
                'verts': len(obj.data.vertices),
                'dims': f"{dims.x:.2f}x{dims.y:.2f}x{dims.z:.2f}",
            })

    # 取得 armature 中的特殊骨骼（武器相關）
    weapon_bones = []
    for obj in bpy.data.objects:
        if obj.type == 'ARMATURE':
            for bone in obj.data.bones:
                name_lower = bone.name.lower()
                if any(kw in name_lower for kw in ['weapon', 'sword', 'bow', 'gun', 'shield', 'staff', 'dagger', 'arrow', 'blade', 'axe', 'hammer', 'spear']):
                    weapon_bones.append(bone.name)

    results[dirname] = {
        'meshes': meshes,
        'weapon_bones': weapon_bones,
    }

# 輸出
print("\n" + "=" * 80)
print("MESH & WEAPON INSPECTION REPORT")
print("=" * 80)

for zid in sorted(results.keys(), key=lambda x: int(x.replace("zombie_", ""))):
    info = results[zid]
    mesh_names = [m['name'] for m in info['meshes']]
    
    # 判斷是否有武器
    weapon_hints = []
    for m in info['meshes']:
        name_lower = m['name'].lower()
        if any(kw in name_lower for kw in ['weapon', 'sword', 'bow', 'gun', 'shield', 'staff', 'dagger', 'arrow', 'blade', 'axe', 'hammer', 'spear', 'club', 'knife']):
            weapon_hints.append(f"MESH:{m['name']}")
    for wb in info['weapon_bones']:
        weapon_hints.append(f"BONE:{wb}")
    
    weapon_str = " | ".join(weapon_hints) if weapon_hints else "—"
    mesh_summary = ", ".join(f"{m['name']}({m['verts']}v)" for m in info['meshes'])
    
    print(f"\n{zid}:")
    print(f"  Meshes: {mesh_summary}")
    if weapon_hints:
        print(f"  ⚔️ WEAPONS: {weapon_str}")
    else:
        print(f"  武器: 無")

print("\n" + "=" * 80)
