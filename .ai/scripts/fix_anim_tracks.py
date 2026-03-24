"""
修復所有模型的動畫骨骼不匹配問題
策略：
  - 移除動畫 GLB 中 mesh 不存在的多餘 bone tracks
  - 修正前綴不一致（z21 attack 的 LeftEye → mixamorig:LeftEye）
  
用法: D:\Blender\blender.exe --background --python .ai/scripts/fix_anim_tracks.py
"""
import bpy
import os
import sys

MODELS_ROOT = r"D:\GlobalGanLan\public\models"
ANIM_TYPES = ["idle", "attack", "hurt", "dying", "run"]

# ============================================================
# Step 1: 建立所有模型的 mesh 骨骼清單
# ============================================================
def get_mesh_bones(zid):
    """讀取 mesh GLB，回傳骨骼名稱 set"""
    mesh_file = os.path.join(MODELS_ROOT, zid, f"{zid}.glb")
    if not os.path.exists(mesh_file):
        return set()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=mesh_file)
    bones = set()
    for obj in bpy.data.objects:
        if obj.type == 'ARMATURE':
            for bone in obj.data.bones:
                bones.add(bone.name)
    return bones


def get_anim_bone_names(action):
    """從 action 取得所有引用的骨骼名稱"""
    names = set()
    fcurves = get_fcurves(action)
    for fc in fcurves:
        dp = fc.data_path
        if 'pose.bones["' in dp:
            name = dp.split('pose.bones["')[1].split('"]')[0]
            names.add(name)
    return names


def get_fcurves(action):
    """相容 Blender 5.0 Baklava 和舊版 API"""
    if hasattr(action, 'layers') and len(action.layers) > 0:
        result = []
        for layer in action.layers:
            for strip in layer.strips:
                for cb in strip.channelbags:
                    result.extend(cb.fcurves)
        return result
    elif hasattr(action, 'fcurves'):
        return list(action.fcurves)
    return []


def fix_animation(zid, anim_type, mesh_bones):
    """修復一個動畫 GLB：移除多餘 tracks / 修正前綴"""
    anim_file = os.path.join(MODELS_ROOT, zid, f"{zid}_{anim_type}.glb")
    if not os.path.exists(anim_file):
        return False, "file not found"

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=anim_file)

    armature = None
    for obj in bpy.data.objects:
        if obj.type == 'ARMATURE':
            armature = obj
            break
    if not armature:
        return False, "no armature"

    action = None
    if armature.animation_data and armature.animation_data.action:
        action = armature.animation_data.action
    elif bpy.data.actions:
        action = bpy.data.actions[0]
    if not action:
        return False, "no action"

    # ---- 分析差異 ----
    anim_bones = get_anim_bone_names(action)
    anim_only = anim_bones - mesh_bones  # 動畫有但 mesh 沒有
    
    if not anim_only:
        return False, "no mismatch"

    # ---- 先嘗試前綴修正（如 LeftEye → mixamorig:LeftEye）----
    rename_map = {}
    for abone in list(anim_only):
        candidate = f"mixamorig:{abone}"
        if candidate in mesh_bones and candidate not in anim_bones:
            rename_map[abone] = candidate

    # ---- 執行修正 ----
    # Blender 5.0 Baklava API: 需要進 Edit Mode 改骨骼名（會自動更新 fcurves）
    if rename_map:
        bpy.context.view_layer.objects.active = armature
        bpy.ops.object.mode_set(mode='EDIT')
        for old_name, new_name in rename_map.items():
            if old_name in armature.data.edit_bones:
                armature.data.edit_bones[old_name].name = new_name
        bpy.ops.object.mode_set(mode='OBJECT')
        # 更新 anim_only
        renamed_old = set(rename_map.keys())
        anim_only = anim_only - renamed_old

    # ---- 移除 anim_only 的 fcurves ----
    removed_count = 0
    if anim_only:
        if hasattr(action, 'layers') and len(action.layers) > 0:
            for layer in action.layers:
                for strip in layer.strips:
                    for cb in strip.channelbags:
                        to_remove = []
                        for fc in cb.fcurves:
                            dp = fc.data_path
                            if 'pose.bones["' in dp:
                                bone_name = dp.split('pose.bones["')[1].split('"]')[0]
                                if bone_name in anim_only:
                                    to_remove.append(fc)
                        for fc in to_remove:
                            cb.fcurves.remove(fc)
                            removed_count += 1
        elif hasattr(action, 'fcurves'):
            to_remove = []
            for fc in action.fcurves:
                dp = fc.data_path
                if 'pose.bones["' in dp:
                    bone_name = dp.split('pose.bones["')[1].split('"]')[0]
                    if bone_name in anim_only:
                        to_remove.append(fc)
            for fc in to_remove:
                action.fcurves.remove(fc)
                removed_count += 1

    # ---- 同步：也移除 armature 中的多餘骨骼 ----
    bpy.context.view_layer.objects.active = armature
    bpy.ops.object.mode_set(mode='EDIT')
    for bone_name in anim_only:
        if bone_name in armature.data.edit_bones:
            armature.data.edit_bones.remove(armature.data.edit_bones[bone_name])
    bpy.ops.object.mode_set(mode='OBJECT')

    # ---- 匯出 ----
    bpy.ops.export_scene.gltf(
        filepath=anim_file,
        export_format='GLB',
        export_animations=True,
        export_skins=True,
        export_yup=True,
        export_apply=False,
    )

    result_parts = []
    if rename_map:
        result_parts.append(f"renamed {len(rename_map)}")
    if removed_count:
        result_parts.append(f"removed {removed_count} fcurves")
    return True, ", ".join(result_parts)


