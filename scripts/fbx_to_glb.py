"""
FBX → GLB 批次轉換腳本 (Blender Python)
========================================

功能：
  1. 將每個 zombie 資料夾裡的 FBX 拆成：
     - zombie_X.glb          → Mesh + 骨架 (Draco 壓縮)
     - zombie_X_idle.glb     → 只有動畫 (無幾何體)
     - zombie_X_attack.glb   → 只有動畫
     - zombie_X_hurt.glb     → 只有動畫
     - zombie_X_dying.glb    → 只有動畫
     - zombie_X_run.glb      → 只有動畫
  2. 幾何體只存一份，動畫檔極小 (~幾十 KB)

用法：
  # 轉換所有 zombie（預設讀 public/models 下所有 zombie_* 資料夾）
  blender --background --python scripts/fbx_to_glb.py

  # 只轉換指定 zombie
  blender --background --python scripts/fbx_to_glb.py -- --only zombie_1

  # 指定自訂模型資料夾路徑
  blender --background --python scripts/fbx_to_glb.py -- --models-dir D:/MyProject/public/models

  # 指定輸出資料夾（預設輸出到同資料夾）
  blender --background --python scripts/fbx_to_glb.py -- --output-dir D:/MyProject/public/models_glb

需求：
  - Blender 3.6+ (內建 glTF exporter 含 Draco)
  - FBX 檔案結構：每個 zombie_X/ 下有 idle.fbx, attack.fbx, hurt.fbx, dying.fbx, run.fbx
"""

import bpy
import os
import sys
import glob
import argparse
import time


# ─── 預設值 ─────────────────────────────────────────────
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
DEFAULT_MODELS_DIR = os.path.join(PROJECT_ROOT, "public", "models")
ANIM_NAMES = ["idle", "attack", "hurt", "dying", "run"]


def parse_args():
    """解析 '--' 之後的自訂參數"""
    argv = sys.argv
    if "--" in argv:
        argv = argv[argv.index("--") + 1:]
    else:
        argv = []

    parser = argparse.ArgumentParser(description="FBX → GLB 批次轉換")
    parser.add_argument(
        "--models-dir",
        default=DEFAULT_MODELS_DIR,
        help="模型根目錄 (包含 zombie_* 子資料夾)",
    )
    parser.add_argument(
        "--output-dir",
        default=None,
        help="輸出目錄 (預設: 與來源同目錄)",
    )
    parser.add_argument(
        "--only",
        default=None,
        help="只轉換指定 zombie，例如 zombie_1",
    )
    parser.add_argument(
        "--no-draco",
        action="store_true",
        help="停用 Draco 壓縮",
    )
    parser.add_argument(
        "--mesh-from",
        default="idle",
        help="從哪個 FBX 取 Mesh (預設: idle)",
    )
    parser.add_argument(
        "--clean-fbx",
        action="store_true",
        help="轉換成功後刪除原始 FBX 檔案",
    )
    return parser.parse_args(argv)


def clear_scene():
    """清空場景所有物件、動畫資料"""
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_fbx(filepath):
    """匯入 FBX 檔案"""
    clear_scene()
    bpy.ops.import_scene.fbx(
        filepath=filepath,
        use_anim=True,
        ignore_leaf_bones=False,
        automatic_bone_orientation=True,
        # FBX 匯入會自動套用 cm→m 的 0.01 縮放在 Armature 上，
        # 設 global_scale=100 以抵消，讓 Armature.scale ≈ 1.0
        global_scale=100.0,
    )
    return list(bpy.context.scene.objects)


def get_armature(objects):
    """找到場景中的 Armature"""
    for obj in objects:
        if obj.type == "ARMATURE":
            return obj
    return None


def get_mesh_objects(objects):
    """找到所有 Mesh 物件"""
    return [obj for obj in objects if obj.type == "MESH"]


