"""Diagnostic: Blender 5.0 Action API structure."""
import bpy
import os

# Clear default objects
for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj, do_unlink=True)

path = r"D:\GlobalGanLan\public\models\zombie_22\zombie_22_run.glb"
bpy.ops.import_scene.gltf(filepath=path)

for action in bpy.data.actions:
    print(f"\nAction: {action.name}")
    attrs = [a for a in dir(action) if not a.startswith('_') and not a.startswith('bl_')]
    print(f"  Attributes: {attrs}")
    
    if hasattr(action, 'fcurves'):
        print(f"  fcurves: {len(action.fcurves)}")
    
    if hasattr(action, 'slots'):
        print(f"  slots: {len(action.slots)}")
        for slot in action.slots:
            sattrs = [a for a in dir(slot) if not a.startswith('_') and not a.startswith('bl_')]
            print(f"    slot name={slot.name} attrs={sattrs}")
    
    if hasattr(action, 'layers'):
        print(f"  layers: {len(action.layers)}")
        for layer in action.layers:
            print(f"    layer: {layer.name}, strips: {len(layer.strips)}")
            for strip in layer.strips:
                sattrs = [a for a in dir(strip) if not a.startswith('_') and not a.startswith('bl_')]
                print(f"      strip type={type(strip).__name__} attrs={sattrs}")
                if hasattr(strip, 'channels'):
                    # Try to get channels
                    for slot in action.slots:
                        try:
                            bag = strip.channels(slot)
                            print(f"      channelbag for {slot.name}: {type(bag).__name__}")
                            bag_attrs = [a for a in dir(bag) if not a.startswith('_') and not a.startswith('bl_')]
                            print(f"        bag attrs: {bag_attrs}")
                            if hasattr(bag, 'fcurves'):
                                fcs = bag.fcurves
                                print(f"        fcurves count: {len(fcs)}")
                                if len(fcs) > 0:
                                    fc0 = fcs[0]
                                    print(f"        first fc: data_path={fc0.data_path} index={fc0.array_index}")
                                    # Count unique bone names
                                    bones = set()
                                    for fc in fcs:
                                        if fc.data_path.startswith('pose.bones["'):
                                            bones.add(fc.data_path.split('"')[1])
                                    print(f"        unique bones: {len(bones)}")
                                    
                                    # Check if fcurves.new exists
                                    fcm = [a for a in dir(fcs) if not a.startswith('_')]
                                    print(f"        fcurves methods: {fcm}")
                        except Exception as e:
                            print(f"      channels error: {e}")

print("\n--- DONE ---")