# ============================================================
# 主程式：針對有問題的模型逐一修復
# ============================================================
# 先掃描找出所有需要修復的 (zid, anim_type) 組合
TARGETS = {}  # zid -> [anim_types]

# 掃描所有模型
dirs = sorted(
    [d for d in os.listdir(MODELS_ROOT)
     if os.path.isdir(os.path.join(MODELS_ROOT, d)) and d.startswith("zombie_")],
    key=lambda x: int(x.replace("zombie_", ""))
)

print("\n" + "=" * 60)
print("PHASE 1: Scanning for mismatches...")
print("=" * 60)

for dirname in dirs:
    mesh_bones = get_mesh_bones(dirname)
    if not mesh_bones:
        continue
    
    for anim_type in ANIM_TYPES:
        anim_file = os.path.join(MODELS_ROOT, dirname, f"{dirname}_{anim_type}.glb")
        if not os.path.exists(anim_file):
            continue
        
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=anim_file)
        
        for action in bpy.data.actions:
            anim_bones = get_anim_bone_names(action)
            anim_only = anim_bones - mesh_bones
            if anim_only:
                if dirname not in TARGETS:
                    TARGETS[dirname] = []
                TARGETS[dirname].append(anim_type)
                print(f"  {dirname}/{anim_type}: {len(anim_only)} extra tracks")
            break

print(f"\nTotal: {sum(len(v) for v in TARGETS.values())} animations to fix in {len(TARGETS)} models")

print("\n" + "=" * 60)
print("PHASE 2: Fixing animations...")
print("=" * 60)

for zid in sorted(TARGETS.keys(), key=lambda x: int(x.replace("zombie_", ""))):
    mesh_bones = get_mesh_bones(zid)
    for anim_type in TARGETS[zid]:
        success, msg = fix_animation(zid, anim_type, mesh_bones)
        status = "OK" if success else "SKIP"
        print(f"  [{status}] {zid}/{anim_type}: {msg}")

print("\n" + "=" * 60)
print("PHASE 3: Verification...")
print("=" * 60)

mismatch_count = 0
for zid in sorted(TARGETS.keys(), key=lambda x: int(x.replace("zombie_", ""))):
    mesh_bones = get_mesh_bones(zid)
    for anim_type in TARGETS[zid]:
        anim_file = os.path.join(MODELS_ROOT, zid, f"{zid}_{anim_type}.glb")
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=anim_file)
        for action in bpy.data.actions:
            anim_bones = get_anim_bone_names(action)
            extra = anim_bones - mesh_bones
            if extra:
                print(f"  STILL MISMATCHED: {zid}/{anim_type}: {sorted(extra)}")
                mismatch_count += 1
            else:
                print(f"  OK: {zid}/{anim_type}")
            break

if mismatch_count == 0:
    print("\n*** ALL ANIMATIONS CLEAN — ZERO MISMATCHES ***")
else:
    print(f"\n*** WARNING: {mismatch_count} animations still have mismatches ***")

print("=" * 60)
