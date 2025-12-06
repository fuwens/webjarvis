import { getLive2DController } from "./Live2DController";
import type { FaceExpressionData } from "../mediapipe/faceTracker";

// ========================
// Type Definitions
// ========================

export interface ExpressionMapperConfig {
  enabled: boolean;
  eyeTrackingEnabled: boolean;
  browTrackingEnabled: boolean;
  headTrackingEnabled: boolean;
  mouthTrackingEnabled: boolean;
  gazeTrackingEnabled: boolean;

  // 灵敏度设置
  eyeSensitivity: number; // 1.0 = normal
  browSensitivity: number;
  headSensitivity: number;
  mouthSensitivity: number;

  // 平滑设置
  smoothingFactor: number; // 0-1, higher = more smoothing

  // 调试
  debug: boolean;
}

// ========================
// Live2D Parameter Names
// ========================

// 不同模型可能使用不同的参数名，这里列出常见的
const PARAM_NAMES = {
  // 眼睛开合
  eyeLOpen: ["ParamEyeLOpen", "PARAM_EYE_L_OPEN", "EyeLOpen"],
  eyeROpen: ["ParamEyeROpen", "PARAM_EYE_R_OPEN", "EyeROpen"],

  // 眉毛
  browLY: ["ParamBrowLY", "PARAM_BROW_L_Y", "BrowLY"],
  browRY: ["ParamBrowRY", "PARAM_BROW_R_Y", "BrowRY"],

  // 头部角度
  angleX: ["ParamAngleX", "PARAM_ANGLE_X", "AngleX"],
  angleY: ["ParamAngleY", "PARAM_ANGLE_Y", "AngleY"],
  angleZ: ["ParamAngleZ", "PARAM_ANGLE_Z", "AngleZ"],

  // 身体角度
  bodyAngleX: ["ParamBodyAngleX", "PARAM_BODY_ANGLE_X", "BodyAngleX"],
  bodyAngleY: ["ParamBodyAngleY", "PARAM_BODY_ANGLE_Y", "BodyAngleY"],
  bodyAngleZ: ["ParamBodyAngleZ", "PARAM_BODY_ANGLE_Z", "BodyAngleZ"],

  // 嘴巴
  mouthOpenY: ["ParamMouthOpenY", "PARAM_MOUTH_OPEN_Y", "MouthOpenY"],
  mouthForm: ["ParamMouthForm", "PARAM_MOUTH_FORM", "MouthForm"],

  // 眼球
  eyeBallX: ["ParamEyeBallX", "PARAM_EYE_BALL_X", "EyeBallX"],
  eyeBallY: ["ParamEyeBallY", "PARAM_EYE_BALL_Y", "EyeBallY"],
};

// ========================
// Default Configuration
// ========================

const DEFAULT_CONFIG: ExpressionMapperConfig = {
  enabled: true,
  eyeTrackingEnabled: true,
  browTrackingEnabled: true,
  headTrackingEnabled: true,
  mouthTrackingEnabled: true,
  gazeTrackingEnabled: true,

  eyeSensitivity: 1.0,
  browSensitivity: 1.0,
  headSensitivity: 1.0,
  mouthSensitivity: 2.0,

  smoothingFactor: 0.3,
  debug: false,
};

// ========================
// Expression Mapper Class
// ========================

export class ExpressionMapper {
  private static instance: ExpressionMapper | null = null;

  private config: ExpressionMapperConfig;
  private lastExpression: FaceExpressionData | null = null;
  private parameterCache: Map<string, number> = new Map();
  private frameCount = 0;
  private isTrackingActive = false;

  // ========================
  // Singleton
  // ========================

