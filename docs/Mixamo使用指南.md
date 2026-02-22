# Mixamo 使用指南

## 简介
Mixamo 是 Adobe 提供的免费在线3D角色自动绑骨和动画平台，适合为 TripoSR 生成的模型添加专业骨骼和动画。

**官网**: https://www.mixamo.com/

## 优势
✅ **100%成功率** - Adobe专业算法，不会像Blender那样权重绑定失败  
✅ **免费** - 注册Adobe账号即可使用  
✅ **海量动画库** - 2000+专业动画（走跑跳攻击死亡等）  
✅ **自动权重绘制** - 无需手动调整  
✅ **多格式导出** - FBX/OBJ，可选带动画或仅骨骼  

## 完整流程

### 步骤1: 准备OBJ模型

确保你的模型满足要求：
- **T-pose 或 A-pose** - TripoSR生成的模型通常符合
- **单个mesh** - 不能有多个分离的部分
- **合理的比例** - 人形角色（僵尸✅，动物❌）

```bash
# 已有的模型位置
D:\GlobalGanLan\public\models\zombie_1\mesh.obj
D:\GlobalGanLan\public\models\zombie_2\mesh.obj
D:\GlobalGanLan\public\models\zombie_3\mesh.obj
```

---

### 步骤2: 注册/登录 Mixamo

1. 访问 https://www.mixamo.com/
2. 点击右上角 **Sign In**
3. 使用 Adobe 账号登录（免费注册）

---

### 步骤3: 上传模型

1. 点击界面右上角 **Upload Character**
2. 选择模型文件：`D:\GlobalGanLan\public\models\zombie_1\mesh.obj`
3. 等待上传（几秒钟）

---

### 步骤4: 自动标定关节点

上传后会进入 **Auto-Rigger** 界面：

#### 4.1 标记关键点
Mixamo会自动识别，你只需确认/调整：
- **Chin** (下巴) - 自动标记，通常准确
- **Wrists** (手腕) - 左右各一个
- **Elbows** (肘部) - 左右各一个
- **Knees** (膝盖) - 左右各一个
- **Groin** (胯部) - 骨盆中心

**提示**: 
- 绿色圆圈 = 自动识别
- 如果位置不对，直接拖动到正确位置
- 僵尸模型通常自动识别很准确

#### 4.2 设置参数
- **Skeleton Type**: Standard (标准骨骼)
- **Poly Count**: Auto (自动优化)

#### 4.3 开始绑定
点击 **Next** → 等待30-60秒 → 绑定完成✅

---

### 步骤5: 选择动画（可选）

绑定完成后进入动画库：

#### 5.1 浏览动画
左侧列表显示2000+动画，分类：
- **Idle** - 待机
- **Walking** - 行走
- **Running** - 跑步
- **Zombie** - 僵尸特效 ⭐⭐⭐
- **Fighting** - 战斗/攻击
- **Dying** - 死亡
- **Damaged** - 受伤

**推荐僵尸动画**:
- `Zombie Idle` - 僵尸待机摇晃
- `Zombie Walk` - 僵尸行走
- `Zombie Attack` - 僵尸攻击
- `Zombie Death` - 僵尸死亡
- `Zombie Crawl` - 僵尸爬行

#### 5.2 调整动画参数
点击动画后右侧有滑杆：
- **Speed** - 速度 (建议僵尸设为0.8-1.2)
- **Trim** - 裁剪起止时间
- **Overdrive** - 动作幅度 (设为1.0)
- **Arm Space** - 手臂空间
- **Character Arm Space** - 角色手臂位置

---

### 步骤6: 下载模型

#### 6.1 下载设置
点击右上角 **Download**，设置参数：

**推荐配置**:
```
Format: FBX for Unity (.fbx)         ← 或 GLB (推荐Three.js)
Pose: T-Pose                         ← 如果只要骨骼，无动画
Frames per second: 30 fps
Skin: With Skin                      ← 包含网格
```

