/*
 * @Author: fuwen
 * @LastEditors: fuwens@163.com
 * @Date: 2025-12-05 14:49:25
 * @Description: Live2D Controller using pixi.js 7.x
 */
import * as PIXI from "pixi.js";
import { Live2DModel, MotionPreloadStrategy } from "pixi-live2d-display";

// Ensure window.PIXI is available for internal pixi-live2d-display usage
(window as any).PIXI = PIXI;

// Register Live2D model to PIXI
// @ts-expect-error - Type mismatch between pixi.js versions, but works at runtime
Live2DModel.registerTicker(PIXI.Ticker);

// ========================
// Type Definitions
// ========================

export interface Live2DConfig {
  modelPath: string;
  scale: number;
  position: { x: number; y: number };
  idleMotionGroup: string;
  lipSyncEnabled: boolean;
  followMouse: boolean;
  followHand: boolean;
}

export interface FocusTarget {
  x: number; // -1 to 1 (left to right)
  y: number; // -1 to 1 (bottom to top)
}

// ========================
// Default Configuration
// ========================

const DEFAULT_CONFIG: Live2DConfig = {
  // Haru model (Cubism 4) from pixi-live2d-display test assets
  modelPath:
    "https://cdn.jsdelivr.net/gh/guansss/pixi-live2d-display/test/assets/haru/haru_greeter_t03.model3.json",
  scale: 0.08,
  position: { x: 0.5, y: 0.9 },
  idleMotionGroup: "Idle",
  lipSyncEnabled: true,
  followMouse: true,
  followHand: true,
};

// Alternative models (tested and working)
export const AVAILABLE_MODELS = {
  // Cubism 4 models (.model3.json)
  haru: "https://cdn.jsdelivr.net/gh/guansss/pixi-live2d-display/test/assets/haru/haru_greeter_t03.model3.json",
  // Cubism 2 models (.model.json)
  shizuku:
    "https://cdn.jsdelivr.net/gh/guansss/pixi-live2d-display/test/assets/shizuku/shizuku.model.json",
  // Alternative Cubism 4 model
  mao: "https://cdn.jsdelivr.net/gh/Eikanya/Live2d-model/Live2D/Samples/mao_pro_t02/mao_pro_t02.model3.json",
};

// ========================
// Live2D Controller Class (Singleton)
// ========================

export class Live2DController {
  private static instance: Live2DController | null = null;

  private app: PIXI.Application | null = null;
  private model: Live2DModel | null = null;
  private config: Live2DConfig;

  // State
  private isInitialized = false;
  private isModelLoaded = false;
  private currentFocus: FocusTarget = { x: 0, y: 0 };
  private targetFocus: FocusTarget = { x: 0, y: 0 };
  private mouthOpenness = 0;
  private targetMouthOpenness = 0;

  // Animation
  private animationId: number | null = null;
  private lastTime = 0;

  // ========================
  // Singleton
  // ========================

