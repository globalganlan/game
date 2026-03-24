"""Check bone name prefixes across idle and run for z22/z23/z24/z30."""
import bpy, os, re

BASE = r"D:\GlobalGanLan\public\models"

for num in [6, 22, 23, 24, 30]:
    name = f"zombie_{num}"
    d = os.path.join(BASE, name)
    for anim in ["idle", "run"]:
        for obj in list(bpy.data.objects):
            bpy.data.objects.remove(obj, do_unlink=True)
        for a in list(bpy.data.actions):
            bpy.data.actions.remove(a)
        for a in list(bpy.data.armatures):
            bpy.data.armatures.remove(a)

        path = os.path.join(d, f"{name}_{anim}.glb")
        if not os.path.exists(path):
            print(f"{name} {anim}: FILE NOT FOUND")
            continue
        bpy.ops.import_scene.gltf(filepath=path)
        for action in bpy.data.actions:
            bag = action.layers[0].strips[0].channelbags[0]
            prefixes = set()
            for fc in bag.fcurves:
                m = re.match(r'pose\.bones\["(mixamorig\d*:)', fc.data_path)
                if m:
                    prefixes.add(m.group(1))
            bones = set()
            for fc in bag.fcurves:
                if fc.data_path.startswith('pose.bones["'):
                    bones.add(fc.data_path.split('"')[1])
            print(f"{name} {anim}: prefixes={prefixes} bones={len(bones)}")
