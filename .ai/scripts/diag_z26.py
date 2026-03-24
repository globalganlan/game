"""Compare z26 mesh bones vs current vs bak_mixamo_rebind animation bones"""
import bpy
import os

MODELS = r"D:\GlobalGanLan\public\models\zombie_26"

def get_anim_bones(filepath):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=filepath)
    bones = set()
    for action in bpy.data.actions:
        if hasattr(action, 'layers') and len(action.layers) > 0:
            for layer in action.layers:
                for strip in layer.strips:
                    for cb in strip.channelbags:
                        for fc in cb.fcurves:
                            dp = fc.data_path
                            if 'pose.bones["' in dp:
                                bones.add(dp.split('pose.bones["')[1].split('"]')[0])
        elif hasattr(action, 'fcurves'):
            for fc in action.fcurves:
                dp = fc.data_path
                if 'pose.bones["' in dp:
                    bones.add(dp.split('pose.bones["')[1].split('"]')[0])
    return bones

def get_mesh_bones(filepath):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=filepath)
    bones = set()
    for obj in bpy.data.objects:
        if obj.type == 'ARMATURE':
            for bone in obj.data.bones:
                bones.add(bone.name)
    return bones

# Get mesh bones
mesh_bones = get_mesh_bones(os.path.join(MODELS, "zombie_26.glb"))
print(f"\n=== MESH bones: {len(mesh_bones)} ===")

# Get current animation bones
cur_idle = get_anim_bones(os.path.join(MODELS, "zombie_26_idle.glb"))
print(f"\n=== CURRENT idle bones: {len(cur_idle)} ===")
print(f"  anim_only: {sorted(cur_idle - mesh_bones)}")
print(f"  mesh_only: {sorted(mesh_bones - cur_idle)}")

# Get original (bak_mixamo_rebind) animation bones
orig_idle = get_anim_bones(os.path.join(MODELS, "bak_mixamo_rebind", "zombie_26_idle.glb"))
print(f"\n=== ORIGINAL (bak_mixamo_rebind) idle bones: {len(orig_idle)} ===")
print(f"  anim_only: {sorted(orig_idle - mesh_bones)}")
print(f"  mesh_only: {sorted(mesh_bones - orig_idle)}")

# Compare rest poses of shared bones
print(f"\n=== REST POSE COMPARISON ===")
# Load mesh
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(MODELS, "zombie_26.glb"))
mesh_arm = None
for obj in bpy.data.objects:
    if obj.type == 'ARMATURE':
        mesh_arm = obj
        break

if mesh_arm:
    mesh_rest = {}
    for bone in mesh_arm.data.bones:
        mesh_rest[bone.name] = (
            tuple(round(v, 4) for v in bone.head_local),
            tuple(round(v, 4) for v in bone.tail_local),
        )

# Load current anim
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(MODELS, "zombie_26_idle.glb"))
cur_arm = None
for obj in bpy.data.objects:
    if obj.type == 'ARMATURE':
        cur_arm = obj
        break

if cur_arm:
    print("\nShared bones rest pose diff (mesh vs current anim):")
    diffs = 0
    for bone in cur_arm.data.bones:
        if bone.name in mesh_rest:
            cur_head = tuple(round(v, 4) for v in bone.head_local)
            cur_tail = tuple(round(v, 4) for v in bone.tail_local)
            m_head, m_tail = mesh_rest[bone.name]
            if cur_head != m_head or cur_tail != m_tail:
                diffs += 1
                if diffs <= 10:
                    print(f"  {bone.name}:")
                    print(f"    mesh head={m_head} tail={m_tail}")
                    print(f"    anim head={cur_head} tail={cur_tail}")
    print(f"  Total mismatched bones: {diffs} / {len(mesh_rest)}")

# Load original anim
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(MODELS, "bak_mixamo_rebind", "zombie_26_idle.glb"))
orig_arm = None
for obj in bpy.data.objects:
    if obj.type == 'ARMATURE':
        orig_arm = obj
        break

if orig_arm:
    print("\nShared bones rest pose diff (mesh vs ORIGINAL anim):")
    diffs = 0
    for bone in orig_arm.data.bones:
        if bone.name in mesh_rest:
            cur_head = tuple(round(v, 4) for v in bone.head_local)
            cur_tail = tuple(round(v, 4) for v in bone.tail_local)
            m_head, m_tail = mesh_rest[bone.name]
            if cur_head != m_head or cur_tail != m_tail:
                diffs += 1
                if diffs <= 10:
                    print(f"  {bone.name}:")
                    print(f"    mesh head={m_head} tail={m_tail}")
                    print(f"    anim head={cur_head} tail={cur_tail}")
    print(f"  Total mismatched bones: {diffs} / {len(mesh_rest)}")
