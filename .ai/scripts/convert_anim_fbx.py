"""
只轉換動畫 FBX → GLB（不含 mesh geometry）
用於替換已有的動畫 GLB

用法：
  blender --background --python convert_anim_fbx.py
"""
import bpy
import os
import sys
import glob

MODELS_DIR = r"D:\GlobalGanLan\public\models"

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
    """移除所有 Mesh 物件 (保留 Armature + 動畫)"""
    mesh_objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    for obj in mesh_objects:
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

def export_glb(filepath, use_draco=False):
    bpy.ops.export_scene.gltf(
        filepath=filepath,
        export_format='GLB',
        export_animations=True,
        export_skins=True,
        export_morph=False,
        export_lights=False,
        export_cameras=False,
        export_apply=True,
        export_draco_mesh_compression_enable=use_draco,
    )

# 找所有 FBX 檔案
fbx_files = []
for zombie_dir in sorted(glob.glob(os.path.join(MODELS_DIR, "zombie_*"))):
    if not os.path.isdir(zombie_dir):
        continue
    for fbx_path in sorted(glob.glob(os.path.join(zombie_dir, "*.fbx"))):
        fbx_files.append(fbx_path)

if not fbx_files:
    print("No FBX files found!")
    sys.exit(0)

print(f"\n{'='*60}")
print(f"轉換 {len(fbx_files)} 個 FBX 動畫檔")
print(f"{'='*60}\n")

success = 0
fail = 0

for fbx_path in fbx_files:
    fname = os.path.basename(fbx_path)
    zombie_id = os.path.basename(os.path.dirname(fbx_path))
    glb_path = fbx_path.replace('.fbx', '.glb')
    
    # 判斷是否為 idle (含 skin) 或純動畫
    is_idle = '_idle' in fname
    
    print(f"  [{success+fail+1}/{len(fbx_files)}] {zombie_id}/{fname}", end='')
    
    try:
        import_fbx(fbx_path)
        
        if is_idle:
            # idle 含 skin → 需要先移除 mesh，只保留動畫
            # 但 idle 的 mesh 可能跟原始 mesh 不同，只保留動畫部分
            remove_all_meshes()
            export_glb(glb_path, use_draco=False)
        else:
            # 純動畫檔 → 直接移除 mesh，導出動畫
            remove_all_meshes()
            export_glb(glb_path, use_draco=False)
        
        size_kb = os.path.getsize(glb_path) / 1024
        print(f" → {size_kb:.0f} KB ✓")
        
        # 刪除 FBX 原始檔
        os.remove(fbx_path)
        success += 1
    except Exception as e:
        print(f" ✗ {e}")
        fail += 1

print(f"\n{'='*60}")
print(f"結果：✅ {success} / ❌ {fail}")
print(f"{'='*60}")
