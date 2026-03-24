"""
診斷所有模型的 mesh 骨骼 vs 動畫 track 目標差異
用法: D:\Blender\blender.exe --background --python .ai/scripts/diag_bone_mismatch.py

對每個 zombie_N:
1. 讀取 zombie_N.glb (mesh) → 取得所有骨骼名稱
2. 讀取 zombie_N_{idle|attack|hurt|dying|run}.glb → 取得動畫 tracks 的骨骼名稱
3. 比對差異: animation_only (動畫有但 mesh 沒有) / mesh_only (mesh 有但動畫沒有)
"""
import bpy
import os
import json
import sys

MODELS_ROOT = r"D:\GlobalGanLan\public\models"
ANIM_TYPES = ["idle", "attack", "hurt", "dying", "run"]

results = {}

dirs = sorted(
    [d for d in os.listdir(MODELS_ROOT)
     if os.path.isdir(os.path.join(MODELS_ROOT, d)) and d.startswith("zombie_")],
    key=lambda x: int(x.replace("zombie_", ""))
)

for dirname in dirs:
    model_dir = os.path.join(MODELS_ROOT, dirname)
    mesh_file = os.path.join(model_dir, f"{dirname}.glb")
    if not os.path.exists(mesh_file):
        continue

    zid = dirname  # e.g. "zombie_1"
    results[zid] = {}

    # --- 讀取 mesh 骨骼 ---
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=mesh_file)
    mesh_bones = set()
    for obj in bpy.data.objects:
        if obj.type == 'ARMATURE':
            for bone in obj.data.bones:
                mesh_bones.add(bone.name)
    results[zid]["mesh_bone_count"] = len(mesh_bones)

    # --- 對每個動畫 GLB ---
    for anim_type in ANIM_TYPES:
        anim_file = os.path.join(model_dir, f"{dirname}_{anim_type}.glb")
        if not os.path.exists(anim_file):
            results[zid][anim_type] = {"exists": False}
            continue

        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=anim_file)

        # 取得動畫 track 中引用的骨骼名稱
        anim_bones = set()
        for action in bpy.data.actions:
            # Blender 5.0 Baklava API
            if hasattr(action, 'layers') and len(action.layers) > 0:
                for layer in action.layers:
                    for strip in layer.strips:
                        for cb in strip.channelbags:
                            for fc in cb.fcurves:
                                dp = fc.data_path
                                # e.g. 'pose.bones["mixamorigHips"].location'
                                if 'pose.bones["' in dp:
                                    bone_name = dp.split('pose.bones["')[1].split('"]')[0]
                                    anim_bones.add(bone_name)
            # Legacy API fallback
            elif hasattr(action, 'fcurves'):
                for fc in action.fcurves:
                    dp = fc.data_path
                    if 'pose.bones["' in dp:
                        bone_name = dp.split('pose.bones["')[1].split('"]')[0]
                        anim_bones.add(bone_name)

        anim_only = sorted(anim_bones - mesh_bones)
        mesh_only = sorted(mesh_bones - anim_bones)

        entry = {
            "exists": True,
            "anim_bone_count": len(anim_bones),
        }
        if anim_only:
            entry["anim_only"] = anim_only
        if mesh_only:
            entry["mesh_only"] = mesh_only

        results[zid][anim_type] = entry

# --- 輸出 ---
# 只印出有差異的模型
print("\n" + "=" * 80)
print("BONE MISMATCH DIAGNOSTIC REPORT")
print("=" * 80)

has_any_mismatch = False
for zid in sorted(results.keys(), key=lambda x: int(x.replace("zombie_", ""))):
    info = results[zid]
    mismatches = []
    for anim_type in ANIM_TYPES:
        if anim_type not in info:
            continue
        aentry = info[anim_type]
        if not aentry.get("exists"):
            continue
        anim_only = aentry.get("anim_only", [])
        mesh_only = aentry.get("mesh_only", [])
        if anim_only or mesh_only:
            mismatches.append((anim_type, anim_only, mesh_only))

    if mismatches:
        has_any_mismatch = True
        print(f"\n{zid} (mesh bones: {info['mesh_bone_count']})")
        for anim_type, anim_only, mesh_only in mismatches:
            aentry = info[anim_type]
            print(f"  {anim_type} (anim bones: {aentry['anim_bone_count']})")
            if anim_only:
                print(f"    anim_only ({len(anim_only)}): {anim_only}")
            if mesh_only:
                print(f"    mesh_only ({len(mesh_only)}): {mesh_only}")

if not has_any_mismatch:
    print("\nNo mismatches found across all models!")

print("\n" + "=" * 80)
