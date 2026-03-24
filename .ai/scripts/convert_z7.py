"""Convert zombie_7 FBX animations to GLB"""
import bpy, os

MODELS_DIR = r"D:\GlobalGanLan\public\models"
zombie_id = "zombie_7"
zombie_dir = os.path.join(MODELS_DIR, zombie_id)
ANIMS = ["idle", "attack", "hurt", "dying", "run"]

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

def export_glb(path):
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', export_animations=True,
        export_skins=True, export_morph=False, export_lights=False,
        export_cameras=False, export_apply=True,
        export_draco_mesh_compression_enable=False)

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
    export_glb(glb)
    sz = os.path.getsize(glb)
    print(f"OK {zombie_id}_{anim}.glb ({sz // 1024} KB)")

print("DONE - all z7 animations converted")
