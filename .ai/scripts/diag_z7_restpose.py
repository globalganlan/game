"""Diagnose z7 rest pose - check head bone position relative to body."""
import bpy
import os

def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)

# Step 1: Check mesh model rest pose
clear()
bpy.ops.import_scene.gltf(filepath=r"D:\GlobalGanLan\public\models\zombie_7\zombie_7.glb")

for obj in bpy.context.scene.objects:
    if obj.type == "ARMATURE":
        arm = obj
        print(f"\n=== MESH MODEL ARMATURE: {arm.name} ===")
        print(f"Bone count: {len(arm.data.bones)}")
        
        # Check key bones positions
        for bone_name in ["mixamorig:Hips", "mixamorig:Spine", "mixamorig:Spine1", 
                          "mixamorig:Spine2", "mixamorig:Neck", "mixamorig:Head",
                          "mixamorig:LeftShoulder", "mixamorig:RightShoulder"]:
            bone = arm.data.bones.get(bone_name)
            if bone:
                head_world = arm.matrix_world @ bone.head_local
                tail_world = arm.matrix_world @ bone.tail_local
                print(f"  {bone_name}:")
                print(f"    head: ({head_world.x:.3f}, {head_world.y:.3f}, {head_world.z:.3f})")
                print(f"    tail: ({tail_world.x:.3f}, {tail_world.y:.3f}, {tail_world.z:.3f})")
                print(f"    length: {bone.length:.4f}")
            else:
                print(f"  {bone_name}: NOT FOUND")
        
        # Check if there are embedded animations
        print(f"\n  Embedded actions: {len(bpy.data.actions)}")
        for act in bpy.data.actions:
            print(f"    - {act.name} ({len(act.fcurves) if hasattr(act, 'fcurves') else '?'} curves)")

# Step 2: Check idle animation bone references
print("\n\n=== IDLE ANIMATION ===")
clear()
bpy.ops.import_scene.fbx(
    filepath=r"D:\GlobalGanLan\public\models\zombie_7\idle.fbx",
    use_anim=True, ignore_leaf_bones=False,
    automatic_bone_orientation=True, global_scale=100.0)

for obj in bpy.context.scene.objects:
    if obj.type == "ARMATURE":
        arm = obj
        print(f"Anim armature: {arm.name}, bones: {len(arm.data.bones)}")
        for bone_name in ["mixamorig:Hips", "mixamorig:Spine", "mixamorig:Spine1",
                          "mixamorig:Spine2", "mixamorig:Neck", "mixamorig:Head"]:
            bone = arm.data.bones.get(bone_name)
            if bone:
                head_world = arm.matrix_world @ bone.head_local
                tail_world = arm.matrix_world @ bone.tail_local
                print(f"  {bone_name}:")
                print(f"    head: ({head_world.x:.3f}, {head_world.y:.3f}, {head_world.z:.3f})")
                print(f"    tail: ({tail_world.x:.3f}, {tail_world.y:.3f}, {tail_world.z:.3f})")
                print(f"    length: {bone.length:.4f}")

# Step 3: Check backup idle for comparison
print("\n\n=== BACKUP IDLE ANIMATION ===")
clear()
bak_path = r"D:\GlobalGanLan\public\models\zombie_7\bak_anim_audit\zombie_7_idle.glb"
if os.path.exists(bak_path):
    bpy.ops.import_scene.gltf(filepath=bak_path)
    for obj in bpy.context.scene.objects:
        if obj.type == "ARMATURE":
            arm = obj
            print(f"Backup anim armature: {arm.name}, bones: {len(arm.data.bones)}")
            for bone_name in ["mixamorig:Hips", "mixamorig:Spine", "mixamorig:Spine1",
                              "mixamorig:Spine2", "mixamorig:Neck", "mixamorig:Head"]:
                bone = arm.data.bones.get(bone_name)
                if bone:
                    head_world = arm.matrix_world @ bone.head_local
                    tail_world = arm.matrix_world @ bone.tail_local
                    print(f"  {bone_name}:")
                    print(f"    head: ({head_world.x:.3f}, {head_world.y:.3f}, {head_world.z:.3f})")
                    print(f"    tail: ({tail_world.x:.3f}, {tail_world.y:.3f}, {tail_world.z:.3f})")
                    print(f"    length: {bone.length:.4f}")
else:
    print("No backup found")

print("\nDIAGNOSTIC COMPLETE")
