# Live2D 虚拟人集成文档

## 概述

Web Jarvis 集成了 Live2D 虚拟角色系统，使用 `pixi-live2d-display` 库在 PixiJS 7.x 上渲染 Live2D Cubism 2/4 模型。虚拟人可以响应手势、语音和各种交互事件。

## 技术栈

| 组件                    | 版本     | 用途                  |
| ----------------------- | -------- | --------------------- |
| pixi.js                 | 7.4.2    | WebGL 渲染引擎        |
| pixi-live2d-display     | 0.4.0    | Live2D 模型加载和渲染 |
| live2d.min.js           | 2.1.00_1 | Cubism 2 SDK (本地)   |
| live2dcubismcore.min.js | 5.1.0    | Cubism 4 SDK (本地)   |

## 架构

```
src/
├── components/
│   └── Live2DAvatar.tsx      # React 组件，管理 Live2D 渲染
├── modules/
│   └── live2d/
│       ├── index.ts          # 模块导出
│       ├── Live2DController.ts   # 核心控制器（单例）
│       ├── GestureMapper.ts      # 手势映射到动作
│       └── LipSyncController.ts  # 口型同步控制
└── stores/
    └── useJarvisStore.ts     # Zustand 状态管理
```

## 核心模块

### 1. Live2DController

单例模式的核心控制器，负责：

- PixiJS Application 初始化
- Live2D 模型加载和配置
- 视线追踪（Focus）
- 动作播放
- 口型同步

```typescript
import { getLive2DController } from "../modules/live2d";

// 获取控制器实例
const controller = getLive2DController({
  scale: 0.08,
  position: { x: 0.5, y: 0.9 },
});

// 初始化
await controller.initialize(canvasElement);

// 加载模型
await controller.loadModel("https://example.com/model.model3.json");

// 播放动作
controller.playMotion("Tap", 0, 3);

// 设置表情
controller.setExpression("happy");

// 设置视线焦点
controller.setTargetFocus(0.5, -0.3);

// 设置嘴巴张开度
controller.setMouthOpenness(0.7);
```

### 2. GestureMapper

将 Mediapipe 手势事件映射到 Live2D 动作：

| 手势                  | Live2D 反应     |
| --------------------- | --------------- |
| 点击 (Air Click)      | 点头 + Tap 动作 |
| 拖拽 (Air Drag)       | 身体倾斜        |
| 捏合缩放 (Pinch Zoom) | 惊讶表情        |
| 举左手                | 头部左转        |
| 举右手                | 头部右转        |
| 手部移动              | 视线跟随        |

```typescript
import { getGestureMapper } from "../modules/live2d";

const gestureMapper = getGestureMapper();

// 手部检测
gestureMapper.onHandDetected(true, false); // 左手检测到

// 手势变化
gestureMapper.onGestureChange("pinch");

// 手部位置更新（用于视线跟踪）
gestureMapper.onHandPositionUpdate({ x: 0.5, y: 0.3, z: 0.2 });
```

### 3. LipSyncController

处理语音检测和口型同步：

```typescript
import { getLipSyncController } from "../modules/live2d";

const lipSync = getLipSyncController();

// 开始说话
lipSync.onSpeakingStart();

// 更新嘴巴张开度 (0-1)
lipSync.onMouthOpennessUpdate(0.6);

// 停止说话
lipSync.onSpeakingEnd();
```

## 配置选项

### Live2DConfig

```typescript
interface Live2DConfig {
  modelPath: string; // 模型 JSON 路径
  scale: number; // 缩放比例 (默认: 0.08)
  position: {
    // 位置 (0-1 屏幕坐标)
    x: number; // 水平位置 (默认: 0.5 = 居中)
    y: number; // 垂直位置 (默认: 0.9 = 底部)
  };
  idleMotionGroup: string; // 待机动作组 (默认: "Idle")
  lipSyncEnabled: boolean; // 启用口型同步 (默认: true)
  followMouse: boolean; // 鼠标视线跟踪 (默认: true)
  followHand: boolean; // 手势视线跟踪 (默认: true)
}
```

### 可用模型

```typescript
import { AVAILABLE_MODELS } from "../modules/live2d";

// Cubism 4 模型
AVAILABLE_MODELS.haru; // Haru (默认)
AVAILABLE_MODELS.mao; // Mao

// Cubism 2 模型
AVAILABLE_MODELS.shizuku; // Shizuku
```

## React 组件使用

### Live2DAvatar

```tsx
import { Live2DAvatar } from "../components/Live2DAvatar";

function App() {
  return (
    <Live2DAvatar
      modelKey="haru" // 模型名称或 URL
      scale={0.08} // 缩放
      position={{ x: 0.5, y: 0.9 }} // 位置
      onReady={() => console.log("Live2D ready")}
      onError={(err) => console.error(err)}
    />
  );
}
```

## 层级结构

```
z-index 层级：
├── z-0:   Three.js 粒子系统 (JarvisScene)
├── z-50:  Live2D 虚拟人 (Live2DAvatar)
├── z-100: HUD 界面 (HudOverlay)
└── z-200: 侧边菜单 (SideMenu)
```

## 事件流

```
用户手势/语音
      ↓
Mediapipe 检测
      ↓
useJarvisStore (状态更新)
      ↓
Live2DAvatar (订阅状态变化)
      ↓
GestureMapper / LipSyncController
      ↓
Live2DController (执行动作)
      ↓
PixiJS 渲染
```

## 性能优化

1. **单例模式**：`Live2DController` 使用单例避免重复创建 PixiJS Application
2. **事件禁用**：禁用 PixiJS 交互系统，由 Mediapipe 统一处理
3. **平滑插值**：视线和嘴巴动画使用 lerp 插值，避免突变
4. **动作优先级**：使用优先级系统避免动作冲突

## 常见问题

### Q: 模型加载失败

确保 Live2D SDK 已正确加载：

```html
<!-- index.html -->
<script src="/live2d/live2d.min.js"></script>
<script src="/live2d/live2dcubismcore.min.js"></script>
```

### Q: 角色太大/太小

调整 `scale` 参数：

```typescript
getLive2DController({ scale: 0.06 }); // 更小
getLive2DController({ scale: 0.12 }); // 更大
```

### Q: 角色位置不对

调整 `position` 参数：

```typescript
getLive2DController({
  position: { x: 0.5, y: 0.85 }, // x: 水平居中, y: 偏下
});
```

### Q: HMR 热更新后重影

已通过使用 React 管理的 `<canvas>` 解决，无需额外处理。

## 扩展开发

### 添加新动作映射

在 `GestureMapper.ts` 中添加：

```typescript
// 定义新手势处理
onCustomGesture(data: CustomData): void {
  const controller = getLive2DController();
  controller.playMotion('CustomGroup', 0, 3);
}
```

### 添加新模型

1. 将模型文件放到 `public/live2d/models/` 目录
2. 在 `AVAILABLE_MODELS` 中添加路径
3. 确保模型包含必要的动作组（Idle, Tap 等）

## 版本兼容性

| 浏览器      | 支持状态    |
| ----------- | ----------- |
| Chrome 90+  | ✅ 完全支持 |
| Firefox 88+ | ✅ 完全支持 |
| Safari 14+  | ✅ 完全支持 |
| Edge 90+    | ✅ 完全支持 |

---

_最后更新: 2025-12-05_
