"""
Check ALL z1-z15 proxy heroes for skeleton proportion mismatch.
Compare mesh model's Neck/Head bone positions vs idle animation's Neck/Head.
If they differ significantly, the animation will cause head-sinking artifacts.
"""
import bpy
import os

MODELS_DIR = r"D:\GlobalGanLan\public\models"

def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def get_bone_z(obj, bone_name):
    """Get world Z position of a bone's head."""
    bone = obj.data.bones.get(bone_name)
    if not bone:
        return None
    return (obj.matrix_world @ bone.head_local).z

def check_hero(zombie_id):
    zombie_dir = os.path.join(MODELS_DIR, zombie_id)
    mesh_path = os.path.join(zombie_dir, f"{zombie_id}.glb")
    idle_path = os.path.join(zombie_dir, f"{zombie_id}_idle.glb")
    
    if not os.path.exists(mesh_path) or not os.path.exists(idle_path):
        return None

    # Load mesh model
    clear()
    bpy.ops.import_scene.gltf(filepath=mesh_path)
    mesh_arm = None
    for obj in bpy.context.scene.objects:
        if obj.type == "ARMATURE":
            mesh_arm = obj
            break
    if not mesh_arm:
        return None

    mesh_head = get_bone_z(mesh_arm, "mixamorig:Head")
    mesh_neck = get_bone_z(mesh_arm, "mixamorig:Neck")
    mesh_hips = get_bone_z(mesh_arm, "mixamorig:Hips")
    
    # Load idle animation
    clear()
    bpy.ops.import_scene.gltf(filepath=idle_path)
    anim_arm = None
    for obj in bpy.context.scene.objects:
        if obj.type == "ARMATURE":
            anim_arm = obj
            break
    if not anim_arm:
        return None

    anim_head = get_bone_z(anim_arm, "mixamorig:Head")
    anim_neck = get_bone_z(anim_arm, "mixamorig:Neck")
    anim_hips = get_bone_z(anim_arm, "mixamorig:Hips")

    if mesh_head is None or anim_head is None:
        return None

    # Calculate relative head position (head Z relative to hips Z)
    mesh_rel = mesh_head - mesh_hips if mesh_hips else mesh_head
    anim_rel = anim_head - anim_hips if anim_hips else anim_head
    diff = abs(mesh_rel - anim_rel)
    
    neck_diff = abs((mesh_neck or 0) - (anim_neck or 0))
    head_diff = abs(mesh_head - anim_head)

    return {
        'mesh_head': mesh_head,
        'anim_head': anim_head,
        'head_diff': head_diff,
        'mesh_neck': mesh_neck,
        'anim_neck': anim_neck,
        'neck_diff': neck_diff,
        'rel_diff': diff,
    }

print(f"\n{'='*70}")
print("PROXY HERO SKELETON MISMATCH CHECK (z1-z15)")
print(f"{'='*70}")
print(f"{'Hero':<12} {'MeshHead':>10} {'AnimHead':>10} {'HeadDiff':>10} {'NeckDiff':>10} {'Status'}")
print("-" * 70)

problems = []
for i in range(1, 16):
    zombie_id = f"zombie_{i}"
    result = check_hero(zombie_id)
    if result is None:
        print(f"{zombie_id:<12} {'N/A':>10} {'N/A':>10} {'N/A':>10} {'N/A':>10} SKIP")
        continue
    
    status = "OK" if result['head_diff'] < 5 else "WARN" if result['head_diff'] < 15 else "BAD"
    if status == "BAD":
        problems.append(zombie_id)
    
    print(f"{zombie_id:<12} {result['mesh_head']:>10.1f} {result['anim_head']:>10.1f} {result['head_diff']:>10.1f} {result['neck_diff']:>10.1f} {status}")

print(f"\n{'='*70}")
if problems:
    print(f"PROBLEMATIC heroes (head diff > 15): {', '.join(problems)}")
else:
    print("All heroes have acceptable bone matching!")
print(f"{'='*70}\n")
