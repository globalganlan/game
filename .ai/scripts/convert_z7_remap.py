"""
convert_z7_remap.py — 將 z7 屍警的 FBX 動畫轉為 animation-only GLB
  1. 匯入 FBX
  2. 移除所有 mesh，只保留 Armature
  3. 匯出為 GLB

用法: blender --background --python convert_z7_remap.py
"""
import bpy
import os

PROJECT = r'D:\GlobalGanLan'
Z7_DIR = os.path.join(PROJECT, 'public', 'models', 'zombie_7')

ANIMS = ['idle', 'attack', 'hurt', 'dying', 'run']


def convert_one(anim_type):
    fbx_path = os.path.join(Z7_DIR, f'{anim_type}.fbx')
    glb_path = os.path.join(Z7_DIR, f'zombie_7_{anim_type}.glb')

    if not os.path.exists(fbx_path):
        print(f'[SKIP] {fbx_path} not found')
        return False

    # 清空場景
    bpy.ops.wm.read_homefile(use_empty=True)

    # 匯入 FBX
    bpy.ops.import_scene.fbx(filepath=fbx_path)
    print(f'[INFO] Imported {fbx_path}')

    # 找到 Armature
    armature = None
    for obj in bpy.data.objects:
        if obj.type == 'ARMATURE':
            armature = obj
            break

    if not armature:
        print(f'[ERROR] No armature found in {fbx_path}')
        return False

    # 刪除所有非 armature 物件（mesh 等），只保留動畫骨架
    for obj in list(bpy.data.objects):
        if obj != armature:
            bpy.data.objects.remove(obj, do_unlink=True)

    bone_names = [b.name for b in armature.data.bones]
    print(f'[INFO] {len(bone_names)} bones, prefix sample: {bone_names[0] if bone_names else "?"}')

    # 匯出 GLB (animation-only)
    bpy.ops.export_scene.gltf(
        filepath=glb_path,
        export_format='GLB',
        export_animations=True,
        export_skins=False,
        export_materials='NONE',
        export_cameras=False,
        export_lights=False,
        export_apply=False,
    )

    size_kb = os.path.getsize(glb_path) / 1024
    print(f'[OK] Exported {glb_path} ({size_kb:.0f} KB)')
    return True


# Main
success = 0
fail = 0
for anim_type in ANIMS:
    try:
        if convert_one(anim_type):
            success += 1
        else:
            fail += 1
    except Exception as e:
        print(f'[ERROR] {anim_type}: {e}')
        import traceback
        traceback.print_exc()
        fail += 1

print(f'\n=== Done: {success} success, {fail} fail ===')