**如果要带动画**:
```
Format: FBX Binary (.fbx)
Pose: Current Animation              ← 导出选中的动画
Frames per second: 30 fps
Skin: With Skin
```

#### 6.2 批量下载多个动画
1. 选择第一个动画 (如 `Zombie Idle`) → Download → 修改文件名 `zombie_idle.fbx`
2. 选择第二个动画 (如 `Zombie Attack`) → Download → 修改文件名 `zombie_attack.fbx`
3. 重复...

---

### 步骤7: 转换FBX到GLB (推荐)

**方法A: 使用Blender转换**

```python
# D:\GlobalGanLan\TripoSR\convert_fbx_to_glb.py
import bpy
import sys
import os

def convert_fbx_to_glb(fbx_path, output_dir):
    """转换FBX到GLB格式"""
    # 清空场景
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()
    
    # 导入FBX
    bpy.ops.import_scene.fbx(filepath=fbx_path)
    
    # 导出GLB
    filename = os.path.splitext(os.path.basename(fbx_path))[0]
    glb_path = os.path.join(output_dir, f"{filename}.glb")
    
    bpy.ops.export_scene.gltf(
        filepath=glb_path,
        export_format='GLB',
        export_animations=True,
        export_skins=True,
        export_morph=False
    )
    
    print(f"✅ Converted: {glb_path}")
    return glb_path

if __name__ == "__main__":
    fbx_file = sys.argv[-2]      # zombie_idle.fbx
    output_dir = sys.argv[-1]    # D:\GlobalGanLan\public\models\zombie_1
    
    convert_fbx_to_glb(fbx_file, output_dir)
```

**运行转换**:
```powershell
D:\Blender\blender-5.0.1-windows-x64\blender.exe --background --python D:\GlobalGanLan\TripoSR\convert_fbx_to_glb.py -- D:\Downloads\zombie_idle.fbx D:\GlobalGanLan\public\models\zombie_1
```

**方法B: 在线转换**
访问 https://anyconv.com/fbx-to-glb-converter/

---

### 步骤8: Three.js加载Mixamo模型

> ⚠️ **重要更新**: 以下展示的是正确的载入方式。关于 SkeletonUtils.clone、crossFadeTo 等细节，
> 请参见 `docs/Three.js場景與模型整合筆記.md`。

```javascript
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader'
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils'
import { useAnimations } from '@react-three/drei'

function MixamoZombie({ isPlayer, state }) {
  const idle = useLoader(FBXLoader, `models/zombie_1/zombie_1_idle.fbx`)
  const attack = useLoader(FBXLoader, `models/zombie_1/zombie_1_attack.fbx`)
  // ... 其他动画

  const scene = useMemo(() => SkeletonUtils.clone(idle), [idle])
  // ⚠️ 不要用 idle.clone()，SkinnedMesh 会共享 Skeleton

  const animations = useMemo(() => {
    const clips = []
    idle.animations.forEach(a => { const c = a.clone(); c.name = 'IDLE'; clips.push(c) })
    attack.animations.forEach(a => { const c = a.clone(); c.name = 'ATTACKING'; clips.push(c) })
    return clips
  }, [idle, attack])

  const { actions } = useAnimations(animations, scene)
  const prevActionRef = useRef(null)

  useEffect(() => {
    const newAction = actions[state]
    if (!newAction) return

    if (state === 'DEAD') {
      newAction.setLoop(THREE.LoopOnce, 1)
      newAction.clampWhenFinished = true
    }

    // ⚠️ 用 crossFadeTo 而非 stop() → play()，避免 bind-pose 闪现
    if (prevActionRef.current && prevActionRef.current !== newAction) {
      newAction.reset()
      prevActionRef.current.crossFadeTo(newAction, 0.2, true)
      newAction.play()
    } else {
      newAction.reset().fadeIn(0.2).play()
    }
    prevActionRef.current = newAction
  }, [state, actions])

  return <primitive object={scene} />
}
```

---

## 常见问题

