import bpy, os, re
BASE = r"D:\GlobalGanLan\public\models"
for num in range(16, 31):
    name = f"zombie_{num}"
    d = os.path.join(BASE, name)
    prefixes_per_anim = {}
    for anim in ["idle", "run"]:
        for obj in list(bpy.data.objects):
            bpy.data.objects.remove(obj, do_unlink=True)
        for a in list(bpy.data.actions):
            bpy.data.actions.remove(a)
        for a in list(bpy.data.armatures):
            bpy.data.armatures.remove(a)
        path = os.path.join(d, f"{name}_{anim}.glb")
        if not os.path.exists(path):
            continue
        bpy.ops.import_scene.gltf(filepath=path)
        for action in bpy.data.actions:
            bag = action.layers[0].strips[0].channelbags[0]
            for fc in bag.fcurves:
                m = re.match(r'pose\.bones\["(mixamorig\d*:)', fc.data_path)
                if m:
                    prefixes_per_anim[anim] = m.group(1)
                    break
    idle_p = prefixes_per_anim.get("idle", "?")
    run_p = prefixes_per_anim.get("run", "?")
    match = "OK" if idle_p == run_p else "MISMATCH"
    print(f"{name}: idle={idle_p} run={run_p} {match}")
