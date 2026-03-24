"""
convert_anims_generic.py — 將指定英雄的 FBX 動畫轉為 animation-only GLB
透過環境變數 ZOMBIE_IDS 指定要轉換的英雄 (逗號分隔)

用法: 
  set ZOMBIE_IDS=zombie_24,zombie_30
  blender --background --python .ai/scripts/convert_anims_generic.py
"""
import bpy
import os
import sys

PROJECT = r'D:\GlobalGanLan'
ANIMS = ['idle', 'attack', 'hurt', 'dying', 'run']

zombie_ids_str = os.environ.get('ZOMBIE_IDS', '')
if not zombie_ids_str:
    print('[ERROR] Set ZOMBIE_IDS env var, e.g. ZOMBIE_IDS=zombie_24,zombie_30')
    sys.exit(1)

ZOMBIE_IDS = [z.strip() for z in zombie_ids_str.split(',') if z.strip()]


def convert_one(zombie_id, anim_type):
    zdir = os.path.join(PROJECT, 'public', 'models', zombie_id)
    fbx_path = os.path.join(zdir, f'{anim_type}.fbx')
    glb_path = os.path.join(zdir, f'{zombie_id}_{anim_type}.glb')

    if not os.path.exists(fbx_path):
        print(f'[SKIP] {fbx_path} not found')
        return False

    bpy.ops.wm.read_homefile(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=fbx_path)
    print(f'[INFO] Imported {fbx_path}')

    armature = None
    for obj in bpy.data.objects:
        if obj.type == 'ARMATURE':
            armature = obj
            break

    if not armature:
        print(f'[ERROR] No armature found in {fbx_path}')
        return False

    for obj in list(bpy.data.objects):
        if obj != armature:
            bpy.data.objects.remove(obj, do_unlink=True)

    bone_names = [b.name for b in armature.data.bones]
    print(f'[INFO] {len(bone_names)} bones, prefix: {bone_names[0] if bone_names else "?"}')

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
    print(f'[OK] {glb_path} ({size_kb:.0f} KB)')
    return True


total_s, total_f = 0, 0
for zid in ZOMBIE_IDS:
    print(f'\n=== {zid} ===')
    for anim_type in ANIMS:
        try:
            if convert_one(zid, anim_type):
                total_s += 1
            else:
                total_f += 1
        except Exception as e:
            print(f'[ERROR] {zid}/{anim_type}: {e}')
            import traceback
            traceback.print_exc()
            total_f += 1

print(f'\n=== Done: {total_s} success, {total_f} fail ===')
