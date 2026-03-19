"""
Blender Python 腳本：驗證每個 zombie 模型的動畫骨架是否與 mesh 骨架吻合。
用法：blender --background --python verify_anim_compat.py
"""
import bpy
import os
import sys
import json

MODELS_DIR = r"D:\GlobalGanLan\public\models"
ANIM_TYPES = ["idle", "attack", "hurt", "dying", "run"]

def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def get_armature_bones(glb_path):
    """載入 GLB 並提取骨架的骨頭名稱列表"""
    clear_scene()
    try:
        bpy.ops.import_scene.gltf(filepath=glb_path)
    except Exception as e:
        return None, str(e)
    
    # 找到 Armature
    armatures = [obj for obj in bpy.data.objects if obj.type == 'ARMATURE']
    if not armatures:
        return None, "NO_ARMATURE"
    
    armature = armatures[0]
    bone_names = sorted([b.name for b in armature.data.bones])
    return bone_names, None

def get_animation_info(glb_path):
    """載入 GLB 並提取動畫資訊（骨頭名 + 動畫名 + 幀數）"""
    clear_scene()
    try:
        bpy.ops.import_scene.gltf(filepath=glb_path)
    except Exception as e:
        return None, None, 0, str(e)
    
    armatures = [obj for obj in bpy.data.objects if obj.type == 'ARMATURE']
    if not armatures:
        return None, None, 0, "NO_ARMATURE"
    
    armature = armatures[0]
    bone_names = sorted([b.name for b in armature.data.bones])
    
    # 取得動畫
    actions = list(bpy.data.actions)
    anim_name = actions[0].name if actions else "NO_ACTION"
    frame_count = 0
    if actions:
        action = actions[0]
        frame_range = action.frame_range
        frame_count = int(frame_range[1] - frame_range[0])
    
    return bone_names, anim_name, frame_count, None

results = {}

for i in range(1, 31):
    zombie_id = f"zombie_{i}"
    model_dir = os.path.join(MODELS_DIR, zombie_id)
    
    if not os.path.isdir(model_dir):
        results[zombie_id] = {"error": "DIR_NOT_FOUND"}
        continue
    
    mesh_path = os.path.join(model_dir, f"{zombie_id}.glb")
    if not os.path.exists(mesh_path):
        results[zombie_id] = {"error": "MESH_NOT_FOUND"}
        continue
    
    # 取得 mesh 骨架
    mesh_bones, err = get_armature_bones(mesh_path)
    if err:
        results[zombie_id] = {"error": f"MESH_LOAD_ERROR: {err}"}
        continue
    
    entry = {
        "mesh_bone_count": len(mesh_bones),
        "animations": {}
    }
    
    for anim_type in ANIM_TYPES:
        anim_path = os.path.join(model_dir, f"{zombie_id}_{anim_type}.glb")
        if not os.path.exists(anim_path):
            entry["animations"][anim_type] = {"status": "FILE_MISSING"}
            continue
        
        anim_bones, anim_name, frame_count, err = get_animation_info(anim_path)
        if err:
            entry["animations"][anim_type] = {"status": f"LOAD_ERROR: {err}"}
            continue
        
        # 比對骨架
        if anim_bones == mesh_bones:
            entry["animations"][anim_type] = {
                "status": "OK",
                "anim_name": anim_name,
                "frames": frame_count,
                "bone_count": len(anim_bones)
            }
        else:
            # 找出差異
            mesh_set = set(mesh_bones)
            anim_set = set(anim_bones)
            only_in_mesh = sorted(mesh_set - anim_set)
            only_in_anim = sorted(anim_set - mesh_set)
            common = sorted(mesh_set & anim_set)
            
            entry["animations"][anim_type] = {
                "status": "MISMATCH",
                "anim_name": anim_name,
                "frames": frame_count,
                "mesh_bone_count": len(mesh_bones),
                "anim_bone_count": len(anim_bones),
                "common_bones": len(common),
                "only_in_mesh": only_in_mesh[:10],  # 只列前10個
                "only_in_anim": only_in_anim[:10],
                "only_in_mesh_count": len(only_in_mesh),
                "only_in_anim_count": len(only_in_anim)
            }
    
    results[zombie_id] = entry

# 輸出結果
output_path = os.path.join(MODELS_DIR, "..", "anim_compat_report.json")
with open(output_path, "w", encoding="utf-8") as f:
    json.dump(results, f, indent=2, ensure_ascii=False)

# 摘要
print("\n" + "="*60)
print("動畫吻合度檢查報告")
print("="*60)

issues = []
for zombie_id in sorted(results.keys(), key=lambda x: int(x.split("_")[1])):
    entry = results[zombie_id]
    if "error" in entry:
        print(f"  {zombie_id}: ERROR - {entry['error']}")
        issues.append(zombie_id)
        continue
    
    anims = entry.get("animations", {})
    zombie_ok = True
    for anim_type, info in sorted(anims.items()):
        status = info.get("status", "UNKNOWN")
        if status == "OK":
            pass  # good
        elif status == "FILE_MISSING":
            pass  # acceptable for run.glb on zombie_16~30
        elif status == "MISMATCH":
            zombie_ok = False
            mesh_bc = info.get("mesh_bone_count", 0)
            anim_bc = info.get("anim_bone_count", 0)
            common = info.get("common_bones", 0)
            only_mesh = info.get("only_in_mesh_count", 0)
            only_anim = info.get("only_in_anim_count", 0)
            print(f"  {zombie_id}/{anim_type}: MISMATCH - mesh:{mesh_bc} anim:{anim_bc} common:{common} only_mesh:{only_mesh} only_anim:{only_anim}")
            if info.get("only_in_mesh"):
                print(f"    only_in_mesh: {info['only_in_mesh']}")
            if info.get("only_in_anim"):
                print(f"    only_in_anim: {info['only_in_anim']}")
        else:
            zombie_ok = False
            print(f"  {zombie_id}/{anim_type}: {status}")
    
    if not zombie_ok:
        issues.append(zombie_id)

print("\n" + "="*60)
if issues:
    print(f"有問題的模型 ({len(issues)}): {', '.join(issues)}")
else:
    print("全部 30 個模型的動畫骨架均吻合 ✓")
print("="*60)
print(f"\n詳細報告: {output_path}")