def remove_all_animations():
    """移除所有動畫資料"""
    # 清除所有 Actions
    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)

    # 清除物件上的 animation_data
    for obj in bpy.context.scene.objects:
        if obj.animation_data:
            obj.animation_data_clear()


def remove_all_meshes():
    """移除所有 Mesh 物件 (保留 Armature)"""
    mesh_objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    for obj in mesh_objects:
        mesh_data = obj.data
        bpy.data.objects.remove(obj, do_unlink=True)
        if mesh_data and mesh_data.users == 0:
            bpy.data.meshes.remove(mesh_data)

    # 清除孤立材質
    for mat in list(bpy.data.materials):
        if mat.users == 0:
            bpy.data.materials.remove(mat)

    # 清除孤立貼圖
    for img in list(bpy.data.images):
        if img.users == 0:
            bpy.data.images.remove(img)


# ─── 面數 / 貼圖最佳化 ──────────────────────────────────

# 超過此面數的 mesh 會被 Decimate（所有 zombie 中最大約 12K，設略高門檻）
MAX_TOTAL_FACES = 15_000
# 貼圖解析度上限 — 超過的長邊自動縮小
MAX_TEXTURE_SIZE = 2048


def decimate_meshes(ratio_or_target="auto"):
    """
    對場景中所有 Mesh 套用 Decimate Modifier。

    - ratio_or_target="auto": 若場景總面數 > MAX_TOTAL_FACES，
      自動計算 ratio 使結果 ≤ MAX_TOTAL_FACES
    - ratio_or_target=float (0~1): 直接指定 ratio
    """
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    if not meshes:
        return

    total_faces = sum(len(o.data.polygons) for o in meshes)
    if total_faces == 0:
        return

    if ratio_or_target == "auto":
        if total_faces <= MAX_TOTAL_FACES:
            print(f"         faces={total_faces:,} ≤ {MAX_TOTAL_FACES:,}，不需 Decimate")
            return
        # 為 SkinnedMesh 骨骼權重限制預留裕度：實際 ratio 乘 0.8
        ratio = (MAX_TOTAL_FACES / total_faces) * 0.8
        ratio = max(ratio, 0.1)  # 最少保留 10%
    else:
        ratio = float(ratio_or_target)

    print(f"         faces={total_faces:,} → target≈{int(total_faces*ratio):,} (ratio={ratio:.3f})")

    # 需先取消所有選取，再逐一處理
    bpy.ops.object.select_all(action='DESELECT')
    for obj in meshes:
        bpy.context.view_layer.objects.active = obj
        mod = obj.modifiers.new(name="Decimate", type='DECIMATE')
        mod.decimate_type = 'COLLAPSE'
        mod.ratio = ratio
        # SkinnedMesh 需要保留頂點群組 — Decimate 預設就會保留
        bpy.ops.object.modifier_apply(modifier=mod.name)

    new_total = sum(len(o.data.polygons) for o in meshes)
    print(f"         Decimated: {total_faces:,} → {new_total:,} faces ({(1-new_total/total_faces)*100:.0f}% reduction)")


def resize_textures(max_size=MAX_TEXTURE_SIZE):
    """
    將場景中所有超過 max_size 的貼圖等比縮小。
    GLB exporter 會把 Blender 內部的 Image 尺寸寫入檔案。
    """
    for img in bpy.data.images:
        w, h = img.size[0], img.size[1]
        if w <= max_size and h <= max_size:
            continue
        factor = max_size / max(w, h)
        new_w = int(w * factor)
        new_h = int(h * factor)
        print(f"         resize: {img.name} {w}×{h} → {new_w}×{new_h}")
        img.scale(new_w, new_h)


