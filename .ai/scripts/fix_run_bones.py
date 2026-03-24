"""
Blender 5.0: fix run.glb for z22/z23/z24/z30.
Strategy: import z6 run, rename bones in-place, add extra bones, export.
This keeps the action slot binding intact (no cross-armature transfer).
"""
import bpy, os, re

BASE = r"D:\GlobalGanLan\public\models"
SOURCE_RUN = os.path.join(BASE, "zombie_6", "zombie_6_run.glb")
TARGETS = [22, 23, 24, 30]

def clear_scene():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for b in list(bpy.data.actions):
        bpy.data.actions.remove(b)
    for b in list(bpy.data.armatures):
        bpy.data.armatures.remove(b)
    for b in list(bpy.data.meshes):
        bpy.data.meshes.remove(b)

def get_bag(action):
    return action.layers[0].strips[0].channelbags[0]

def get_target_bones(model_dir, name):
    """Import idle.glb temporarily to get bone names and prefix."""
    pre_objs = set(o.name for o in bpy.data.objects)
    pre_acts = set(a.name for a in bpy.data.actions)
    idle_path = os.path.join(model_dir, f"{name}_idle.glb")
    bpy.ops.import_scene.gltf(filepath=idle_path)

    idle_action = None
    for a in bpy.data.actions:
        if a.name not in pre_acts:
            idle_action = a
            break

    bag = get_bag(idle_action)
    bones = set()
    prefix = ""
    for fc in bag.fcurves:
        m = re.match(r'pose\.bones\["(mixamorig\d*:)(.+?)"\]', fc.data_path)
        if m:
            prefix = m.group(1)
            bones.add(m.group(2))

    # Cleanup idle imports
    bpy.data.actions.remove(idle_action)
    for obj in list(bpy.data.objects):
        if obj.name not in pre_objs:
            bpy.data.objects.remove(obj, do_unlink=True)
    for arm in list(bpy.data.armatures):
        if arm.users == 0:
            bpy.data.armatures.remove(arm)

    return bones, prefix

def process(num):
    name = f"zombie_{num}"
    model_dir = os.path.join(BASE, name)
    print(f"\n{'='*50}")
    print(f"  {name}")
    print(f"{'='*50}")
    clear_scene()

    # 1. Get target bone names (generic, without prefix) and target prefix
    target_generic_bones, target_prefix = get_target_bones(model_dir, name)
    print(f"  Target: {len(target_generic_bones)} bones, prefix={target_prefix}")

    # 2. Import z6 run.glb (source)
    clear_scene()
    bpy.ops.import_scene.gltf(filepath=SOURCE_RUN)

    armature = None
    for obj in bpy.data.objects:
        if obj.type == "ARMATURE":
            armature = obj
            break
    if not armature:
        print("  ERROR: no armature")
        return False

    action = armature.animation_data.action
    bag = get_bag(action)

    # Get source prefix
    src_prefix = ""
    src_generic = set()
    for fc in bag.fcurves:
        m = re.match(r'pose\.bones\["(mixamorig\d*:)(.+?)"\]', fc.data_path)
        if m:
            src_prefix = m.group(1)
            src_generic.add(m.group(2))
    print(f"  Source: {len(src_generic)} bones, prefix={src_prefix}")

    # 3. Rename bones on armature (this updates fcurve data_paths automatically)
    if src_prefix != target_prefix:
        print(f"  Renaming bones: {src_prefix} -> {target_prefix}")
        bpy.context.view_layer.objects.active = armature
        bpy.ops.object.mode_set(mode='EDIT')
        for ebone in armature.data.edit_bones:
            if ebone.name.startswith(src_prefix):
                ebone.name = ebone.name.replace(src_prefix, target_prefix, 1)
        bpy.ops.object.mode_set(mode='OBJECT')

    # Verify rename
    renamed_generic = set()
    for fc in bag.fcurves:
        m = re.match(r'pose\.bones\["(mixamorig\d*:)(.+?)"\]', fc.data_path)
        if m:
            renamed_generic.add(m.group(2))
    print(f"  After rename: {len(renamed_generic)} bones with {target_prefix}")

    # 4. Add extra bones in edit mode
    extra = target_generic_bones - renamed_generic
    if extra:
        print(f"  Adding {len(extra)} extra bones: {sorted(extra)}")
        bpy.context.view_layer.objects.active = armature
        bpy.ops.object.mode_set(mode='EDIT')
        root = armature.data.edit_bones.get(target_prefix + "Hips")
        for gname in sorted(extra):
            bn = target_prefix + gname
            eb = armature.data.edit_bones.new(bn)
            eb.head = (0, 0, 0)
            eb.tail = (0, 0.01, 0)
            if root:
                eb.parent = root
        bpy.ops.object.mode_set(mode='OBJECT')

        # Add rest-pose keyframes for extra bones
        for gname in sorted(extra):
            bn = target_prefix + gname
            for i in range(4):
                fc = bag.fcurves.new(
                    data_path=f'pose.bones["{bn}"].rotation_quaternion', index=i)
                val = 1.0 if i == 0 else 0.0
                fc.keyframe_points.insert(0, val).interpolation = "LINEAR"
            for i in range(3):
                fc = bag.fcurves.new(
                    data_path=f'pose.bones["{bn}"].location', index=i)
                fc.keyframe_points.insert(0, 0.0).interpolation = "LINEAR"
            for i in range(3):
                fc = bag.fcurves.new(
                    data_path=f'pose.bones["{bn}"].scale', index=i)
                fc.keyframe_points.insert(0, 1.0).interpolation = "LINEAR"
    else:
        print("  No extra bones")

    # 5. Final count
    final = set()
    for fc in bag.fcurves:
        m = re.match(r'pose\.bones\["(mixamorig\d*:)(.+?)"\]', fc.data_path)
        if m:
            final.add(m.group(2))
    armature_bones = len(armature.data.bones)
    print(f"  Final: {len(final)} anim bones, {armature_bones} armature bones")

    # 6. Export
    bpy.ops.object.select_all(action="DESELECT")
    armature.select_set(True)
    bpy.context.view_layer.objects.active = armature

    output = os.path.join(model_dir, f"{name}_run.glb")
    bpy.ops.export_scene.gltf(
        filepath=output, export_format="GLB",
        use_selection=True, export_animations=True)

    if os.path.exists(output):
        sz = os.path.getsize(output)
        print(f"  OK  {sz:,} bytes")
        return True
    print("  FAIL")
    return False

results = {}
for n in TARGETS:
    results[n] = process(n)
print(f"\n{'='*50}")
for n, ok in results.items():
    print(f"  zombie_{n}: {'OK' if ok else 'FAIL'}")
