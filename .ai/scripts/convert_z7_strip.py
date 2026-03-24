"""
Convert zombie_7 FBX → GLB with position track stripping.
Removes all bone position tracks EXCEPT Hips to prevent
proxy skeleton proportion mismatch (head sinking into chest).
"""
import bpy, os

MODELS_DIR = r"D:\GlobalGanLan\public\models"
zombie_id = "zombie_7"
zombie_dir = os.path.join(MODELS_DIR, zombie_id)
ANIMS = ["idle", "attack", "hurt", "dying", "run"]

# Bones that keep their position tracks (root hip movement)
KEEP_POS_BONES = {"mixamorig:Hips"}


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_fbx(path):
    clear_scene()
    bpy.ops.import_scene.fbx(
        filepath=path, use_anim=True, ignore_leaf_bones=False,
        automatic_bone_orientation=True, global_scale=100.0)


def remove_meshes():
    for obj in [o for o in bpy.context.scene.objects if o.type == "MESH"]:
        md = obj.data
        bpy.data.objects.remove(obj, do_unlink=True)
        if md and md.users == 0:
            bpy.data.meshes.remove(md)
    for m in list(bpy.data.materials):
        if m.users == 0:
            bpy.data.materials.remove(m)
    for im in list(bpy.data.images):
        if im.users == 0:
            bpy.data.images.remove(im)


def normalize_bones(arm):
    for bone in arm.data.bones:
        if bone.name.startswith("mixamorig:"):
            continue
        for p in ["mixamorig_", "mixamorig."]:
            if bone.name.startswith(p):
                bone.name = "mixamorig:" + bone.name[len(p):]
                break


def strip_position_tracks(armature):
    """Remove position (location) tracks from all bones except Hips."""
    removed = 0
    for action in bpy.data.actions:
        # Blender 5.0+ (Baklava) uses layers/strips/channelbags
        if hasattr(action, 'layers') and len(action.layers) > 0:
            for layer in action.layers:
                for strip in layer.strips:
                    for bag in strip.channelbags:
                        to_remove = []
                        for fc in bag.fcurves:
                            if ".location" not in fc.data_path:
                                continue
                            # Extract bone name from data_path like pose.bones["mixamorig:Spine"].location
                            bone_name = ""
                            if 'pose.bones["' in fc.data_path:
                                start = fc.data_path.index('pose.bones["') + len('pose.bones["')
                                end = fc.data_path.index('"]', start)
                                bone_name = fc.data_path[start:end]
                            if bone_name in KEEP_POS_BONES:
                                continue
                            to_remove.append(fc)
                        for fc in to_remove:
                            bag.fcurves.remove(fc)
                            removed += 1
        # Legacy API fallback
        elif hasattr(action, 'fcurves'):
            to_remove = []
            for fc in action.fcurves:
                if ".location" not in fc.data_path:
                    continue
                bone_name = ""
                if 'pose.bones["' in fc.data_path:
                    start = fc.data_path.index('pose.bones["') + len('pose.bones["')
                    end = fc.data_path.index('"]', start)
                    bone_name = fc.data_path[start:end]
                if bone_name in KEEP_POS_BONES:
                    continue
                to_remove.append(fc)
            for fc in to_remove:
                action.fcurves.remove(fc)
                removed += 1
    return removed


def export_glb(path):
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', export_animations=True,
        export_skins=True, export_morph=False, export_lights=False,
        export_cameras=False, export_apply=True,
        export_draco_mesh_compression_enable=False)


print(f"\n{'='*60}")
print(f"Converting {zombie_id} with position track stripping")
print(f"{'='*60}\n")

for anim in ANIMS:
    fbx = os.path.join(zombie_dir, f"{anim}.fbx")
    glb = os.path.join(zombie_dir, f"{zombie_id}_{anim}.glb")
    if not os.path.exists(fbx):
        print(f"SKIP {anim}: no fbx")
        continue

    import_fbx(fbx)
    remove_meshes()

    for obj in bpy.context.scene.objects:
        if obj.type == "ARMATURE":
            normalize_bones(obj)

    # Strip position tracks to prevent proxy proportion mismatch
    stripped = strip_position_tracks(None)
    print(f"  {anim}: stripped {stripped} position tracks")

    export_glb(glb)
    sz = os.path.getsize(glb)
    print(f"  OK {zombie_id}_{anim}.glb ({sz // 1024} KB)")

print("\nDONE - z7 converted with position track stripping")
