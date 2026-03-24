"""
reexport_mesh.py — 重新匯出指定 zombie 的 mesh GLB（修復 Draco 壓縮問題）
用法：D:\Blender\blender.exe --background --python .ai/scripts/reexport_mesh.py -- --only=zombie_28
"""
import bpy
import os
import sys

MODELS_DIR = r"D:\GlobalGanLan\public\models"

def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)

# 解析參數
only = None
if "--" in sys.argv:
    for arg in sys.argv[sys.argv.index("--") + 1:]:
        if arg.startswith("--only="):
            only = arg.split("=")[1]

if not only:
    print("Usage: --only=zombie_28")
    sys.exit(1)

zombie_dir = os.path.join(MODELS_DIR, only)
glb_path = os.path.join(zombie_dir, f"{only}.glb")
bak_path = os.path.join(zombie_dir, f"{only}_bak.glb")

if not os.path.exists(glb_path):
    print(f"✗ {glb_path} not found")
    sys.exit(1)

# 備份
import shutil
if not os.path.exists(bak_path):
    shutil.copy2(glb_path, bak_path)
    print(f"  Backup: {bak_path}")

# 匯入 GLB
clear_scene()
print(f"  Importing {glb_path}...")
bpy.ops.import_scene.gltf(filepath=glb_path)

# 列出場景物件
print(f"  Scene objects: {[o.name for o in bpy.context.scene.objects]}")
mesh_count = sum(1 for o in bpy.context.scene.objects if o.type == 'MESH')
arm_count = sum(1 for o in bpy.context.scene.objects if o.type == 'ARMATURE')
print(f"  Meshes: {mesh_count}, Armatures: {arm_count}")

# 移除動畫（只保留 mesh + skeleton）
for action in list(bpy.data.actions):
    bpy.data.actions.remove(action)
for obj in bpy.context.scene.objects:
    if obj.animation_data:
        obj.animation_data_clear()

# 重新匯出（Draco 壓縮，和 fbx_to_glb.py 相同設定）
print(f"  Exporting {glb_path} (Draco)...")
bpy.ops.export_scene.gltf(
    filepath=glb_path,
    export_format='GLB',
    use_selection=False,
    export_apply=False,
    export_animations=True,
    export_skins=True,
    export_morph=True,
    export_lights=False,
    export_cameras=False,
    export_image_format="JPEG",
    export_jpeg_quality=85,
    export_draco_mesh_compression_enable=True,
    export_draco_mesh_compression_level=6,
    export_draco_position_quantization=14,
    export_draco_normal_quantization=10,
    export_draco_texcoord_quantization=12,
    export_draco_color_quantization=10,
    export_draco_generic_quantization=12,
)

new_size = os.path.getsize(glb_path) / 1024
old_size = os.path.getsize(bak_path) / 1024
print(f"  ✓ Done! {old_size:.0f} KB → {new_size:.0f} KB")