### Q1: 上传失败 "Invalid model"
**原因**: 
- 模型有多个分离mesh
- 文件太大 (>5MB)
- 格式不支持

**解决**:
1. 在Blender中合并所有mesh: `Ctrl+J`
2. 减少顶点数: Decimate修改器
3. 确保是OBJ或FBX格式

### Q2: 关节点位置不对
**原因**: 模型姿态不是T-pose或比例异常

**解决**:
- 手动拖动关节点到正确位置
- 在Blender中调整模型姿态后重新上传

### Q3: 下载的FBX在Three.js加载失败
**原因**: FBX格式在Web3D支持不好

**解决**:
- 使用Blender转换为GLB格式 (推荐)
- 或使用 FBXLoader (npm install three-fbx-loader)

### Q4: 动画播放不流畅
**原因**: FPS设置过低或文件过大

**解决**:
- 下载时选择30fps或60fps
- 使用GLB压缩格式
- 减少模型顶点数

### Q5: 能否离线使用？
**答**: 不行，Mixamo是纯在线服务，但可以：
1. 批量下载所有需要的动画
2. 保存到本地项目中
3. 后续无需重新访问Mixamo

---

## 对比：Mixamo vs Blender Rigify

| 特性 | Mixamo | Blender Rigify |
|------|--------|----------------|
| **成功率** | 99% ✅ | 对AI模型40% ❌ |
| **操作难度** | 简单（点点点）| 复杂（需要学习）|
| **动画库** | 2000+ ✅ | 需要自己做 ❌ |
| **费用** | 免费 ✅ | 免费 ✅ |
| **离线使用** | ❌ | ✅ |
| **自定义骨骼** | ❌ 固定结构 | ✅ 完全自定义 |
| **适合场景** | 项目快速开发 | 专业定制需求 |

**推荐**:
- ✅ 使用Mixamo: 快速原型、游戏demo、标准人形角色
- ⚠️ 使用Blender: 非人形角色、特殊骨骼需求、离线工作

---

## 快速开始（5分钟）

### 完整操作清单

```bash
# 1. 访问Mixamo
https://www.mixamo.com/

# 2. 上传zombie_1\mesh.obj
→ Upload Character → 选择文件

# 3. 确认关节点 → Next

# 4. 选择动画: "Zombie Idle"
→ 调整Speed=1.0

# 5. Download
Format: FBX Binary
Pose: Current Animation
FPS: 30
Skin: With Skin

# 6. 重命名下载文件
zombie_idle.fbx → D:\GlobalGanLan\public\models\zombie_1\

# 7. 转换GLB (可选)
blender --background --python convert_fbx_to_glb.py -- zombie_idle.fbx ./

# 8. 在Three.js中使用
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
const gltf = useLoader(GLTFLoader, 'models/zombie_1/zombie_idle.glb')
```

---

## 推荐动画组合（僵尸）

### 基础4个动画
1. **Zombie Idle** - 待机摇摆
2. **Zombie Walk** - 缓慢行走
3. **Zombie Attack** - 挥爪攻击
4. **Zombie Death** - 倒地死亡

### 完整8个动画
5. **Zombie Run** - 快速追击
6. **Zombie Crawl** - 爬行
7. **Zombie Reaction Hit** - 受击后退
8. **Zombie Eating** - 啃食动作

### 下载文件命名规范
```
zombie_1_idle.glb
zombie_1_walk.glb
zombie_1_attack.glb
zombie_1_death.glb
zombie_1_run.glb
zombie_1_crawl.glb
zombie_1_hurt.glb
zombie_1_eating.glb
```

---

**总结**: Mixamo是目前**最推荐的方案**，可以完全替代Blender Rigify绑定失败的问题，而且提供海量专业动画，5分钟即可完成绑定和下载。

**下一步**: 
1. 访问 https://www.mixamo.com/ 注册账号
2. 上传你的 `zombie_1\mesh.obj`
3. 下载 `Zombie Attack` 动画
4. 使用上面的Three.js代码加载