  private constructor(config: Partial<ExpressionMapperConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  static getInstance(
    config?: Partial<ExpressionMapperConfig>
  ): ExpressionMapper {
    if (!ExpressionMapper.instance) {
      ExpressionMapper.instance = new ExpressionMapper(config);
    }
    return ExpressionMapper.instance;
  }

  // ========================
  // Configuration
  // ========================

  updateConfig(config: Partial<ExpressionMapperConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // ========================
  // Main Update Method
  // ========================

  updateFromFaceData(data: FaceExpressionData): void {
    if (!this.config.enabled || !data.faceDetected) {
      // 如果没有检测到面部，恢复 Idle 动画
      if (this.isTrackingActive) {
        const controller = getLive2DController();
        controller.setExpressionTrackingMode(false);
        this.isTrackingActive = false;
        console.log("[ExpressionMapper] Face lost, resuming idle motion");
      }
      return;
    }

    const controller = getLive2DController();
    if (!controller.isReady()) {
      if (this.config.debug && this.frameCount % 60 === 0) {
        console.log("[ExpressionMapper] Controller not ready");
      }
      return;
    }

    // 首次检测到面部时，停止 Idle 动画
    if (!this.isTrackingActive) {
      controller.setExpressionTrackingMode(true);
      this.isTrackingActive = true;
      console.log(
        "[ExpressionMapper] Face detected, stopping idle motion for tracking"
      );
    }

    const model = controller.getModel();
    if (!model) {
      if (this.config.debug && this.frameCount % 60 === 0) {
        console.log("[ExpressionMapper] No model");
      }
      return;
    }

    // 获取 internalModel
    const internalModel = model.internalModel;
    if (!internalModel) {
      if (this.config.debug && this.frameCount % 60 === 0) {
        console.log("[ExpressionMapper] No internalModel");
      }
      return;
    }

    // 调试：每隔一段时间列出模型结构
    if (this.config.debug && this.frameCount === 0) {
      console.log("[ExpressionMapper] Model structure:", {
        hasCoreModel: !!internalModel.coreModel,
        hasModel: !!(internalModel as any).model,
        coreModelType: internalModel.coreModel?.constructor?.name,
        internalModelKeys: Object.keys(internalModel).slice(0, 20),
      });

      // 尝试列出参数
      const coreModel = internalModel.coreModel as any;
      if (coreModel) {
        console.log("[ExpressionMapper] CoreModel structure:", {
          hasGetParameterIndex:
            typeof coreModel.getParameterIndex === "function",
          hasSetParameterValueByIndex:
            typeof coreModel.setParameterValueByIndex === "function",
          has_model: !!coreModel._model,
          coreModelKeys: Object.keys(coreModel).slice(0, 20),
        });

        // 列出所有参数
        if (coreModel._model) {
          const _model = coreModel._model;
          const paramCount = _model.getParameterCount?.() ?? 0;
          const params: string[] = [];
          for (let i = 0; i < paramCount && i < 30; i++) {
            const id = _model.getParameterId?.(i);
            if (id) params.push(id);
          }
          console.log("[ExpressionMapper] Available parameters:", params);
        }
      }
    }

    this.frameCount++;

    // 应用各种跟踪 - 直接使用 internalModel
    if (this.config.eyeTrackingEnabled) {
      this.applyEyeTracking(internalModel, data);
    }

    if (this.config.browTrackingEnabled) {
      this.applyBrowTracking(internalModel, data);
    }

    if (this.config.headTrackingEnabled) {
      this.applyHeadTracking(internalModel, data);
    }

    if (this.config.mouthTrackingEnabled) {
      this.applyMouthTracking(internalModel, data);
    }

    if (this.config.gazeTrackingEnabled) {
      this.applyGazeTracking(internalModel, data);
    }

    this.lastExpression = data;
  }

  // ========================
  // Eye Tracking
  // ========================

  private applyEyeTracking(internalModel: any, data: FaceExpressionData): void {
    const sensitivity = this.config.eyeSensitivity;

    // 左眼开合
    const leftEye = data.leftEyeOpenness * sensitivity;
    this.setParameter(internalModel, PARAM_NAMES.eyeLOpen, leftEye);

    // 右眼开合
    const rightEye = data.rightEyeOpenness * sensitivity;
    this.setParameter(internalModel, PARAM_NAMES.eyeROpen, rightEye);
  }

  // ========================
  // Brow Tracking
  // ========================

  private applyBrowTracking(
    internalModel: any,
    data: FaceExpressionData
  ): void {
    const sensitivity = this.config.browSensitivity;

    // 左眉毛
    const leftBrow = data.leftBrowY * sensitivity;
    this.setParameter(internalModel, PARAM_NAMES.browLY, leftBrow);

    // 右眉毛
    const rightBrow = data.rightBrowY * sensitivity;
    this.setParameter(internalModel, PARAM_NAMES.browRY, rightBrow);
  }

  // ========================
  // Head Tracking
  // ========================

  private applyHeadTracking(
    internalModel: any,
    data: FaceExpressionData
  ): void {
    const sensitivity = this.config.headSensitivity;

    // 头部左右转动
    const angleX = data.headAngleX * sensitivity;
    this.setParameter(internalModel, PARAM_NAMES.angleX, angleX);

    // 头部上下点头
    const angleY = data.headAngleY * sensitivity;
    this.setParameter(internalModel, PARAM_NAMES.angleY, angleY);

    // 头部倾斜
    const angleZ = data.headAngleZ * sensitivity;
    this.setParameter(internalModel, PARAM_NAMES.angleZ, angleZ);

    // 身体也跟随头部轻微移动（减弱幅度）
    const bodyFactor = 0.3;
    this.setParameter(
      internalModel,
      PARAM_NAMES.bodyAngleX,
      angleX * bodyFactor
    );
    this.setParameter(
      internalModel,
      PARAM_NAMES.bodyAngleZ,
      angleZ * bodyFactor
    );
  }

  // ========================
  // Mouth Tracking
  // ========================

  private applyMouthTracking(
    internalModel: any,
    data: FaceExpressionData
  ): void {
    const sensitivity = this.config.mouthSensitivity;

    // 嘴巴张开度
    const mouthOpen = Math.min(1, data.mouthOpenness * sensitivity);
    this.setParameter(internalModel, PARAM_NAMES.mouthOpenY, mouthOpen);

    // 微笑（嘴型）
    const mouthForm = data.mouthSmile;
    this.setParameter(internalModel, PARAM_NAMES.mouthForm, mouthForm);
  }

  // ========================
  // Gaze Tracking
  // ========================

  private applyGazeTracking(
    internalModel: any,
    data: FaceExpressionData
  ): void {
    // 根据面部位置计算眼球方向
    // 当用户看向屏幕边缘时，眼球跟随
    const gazeX = (data.faceX - 0.5) * 2; // -1 到 1
    const gazeY = (data.faceY - 0.5) * -2; // -1 到 1 (y轴翻转)

    this.setParameter(internalModel, PARAM_NAMES.eyeBallX, gazeX * 0.5);
    this.setParameter(internalModel, PARAM_NAMES.eyeBallY, gazeY * 0.5);
  }

  // ========================
  // Parameter Helper
  // ========================

  private setParameter(
    internalModel: any,
    paramNames: string[],
    value: number
  ): void {
    // 应用平滑
    const cacheKey = paramNames[0];
    const smoothedValue = this.smoothValue(cacheKey, value);

    // 方法1: 通过 coreModel 设置参数（Cubism 4）
    const coreModel = internalModel.coreModel;
    if (coreModel) {
      for (const name of paramNames) {
        try {
          // Cubism 4 - 使用 _model 直接设置
          const model = coreModel._model;
          if (model) {
            // 尝试找到参数索引
            const parameterCount = model.getParameterCount?.() ?? 0;
            for (let i = 0; i < parameterCount; i++) {
              const paramId = model.getParameterId?.(i);
              if (paramId === name) {
                model.setParameterValueByIndex?.(i, smoothedValue);
                if (this.config.debug && this.frameCount % 120 === 0) {
                  console.log(
                    `[ExpressionMapper] Set ${name} = ${smoothedValue.toFixed(
                      2
                    )} via _model`
                  );
                }
                return;
              }
            }
          }

          // 备选: 直接通过 coreModel 设置
          const index = coreModel.getParameterIndex?.(name);
          if (index !== undefined && index >= 0) {
            coreModel.setParameterValueByIndex?.(index, smoothedValue);
            if (this.config.debug && this.frameCount % 120 === 0) {
              console.log(
                `[ExpressionMapper] Set ${name}[${index}] = ${smoothedValue.toFixed(
                  2
                )} via coreModel`
              );
            }
            return;
          }
        } catch (e) {
          // 参数不存在，尝试下一个
          if (this.config.debug && this.frameCount % 120 === 0) {
            console.log(`[ExpressionMapper] Failed to set ${name}:`, e);
          }
        }
      }
    }

    // 方法2: 通过 model 设置参数（Cubism 2）
    const model = internalModel.model;
    if (model) {
      for (const name of paramNames) {
        try {
          if (typeof model.setParamFloat === "function") {
            model.setParamFloat(name, smoothedValue);
            if (this.config.debug && this.frameCount % 120 === 0) {
              console.log(
                `[ExpressionMapper] Set ${name} = ${smoothedValue.toFixed(
                  2
                )} via model.setParamFloat`
              );
            }
            return;
          }
        } catch {
          // 参数不存在，尝试下一个
        }
      }
    }

    // 方法3: 尝试通过 internalModel 自身设置 (pixi-live2d-display 内部方法)
    try {
      for (const name of paramNames) {
        if (typeof internalModel.setParameter === "function") {
          internalModel.setParameter(name, smoothedValue);
          if (this.config.debug && this.frameCount % 120 === 0) {
            console.log(
              `[ExpressionMapper] Set ${name} = ${smoothedValue.toFixed(
                2
              )} via internalModel.setParameter`
            );
          }
          return;
        }
      }
    } catch {
      // 不支持
    }

    // 如果所有方法都失败了，在调试模式下记录
    if (this.config.debug && this.frameCount % 600 === 0) {
      console.warn(
        `[ExpressionMapper] Could not set parameter: ${paramNames.join(", ")}`
      );
    }
  }

  private smoothValue(paramName: string, newValue: number): number {
    const factor = this.config.smoothingFactor;
    const cached = this.parameterCache.get(paramName) ?? newValue;
    const smoothed = cached + (newValue - cached) * (1 - factor);
    this.parameterCache.set(paramName, smoothed);
    return smoothed;
  }

  // ========================
  // Reset
  // ========================

  reset(): void {
    this.parameterCache.clear();
    this.lastExpression = null;

    // 重置所有参数到默认值
    const controller = getLive2DController();
    if (!controller.isReady()) return;

    const model = controller.getModel();
    if (!model?.internalModel) return;

    const internalModel = model.internalModel;

    // 重置眼睛
    this.setParameter(internalModel, PARAM_NAMES.eyeLOpen, 1);
    this.setParameter(internalModel, PARAM_NAMES.eyeROpen, 1);

    // 重置眉毛
    this.setParameter(internalModel, PARAM_NAMES.browLY, 0);
    this.setParameter(internalModel, PARAM_NAMES.browRY, 0);

    // 重置头部
    this.setParameter(internalModel, PARAM_NAMES.angleX, 0);
    this.setParameter(internalModel, PARAM_NAMES.angleY, 0);
    this.setParameter(internalModel, PARAM_NAMES.angleZ, 0);

    // 重置身体
    this.setParameter(internalModel, PARAM_NAMES.bodyAngleX, 0);
    this.setParameter(internalModel, PARAM_NAMES.bodyAngleZ, 0);

    // 重置嘴巴
    this.setParameter(internalModel, PARAM_NAMES.mouthOpenY, 0);
    this.setParameter(internalModel, PARAM_NAMES.mouthForm, 0);
  }

  // ========================
  // Debug
  // ========================

  enableDebug(): void {
    this.config.debug = true;
  }

  disableDebug(): void {
    this.config.debug = false;
  }

  // 列出模型支持的所有参数
  listModelParameters(): string[] {
    const controller = getLive2DController();
    if (!controller.isReady()) return [];

    const model = controller.getModel();
    if (!model?.internalModel) return [];

    const coreModel = model.internalModel.coreModel as any;
    if (!coreModel) return [];

    const params: string[] = [];

    try {
      // Cubism 4 API
      if (typeof coreModel.getParameterCount === "function") {
        const count = coreModel.getParameterCount();
        for (let i = 0; i < count; i++) {
          const id = coreModel.getParameterId?.(i);
          if (id) params.push(id);
        }
      }
    } catch {
      // Not supported
    }

    return params;
  }
}

// ========================
// Singleton Accessor
// ========================

export function getExpressionMapper(
  config?: Partial<ExpressionMapperConfig>
): ExpressionMapper {
  return ExpressionMapper.getInstance(config);
}