def export_glb(filepath, use_draco=True):
    """匯出 GLB (含或不含 Draco 壓縮)"""
    export_settings = {
        "filepath": filepath,
        "export_format": "GLB",
        "use_selection": False,
        "export_apply": False,           # 不要 apply modifiers
        "export_animations": True,
        "export_skins": True,
        "export_morph": True,
        "export_lights": False,
        "export_cameras": False,
        # 貼圖使用 JPEG — 體積大幅縮小（有損但遊戲距離看不出差異）
        "export_image_format": "JPEG",
        "export_jpeg_quality": 85,
    }

    # Draco 壓縮 (Blender 3.6+ 寫法)
    if use_draco:
        export_settings["export_draco_mesh_compression_enable"] = True
        export_settings["export_draco_mesh_compression_level"] = 6
        export_settings["export_draco_position_quantization"] = 14
        export_settings["export_draco_normal_quantization"] = 10
        export_settings["export_draco_texcoord_quantization"] = 12
        export_settings["export_draco_color_quantization"] = 10
        export_settings["export_draco_generic_quantization"] = 12

    bpy.ops.export_scene.gltf(**export_settings)


def export_mesh_glb(fbx_path, output_path, use_draco=True):
    """
    匯入 FBX (global_scale=100) → 降面數/縮貼圖 → 移除動畫 → 匯出含 Mesh + Skeleton 的 GLB
    """
    print(f"  [MESH] {os.path.basename(fbx_path)} → {os.path.basename(output_path)}")
    objects = import_fbx(fbx_path)
    decimate_meshes()       # 超過 MAX_TOTAL_FACES 才會作用
    resize_textures()       # 超過 MAX_TEXTURE_SIZE 才會作用
    remove_all_animations()
    export_glb(output_path, use_draco=use_draco)

    # 回報大小
    size_mb = os.path.getsize(output_path) / (1024 * 1024)
    print(f"         ✓ {size_mb:.2f} MB")
    return size_mb


def export_anim_glb(fbx_path, output_path):
    """
    匯入 FBX (global_scale=100) → 移除 Mesh → 只保留 Armature + AnimationClip → 匯出 GLB
    (動畫檔不需要 Draco，因為沒有幾何體)
    """
    anim_name = os.path.splitext(os.path.basename(output_path))[0].split("_")[-1]
    print(f"  [ANIM] {os.path.basename(fbx_path)} → {os.path.basename(output_path)}")
    objects = import_fbx(fbx_path)
    remove_all_meshes()
    export_glb(output_path, use_draco=False)

    size_kb = os.path.getsize(output_path) / 1024
    print(f"         ✓ {size_kb:.1f} KB")
    return size_kb


def process_zombie(zombie_dir, output_dir, args):
    """處理單一 zombie 資料夾"""
    zombie_name = os.path.basename(zombie_dir)
    print(f"\n{'='*50}")
    print(f"Processing: {zombie_name}")
    print(f"{'='*50}")

    # 確認所有 FBX 存在
    fbx_files = {}
    for anim in ANIM_NAMES:
        fbx_path = os.path.join(zombie_dir, f"{anim}.fbx")
        if os.path.isfile(fbx_path):
            fbx_files[anim] = fbx_path
        else:
            print(f"  ⚠ 找不到 {anim}.fbx，跳過此動畫")

    if not fbx_files:
        print(f"  ✗ 沒有找到任何 FBX 檔案，跳過 {zombie_name}")
        return

    # 確保輸出目錄存在
    os.makedirs(output_dir, exist_ok=True)

    total_saved = 0
    original_total = 0

    # 1) 匯出 Mesh GLB (從指定的 FBX 取 mesh)
    mesh_source = args.mesh_from
    if mesh_source not in fbx_files:
        # fallback: 用第一個找到的 FBX
        mesh_source = list(fbx_files.keys())[0]
        print(f"  ⚠ {args.mesh_from}.fbx 不存在，改用 {mesh_source}.fbx 取 Mesh")

    mesh_fbx = fbx_files[mesh_source]
    mesh_glb = os.path.join(output_dir, f"{zombie_name}.glb")
    original_size = os.path.getsize(mesh_fbx) / (1024 * 1024)
    mesh_size = export_mesh_glb(mesh_fbx, mesh_glb, use_draco=not args.no_draco)

    # 2) 匯出每個動畫 GLB
    anim_total_kb = 0
    for anim_name, fbx_path in fbx_files.items():
        anim_glb = os.path.join(output_dir, f"{zombie_name}_{anim_name}.glb")
        anim_kb = export_anim_glb(fbx_path, anim_glb)
        anim_total_kb += anim_kb
        original_total += os.path.getsize(fbx_path)

    # 統計
    new_total = mesh_size + anim_total_kb / 1024
    original_total_mb = original_total / (1024 * 1024)
    print(f"\n  📊 {zombie_name} 統計:")
    print(f"     原始: {original_total_mb:.1f} MB ({len(fbx_files)} 個 FBX)")
    print(f"     轉換: {new_total:.2f} MB (1 mesh + {len(fbx_files)} anim GLBs)")
    print(f"     節省: {original_total_mb - new_total:.1f} MB ({(1 - new_total/original_total_mb)*100:.1f}%)")

    # 3) 清除原始 FBX
    if args.clean_fbx:
        freed_mb = 0
        for anim_name, fbx_path in fbx_files.items():
            size = os.path.getsize(fbx_path)
            os.remove(fbx_path)
            freed_mb += size / (1024 * 1024)
        print(f"  🗑️  已刪除 {len(fbx_files)} 個 FBX，釋放 {freed_mb:.1f} MB")

    return original_total_mb, new_total


