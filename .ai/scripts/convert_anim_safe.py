"""
convert_anim_safe.py — 安全版動畫轉換器
========================================

使用與 fbx_to_glb.py 相同的 export 設定（export_apply=False），
確保骨骼 rest pose 與 mesh GLB 完全匹配。

⚠️ 不要用 convert_all_fbx.py（export_apply=True 會導致骨架方向不匹配）

用法：
  D:\Blender\blender.exe --background --python .ai/scripts/convert_anim_safe.py
"""
import bpy
import os
import sys

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


def export_glb(filepath):
    """匯出 GLB — 使用與 fbx_to_glb.py 相同的設定"""
    bpy.ops.export_scene.gltf(
        filepath=filepath,
        export_format='GLB',
        use_selection=False,
        export_apply=False,          # ← 關鍵：與 fbx_to_glb.py 相同
        export_animations=True,
        export_skins=True,
        export_morph=True,           # ← 與 fbx_to_glb.py 相同
        export_lights=False,
        export_cameras=False,
        export_image_format="JPEG",
        export_jpeg_quality=85,
        export_draco_mesh_compression_enable=False,
    )


success = 0
fail = 0
total = 0

# 解析 --only 參數
only_list = None
if "--" in sys.argv:
    extra = sys.argv[sys.argv.index("--") + 1:]
    for arg in extra:
        if arg.startswith("--only="):
            only_list = arg.split("=")[1].split(",")

print(f"\n{'='*60}")
print("FBX → GLB 安全動畫轉換（export_apply=False）")
print(f"{'='*60}\n")

for i in range(1, 31):
    zombie_id = f"zombie_{i}"

    if only_list and zombie_id not in only_list:
        continue

    zombie_dir = os.path.join(MODELS_DIR, zombie_id)
    if not os.path.isdir(zombie_dir):
        continue

    for anim in ANIM_NAMES:
        fbx_path = os.path.join(zombie_dir, f"{anim}.fbx")
        if not os.path.exists(fbx_path):
            continue

        glb_path = os.path.join(zombie_dir, f"{zombie_id}_{anim}.glb")
        total += 1
        print(f"  [{total}] {zombie_id}/{anim}.fbx → {zombie_id}_{anim}.glb", end="")

        try:
            import_fbx(fbx_path)
            remove_all_meshes()
            export_glb(glb_path)

            size_kb = os.path.getsize(glb_path) / 1024
            print(f" → {size_kb:.0f} KB ✓")

            # 轉換成功後刪除 FBX
            os.remove(fbx_path)
            success += 1
        except Exception as e:
            print(f" ✗ {e}")
            fail += 1

print(f"\n{'='*60}")
print(f"結果：✅ {success} / ❌ {fail} / 共 {total}")
print(f"{'='*60}")
