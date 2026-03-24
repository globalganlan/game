"""Diagnostic v2: Blender 5.0 Action API structure."""
import bpy
import os

for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj, do_unlink=True)

path = r"D:\GlobalGanLan\public\models\zombie_22\zombie_22_run.glb"
bpy.ops.import_scene.gltf(filepath=path)

for action in bpy.data.actions:
    print(f"\nAction: {action.name}")
    print(f"  is_action_layered: {action.is_action_layered}")
    print(f"  is_action_legacy: {action.is_action_legacy}")
    
    # Slots
    print(f"  slots ({len(action.slots)}):")
    for i, slot in enumerate(action.slots):
        sattrs = [a for a in dir(slot) if not a.startswith('_') and not a.startswith('bl_')]
        print(f"    slot[{i}] attrs: {sattrs}")
        for attr in ['name', 'identifier', 'handle', 'id_type', 'name_display']:
            if hasattr(slot, attr):
                print(f"      {attr} = {getattr(slot, attr)}")
    
    # Layers
    print(f"  layers ({len(action.layers)}):")
    for i, layer in enumerate(action.layers):
        lattrs = [a for a in dir(layer) if not a.startswith('_') and not a.startswith('bl_')]
        print(f"    layer[{i}] attrs: {lattrs}")
        print(f"    strips ({len(layer.strips)}):")
        for j, strip in enumerate(layer.strips):
            sattrs = [a for a in dir(strip) if not a.startswith('_') and not a.startswith('bl_')]
            print(f"      strip[{j}] type={type(strip).__name__} attrs={sattrs}")
            
            # Try channelbags
            if hasattr(strip, 'channelbags'):
                print(f"      channelbags: {len(strip.channelbags)}")
                for k, bag in enumerate(strip.channelbags):
                    battrs = [a for a in dir(bag) if not a.startswith('_') and not a.startswith('bl_')]
                    print(f"        bag[{k}] attrs: {battrs}")
                    if hasattr(bag, 'fcurves'):
                        fcs = bag.fcurves
                        print(f"        fcurves: {len(fcs)}")
                        if len(fcs) > 0:
                            print(f"        first: dp={fcs[0].data_path} idx={fcs[0].array_index}")
                            bones = set()
                            for fc in fcs:
                                if fc.data_path.startswith('pose.bones["'):
                                    bones.add(fc.data_path.split('"')[1])
                            print(f"        unique bones: {len(bones)}")
                        # Check new method
                        fcm = [a for a in dir(fcs) if not a.startswith('_')]
                        print(f"        fcurves API: {fcm}")

print("\n--- DONE ---")
