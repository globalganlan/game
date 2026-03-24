"""
Blender Python script: fix run.glb bone count mismatch.

For z22(68), z23(79), z24(112), z30(68) — their run.glb has 65 bones
but the model skeleton has more. This script:
1. Imports idle.glb to get the full skeleton bone names
2. Imports run.glb to get the run animation action
3. Adds rest-pose keyframes for missing bones
4. Exports a new run.glb with correct bone count

Usage: D:\Blender\blender.exe --background --python .ai/scripts/fix_run_bones.py
"""
import bpy
import os

BASE = r"D:\GlobalGanLan\public\models"
TARGETS = [22, 23, 24, 30]


def clear_scene():
    """Remove all objects and orphan data blocks."""
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for block in list(bpy.data.actions):
        bpy.data.actions.remove(block)
    for block in list(bpy.data.armatures):
        bpy.data.armatures.remove(block)
    for block in list(bpy.data.meshes):
        bpy.data.meshes.remove(block)
    for block in list(bpy.data.cameras):
        bpy.data.cameras.remove(block)
    for block in list(bpy.data.lights):
        bpy.data.lights.remove(block)


def process_model(num):
    name = f"zombie_{num}"
    model_dir = os.path.join(BASE, name)

    print(f"\n{'='*50}")
    print(f"  Processing {name}")
    print(f"{'='*50}")

    # 1. Clear scene
    clear_scene()

    # 2. Import idle.glb (animation-only, has full skeleton)
    idle_path = os.path.join(model_dir, f"{name}_idle.glb")
    if not os.path.exists(idle_path):
        print(f"  ERROR: {idle_path} not found")
        return False

    bpy.ops.import_scene.gltf(filepath=idle_path)

    # Find armature
    armature = None
    for obj in bpy.data.objects:
        if obj.type == 'ARMATURE':
            armature = obj
            break

    if not armature:
        print(f"  ERROR: No armature in idle.glb")
        return False

    all_bones = set(b.name for b in armature.data.bones)
    print(f"  Skeleton: {len(all_bones)} bones")

    # Remove idle action
    if armature.animation_data and armature.animation_data.action:
        idle_action = armature.animation_data.action
        armature.animation_data.action = None
        bpy.data.actions.remove(idle_action)

    # 3. Track state, then import run.glb
    pre_actions = set(a.name for a in bpy.data.actions)
    pre_objects = set(o.name for o in bpy.data.objects)

    run_path = os.path.join(model_dir, f"{name}_run.glb")
    if not os.path.exists(run_path):
        print(f"  ERROR: {run_path} not found")
        return False

    bpy.ops.import_scene.gltf(filepath=run_path)

    # Find newly imported run action
    run_action = None
    for a in bpy.data.actions:
        if a.name not in pre_actions:
            run_action = a
            break

    if not run_action:
        print(f"  ERROR: No run action imported")
        return False

    # 4. Analyze run action bones
    run_bones = set()
    for fc in run_action.fcurves:
        if fc.data_path.startswith('pose.bones["'):
            run_bones.add(fc.data_path.split('"')[1])

    print(f"  Run action: {len(run_bones)} bones, {len(run_action.fcurves)} fcurves")

    # 5. Add rest-pose tracks for missing bones
    missing = all_bones - run_bones
    if not missing:
        print(f"  Already matched — skipping")
        return True

    print(f"  Adding {len(missing)} missing bones: {sorted(missing)}")

    for bn in sorted(missing):
        # Quaternion rotation: identity (w=1, x=0, y=0, z=0)
        for i in range(4):
            fc = run_action.fcurves.new(
                data_path=f'pose.bones["{bn}"].rotation_quaternion',
                index=i
            )
            val = 1.0 if i == 0 else 0.0
            fc.keyframe_points.insert(0, val).interpolation = 'LINEAR'

        # Location: zero (= rest pose)
        for i in range(3):
            fc = run_action.fcurves.new(
                data_path=f'pose.bones["{bn}"].location',
                index=i
            )
            fc.keyframe_points.insert(0, 0.0).interpolation = 'LINEAR'

        # Scale: one (= rest pose)
        for i in range(3):
            fc = run_action.fcurves.new(
                data_path=f'pose.bones["{bn}"].scale',
                index=i
            )
            fc.keyframe_points.insert(0, 1.0).interpolation = 'LINEAR'

    # Verify final count
    final_bones = set()
    for fc in run_action.fcurves:
        if fc.data_path.startswith('pose.bones["'):
            final_bones.add(fc.data_path.split('"')[1])
    print(f"  Final: {len(final_bones)} bones, {len(run_action.fcurves)} fcurves")

    # 6. Assign enhanced action to main armature
    if not armature.animation_data:
        armature.animation_data_create()
    armature.animation_data.action = run_action
    run_action.name = "Armature|mixamo.com|Layer0"

    # 7. Remove imported run armature and extras
    for obj in list(bpy.data.objects):
        if obj.name not in pre_objects:
            bpy.data.objects.remove(obj, do_unlink=True)

    # 8. Export
    bpy.ops.object.select_all(action='DESELECT')
    armature.select_set(True)
    bpy.context.view_layer.objects.active = armature

    output = os.path.join(model_dir, f"{name}_run.glb")
    bpy.ops.export_scene.gltf(
        filepath=output,
        export_format='GLB',
        use_selection=True,
        export_animations=True,
    )

    if os.path.exists(output):
        size = os.path.getsize(output)
        print(f"  OK  Exported: {output} ({size:,} bytes)")
        return True
    else:
        print(f"  FAIL  Export failed: {output}")
        return False


# Main
results = {}
for num in TARGETS:
    results[num] = process_model(num)

print(f"\n{'='*50}")
print("  Summary")
print(f"{'='*50}")
for num, ok in results.items():
    status = "OK" if ok else "FAIL"
    print(f"  zombie_{num}: {status}")
print(f"{'='*50}")