  private constructor(config: Partial<Live2DConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  static getInstance(config?: Partial<Live2DConfig>): Live2DController {
    if (!Live2DController.instance) {
      Live2DController.instance = new Live2DController(config);
    } else if (config) {
      // Update config if instance already exists
      Live2DController.instance.updateConfig(config);
    }
    return Live2DController.instance;
  }

  static destroyInstance(): void {
    if (Live2DController.instance) {
      Live2DController.instance.dispose();
      Live2DController.instance = null;
    }
  }

  updateConfig(config: Partial<Live2DConfig>): void {
    this.config = { ...this.config, ...config };
    // Re-apply config if model is already loaded
    if (this.isModelLoaded && this.model) {
      this.configureModel();
    }
  }

  // ========================
  // Initialization
  // ========================

  async initialize(view: HTMLCanvasElement): Promise<boolean> {
    if (this.isInitialized && this.app) {
      console.log("[Live2DController] Already initialized");
      return true;
    }

    try {
      console.log("[Live2DController] Initializing Pixi Application...");

      // Ensure canvas doesn't receive pointer events
      view.style.pointerEvents = "none";

      // Create Pixi Application (pixi.js 7.x API)
      // Pass eventMode: 'none' to disable event handling on the application level
      this.app = new PIXI.Application({
        view: view,
        backgroundAlpha: 0, // Transparent background
        resizeTo: view.parentElement as HTMLElement,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
        eventMode: "none", // Disable event handling
      });

      // Disable stage interactivity
      this.app.stage.eventMode = "none";
      this.app.stage.interactiveChildren = false;

      this.isInitialized = true;

      // Start animation loop
      this.startAnimationLoop();

      console.log("[Live2DController] Pixi Application initialized");
      return true;
    } catch (error) {
      console.error("[Live2DController] Initialization failed:", error);
      return false;
    }
  }

  // ========================
  // Model Loading
  // ========================

  async loadModel(modelPath?: string): Promise<boolean> {
    if (!this.app) {
      console.error("[Live2DController] App not initialized");
      return false;
    }

    const path = modelPath || this.config.modelPath;

    try {
      console.log("[Live2DController] Loading model:", path);

      // Remove existing model
      if (this.model) {
        this.app.stage.removeChild(this.model as any);
        this.model.destroy();
        this.model = null;
      }

      // Load new model
      this.model = await Live2DModel.from(path, {
        motionPreload: MotionPreloadStrategy.IDLE,
        autoInteract: false, // Disable built-in interaction to prevent errors
      });

      // Force disable interaction on the model and its children
      // PixiJS 7 uses eventMode instead of interactive
      this.model.eventMode = "none";
      this.model.interactiveChildren = false;
      if (this.model.internalModel) {
        // @ts-expect-error - Internal model properties
        this.model.internalModel.hitAreas = [];
      }

      // Add to stage
      this.app.stage.addChild(this.model as any);

      // Configure model
      this.configureModel();

      this.isModelLoaded = true;
      console.log("[Live2DController] Model loaded successfully");

      // Play idle motion
      this.playIdleMotion();

      return true;
    } catch (error) {
      console.error("[Live2DController] Failed to load model:", error);
      return false;
    }
  }

  private configureModel(): void {
    if (!this.model || !this.app) return;

    const { scale } = this.config;

    // Set scale
    this.model.scale.set(scale);

    // Set position (center of screen)
    this.updateModelPosition();

    // Note: We don't set interactive=true because it causes compatibility issues
    // with pixi.js 7.x event system. Interaction is handled via gesture tracking instead.

    // Setup mouse tracking if enabled
    if (this.config.followMouse) {
      this.setupMouseTracking();
    }
  }

  private updateModelPosition(): void {
    if (!this.model || !this.app) return;

    const { position } = this.config;
    this.model.x = this.app.screen.width * position.x;
    this.model.y = this.app.screen.height * position.y;

    // Anchor point at center-bottom
    this.model.anchor.set(0.5, 0.5);
  }

  private setupMouseTracking(): void {
    if (!this.app) return;

    const canvas = this.app.view as HTMLCanvasElement;
    // Use pointer events for better compatibility
    canvas.addEventListener("pointermove", (e: PointerEvent) => {
      if (!this.config.followMouse || !this.model) return;

      const rect = canvas.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = ((e.clientY - rect.top) / rect.height) * 2 - 1;

      this.setTargetFocus(x, -y);
    });
  }

  // ========================
  // Focus Control (Eye/Head Tracking)
  // ========================

  setTargetFocus(x: number, y: number): void {
    // Clamp values to -1 to 1
    this.targetFocus.x = Math.max(-1, Math.min(1, x));
    this.targetFocus.y = Math.max(-1, Math.min(1, y));
  }

  setFocusFromScreenCoords(screenX: number, screenY: number): void {
    if (!this.app) return;

    const x = (screenX / window.innerWidth) * 2 - 1;
    const y = (screenY / window.innerHeight) * 2 - 1;

    this.setTargetFocus(x, -y);
  }

  private updateFocus(deltaTime: number): void {
    if (!this.model) return;

    // Smooth interpolation (lerp)
    const lerpFactor = 1 - Math.pow(0.1, deltaTime);
    this.currentFocus.x +=
      (this.targetFocus.x - this.currentFocus.x) * lerpFactor;
    this.currentFocus.y +=
      (this.targetFocus.y - this.currentFocus.y) * lerpFactor;

    // Apply to model - focus method handles the parameter mapping
    this.model.focus(this.currentFocus.x, this.currentFocus.y);
  }

  // ========================
  // Motion Control
  // ========================

  playMotion(group: string, index: number = 0, priority: number = 2): void {
    if (!this.model) return;

    try {
      this.model.motion(group, index, priority);
      console.log(`[Live2DController] Playing motion: ${group}[${index}]`);
    } catch (error) {
      console.warn(`[Live2DController] Motion not found: ${group}[${index}]`);
    }
  }

  playIdleMotion(): void {
    this.playMotion(this.config.idleMotionGroup, 0, 1);
  }

  stopAllMotions(): void {
    if (!this.model?.internalModel) return;
    
    // @ts-expect-error - Internal API
    const motionManager = this.model.internalModel.motionManager;
    if (motionManager) {
      // 停止所有正在播放的动画
      motionManager.stopAllMotions?.();
      console.log("[Live2DController] Stopped all motions");
    }
  }

  // 启用/禁用表情跟踪模式（禁用时停止Idle动画干扰）
  setExpressionTrackingMode(enabled: boolean): void {
    if (enabled) {
      this.stopAllMotions();
    } else {
      this.playIdleMotion();
    }
  }

  // Common motion helpers
  tap(): void {
    this.playMotion("Tap", 0, 3);
  }

  flick(): void {
    this.playMotion("Flick", 0, 3);
  }

  shake(): void {
    this.playMotion("Shake", 0, 3);
  }

  // ========================
  // Expression Control
  // ========================

  setExpression(expressionId: string | number): void {
    if (!this.model) return;

    try {
      this.model.expression(expressionId);
      console.log(`[Live2DController] Set expression: ${expressionId}`);
    } catch (error) {
      console.warn(`[Live2DController] Expression not found: ${expressionId}`);
    }
  }

  // ========================
  // Lip Sync (Mouth Control)
  // ========================

  setMouthOpenness(value: number): void {
    // Clamp between 0 and 1
    this.targetMouthOpenness = Math.max(0, Math.min(1, value));
  }

  private updateMouth(deltaTime: number): void {
    if (!this.model || !this.config.lipSyncEnabled) return;

    // Smooth interpolation
    const lerpFactor = 1 - Math.pow(0.05, deltaTime);
    this.mouthOpenness +=
      (this.targetMouthOpenness - this.mouthOpenness) * lerpFactor;

    // Apply to model parameters
    const coreModel = this.model.internalModel?.coreModel as
      | {
          getParameterIndex: (name: string) => number;
          setParameterValueByIndex: (index: number, value: number) => void;
        }
      | undefined;

    if (coreModel) {
      // Try different parameter names for mouth
      const mouthParams = [
        "ParamMouthOpenY",
        "PARAM_MOUTH_OPEN_Y",
        "ParamMouthOpen",
      ];
      for (const param of mouthParams) {
        try {
          const paramIndex = coreModel.getParameterIndex(param);
          if (paramIndex >= 0) {
            coreModel.setParameterValueByIndex(paramIndex, this.mouthOpenness);
            break;
          }
        } catch {
          // Parameter not found, try next
        }
      }
    }
  }

  // ========================
  // Body Control (for gestures)
  // ========================

  setBodyAngle(angleX: number, angleY: number, angleZ: number = 0): void {
    if (!this.model) return;

    const coreModel = this.model.internalModel?.coreModel as
      | {
          getParameterIndex: (name: string) => number;
          setParameterValueByIndex: (index: number, value: number) => void;
        }
      | undefined;

    if (!coreModel) return;

    const bodyParams = [
      { name: "ParamBodyAngleX", value: angleX },
      { name: "ParamBodyAngleY", value: angleY },
      { name: "ParamBodyAngleZ", value: angleZ },
    ];

    bodyParams.forEach(({ name, value }) => {
      try {
        const paramIndex = coreModel.getParameterIndex(name);
        if (paramIndex >= 0) {
          coreModel.setParameterValueByIndex(paramIndex, value);
        }
      } catch {
        // Parameter not found
      }
    });
  }

  // ========================
  // Animation Loop
  // ========================

  private startAnimationLoop(): void {
    const animate = (currentTime: number) => {
      const deltaTime = (currentTime - this.lastTime) / 1000;
      this.lastTime = currentTime;

      if (deltaTime > 0 && deltaTime < 1) {
        this.updateFocus(deltaTime);
        this.updateMouth(deltaTime);
      }

      this.animationId = requestAnimationFrame(animate);
    };

    this.lastTime = performance.now();
    this.animationId = requestAnimationFrame(animate);
  }

  private stopAnimationLoop(): void {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  // ========================
  // Resize Handler
  // ========================

  resize(): void {
    if (!this.app || !this.app.view) return;

    const view = this.app.view as HTMLCanvasElement;
    const parent = view.parentElement;
    if (!parent) return;

    this.app.renderer.resize(parent.clientWidth, parent.clientHeight);

    this.updateModelPosition();
  }

  // ========================
  // Getters
  // ========================

  getModel(): Live2DModel | null {
    return this.model;
  }

  isReady(): boolean {
    return this.isInitialized && this.isModelLoaded;
  }

  getApp(): PIXI.Application | null {
    return this.app;
  }

  // ========================
  // Cleanup
  // ========================

  dispose(): void {
    this.stopAnimationLoop();

    if (this.model) {
      this.model.destroy();
      this.model = null;
    }

    if (this.app) {
      // Don't remove canvas manually, React handles it
      this.app.destroy(true, { children: true, texture: true });
      this.app = null;
    }

    this.isInitialized = false;
    this.isModelLoaded = false;
    console.log("[Live2DController] Disposed");
  }
}

// ========================
// Export singleton accessor
// ========================

export function getLive2DController(
  config?: Partial<Live2DConfig>
): Live2DController {
  return Live2DController.getInstance(config);
}
