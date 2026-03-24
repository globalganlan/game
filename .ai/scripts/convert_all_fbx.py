"""
convert_all_fbx.py — 將所有 30 英雄的 FBX 動畫轉為 GLB
處理所有 zombie_1 ~ zombie_30 目錄中的 *.fbx 檔案

用法：
  D:\Blender\blender.exe --background --python .ai/scripts/convert_all_fbx.py
"""
import bpy
import os

MODELS_DIR = r"D:\GlobalGanLan\public\models"
ANIM_NAMES = ["idle", "attack", "hurt", "dying", "run"]


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_fbx(filepath):
    clear_scene()
    bpy.ops.import_scene.fbx(
        filepath=filepath,
        use_anim=True,
        ignore_leaf_bones=False,
        automatic_bone_orientation=True,
        global_scale=100.0,
    )


def remove_all_meshes():
    for obj in [o for o in bpy.context.scene.objects if o.type == "MESH"]:
        mesh_data = obj.data
        bpy.data.objects.remove(obj, do_unlink=True)
        if mesh_data and mesh_data.users == 0:
            bpy.data.meshes.remove(mesh_data)
    for mat in list(bpy.data.materials):
        if mat.users == 0:
            bpy.data.materials.remove(mat)
    for img in list(bpy.data.images):
        if img.users == 0:
            bpy.data.images.remove(img)


def normalize_bone_prefix(armature):
    """確保骨骼名稱使用 mixamorig: 前綴"""
    changed = 0
    for bone in armature.data.bones:
        if bone.name.startswith("mixamorig:"):
            continue
        for prefix in ["mixamorig_", "mixamorig."]:
            if bone.name.startswith(prefix):
                new_name = "mixamorig:" + bone.name[len(prefix):]
                bone.name = new_name
                changed += 1
                break
    return changed


def export_glb(filepath):
    bpy.ops.export_scene.gltf(
        filepath=filepath,
        export_format='GLB',
        export_animations=True,
        export_skins=True,
        export_morph=False,
        export_lights=False,
        export_cameras=False,
        export_apply=True,
        export_draco_mesh_compression_enable=False,
    )


success = 0
fail = 0
total = 0

print(f"\n{'='*60}")
print("FBX → GLB 動畫轉換（30 英雄 × 5 動畫）")
print(f"{'='*60}\n")

for i in range(1, 31):
    zombie_id = f"zombie_{i}"
    zombie_dir = os.path.join(MODELS_DIR, zombie_id)
    if not os.path.isdir(zombie_dir):
        print(f"⚠ {zombie_id} 目錄不存在!")
        continue

    for anim in ANIM_NAMES:
        fbx_path = os.path.join(zombie_dir, f"{anim}.fbx")
        if not os.path.exists(fbx_path):
            continue

        glb_path = os.path.join(zombie_dir, f"{zombie_id}_{anim}.glb")

        # 備份舊 GLB
        if os.path.exists(glb_path):
            bak_dir = os.path.join(zombie_dir, "bak_anim_audit")
            os.makedirs(bak_dir, exist_ok=True)
            bak_path = os.path.join(bak_dir, f"{zombie_id}_{anim}.glb")
            if not os.path.exists(bak_path):
                import shutil
                shutil.copy2(glb_path, bak_path)

        total += 1
        print(f"  [{total}] {zombie_id}/{anim}.fbx → {zombie_id}_{anim}.glb", end="")

        try:
            import_fbx(fbx_path)

            # 標準化骨骼前綴
            for obj in bpy.context.scene.objects:
                if obj.type == "ARMATURE":
                    n = normalize_bone_prefix(obj)
                    if n:
                        print(f" (renamed {n} bones)", end="")

            # 移除 mesh，只保留骨架 + 動畫
            remove_all_meshes()
            export_glb(glb_path)

            size_kb = os.path.getsize(glb_path) / 1024
            print(f" → {size_kb:.0f} KB ✓")

            # 刪除 FBX
            os.remove(fbx_path)
            success += 1
        except Exception as e:
            print(f" ✗ {e}")
            fail += 1

print(f"\n{'='*60}")
print(f"結果：✅ {success} / ❌ {fail} / 共 {total}")
print(f"{'='*60}")