def main():
    args = parse_args()
    models_dir = args.models_dir

    print("╔══════════════════════════════════════════╗")
    print("║   FBX → GLB 批次轉換 (Draco 壓縮)       ║")
    print("╚══════════════════════════════════════════╝")
    print(f"模型目錄: {models_dir}")

    # 找到所有 zombie 資料夾
    if args.only:
        zombie_dirs = [os.path.join(models_dir, args.only)]
        if not os.path.isdir(zombie_dirs[0]):
            print(f"✗ 找不到資料夾: {zombie_dirs[0]}")
            sys.exit(1)
    else:
        zombie_dirs = sorted(glob.glob(os.path.join(models_dir, "zombie_*")))
        zombie_dirs = [d for d in zombie_dirs if os.path.isdir(d)]

    if not zombie_dirs:
        print("✗ 找不到任何 zombie_* 資料夾")
        sys.exit(1)

    print(f"找到 {len(zombie_dirs)} 個 zombie 資料夾")

    start_time = time.time()
    grand_original = 0
    grand_new = 0

    for zombie_dir in zombie_dirs:
        output_dir = args.output_dir or zombie_dir
        result = process_zombie(zombie_dir, output_dir, args)
        if result:
            grand_original += result[0]
            grand_new += result[1]

    elapsed = time.time() - start_time

    print(f"\n{'='*50}")
    print(f"🏁 全部完成！耗時 {elapsed:.1f} 秒")
    print(f"   總原始: {grand_original:.1f} MB")
    print(f"   總轉換: {grand_new:.1f} MB")
    if grand_original > 0:
        print(f"   總節省: {grand_original - grand_new:.1f} MB ({(1 - grand_new/grand_original)*100:.1f}%)")
    print(f"{'='*50}")

    print("\n📁 輸出檔案結構:")
    print("   zombie_X/")
    print("   ├── zombie_X.glb           ← Mesh + 骨架 (Draco)")
    print("   ├── zombie_X_idle.glb      ← 動畫 only")
    print("   ├── zombie_X_attack.glb    ← 動畫 only")
    print("   ├── zombie_X_hurt.glb      ← 動畫 only")
    print("   ├── zombie_X_dying.glb     ← 動畫 only")
    print("   └── zombie_X_run.glb       ← 動畫 only")
    print("\n💡 接下來需要修改前端 loader 改用 GLTFLoader 載入 .glb 檔案")


if __name__ == "__main__":
    main()
