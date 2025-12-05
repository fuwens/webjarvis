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
  headSensitivity: 0.8, // 稍微降低头部跟踪灵敏度
  mouthSensitivity: 1.5,

  smoothingFactor: 0.3,
};

// ========================
// Expression Mapper Class
// ========================

export class ExpressionMapper {
  private static instance: ExpressionMapper | null = null;

  private config: ExpressionMapperConfig;
  private lastExpression: FaceExpressionData | null = null;
  private parameterCache: Map<string, number> = new Map();

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
      return;
    }

    const controller = getLive2DController();
    if (!controller.isReady()) {
      return;
    }

    const model = controller.getModel();
    if (!model?.internalModel?.coreModel) {
      return;
    }

    const coreModel = model.internalModel.coreModel as {
      getParameterIndex: (name: string) => number;
      setParameterValueByIndex: (index: number, value: number) => void;
    };

    // 应用各种跟踪
    if (this.config.eyeTrackingEnabled) {
      this.applyEyeTracking(coreModel, data);
    }

    if (this.config.browTrackingEnabled) {
      this.applyBrowTracking(coreModel, data);
    }

    if (this.config.headTrackingEnabled) {
      this.applyHeadTracking(coreModel, data);
    }

    if (this.config.mouthTrackingEnabled) {
      this.applyMouthTracking(coreModel, data);
    }

    if (this.config.gazeTrackingEnabled) {
      this.applyGazeTracking(coreModel, data);
    }

    this.lastExpression = data;
  }

  // ========================
  // Eye Tracking
  // ========================

  private applyEyeTracking(coreModel: any, data: FaceExpressionData): void {
    const sensitivity = this.config.eyeSensitivity;

    // 左眼开合
    const leftEye = data.leftEyeOpenness * sensitivity;
    this.setParameter(coreModel, PARAM_NAMES.eyeLOpen, leftEye);

    // 右眼开合
    const rightEye = data.rightEyeOpenness * sensitivity;
    this.setParameter(coreModel, PARAM_NAMES.eyeROpen, rightEye);
  }

  // ========================
  // Brow Tracking
  // ========================

  private applyBrowTracking(coreModel: any, data: FaceExpressionData): void {
    const sensitivity = this.config.browSensitivity;

    // 左眉毛
    const leftBrow = data.leftBrowY * sensitivity;
    this.setParameter(coreModel, PARAM_NAMES.browLY, leftBrow);

    // 右眉毛
    const rightBrow = data.rightBrowY * sensitivity;
    this.setParameter(coreModel, PARAM_NAMES.browRY, rightBrow);
  }

  // ========================
  // Head Tracking
  // ========================

  private applyHeadTracking(coreModel: any, data: FaceExpressionData): void {
    const sensitivity = this.config.headSensitivity;

    // 头部左右转动
    const angleX = data.headAngleX * sensitivity;
    this.setParameter(coreModel, PARAM_NAMES.angleX, angleX);

    // 头部上下点头
    const angleY = data.headAngleY * sensitivity;
    this.setParameter(coreModel, PARAM_NAMES.angleY, angleY);

    // 头部倾斜
    const angleZ = data.headAngleZ * sensitivity;
    this.setParameter(coreModel, PARAM_NAMES.angleZ, angleZ);

    // 身体也跟随头部轻微移动（减弱幅度）
    const bodyFactor = 0.3;
    this.setParameter(
      coreModel,
      PARAM_NAMES.bodyAngleX,
      angleX * bodyFactor
    );
    this.setParameter(
      coreModel,
      PARAM_NAMES.bodyAngleZ,
      angleZ * bodyFactor
    );
  }

  // ========================
  // Mouth Tracking
  // ========================

  private applyMouthTracking(coreModel: any, data: FaceExpressionData): void {
    const sensitivity = this.config.mouthSensitivity;

    // 嘴巴张开度
    const mouthOpen = Math.min(1, data.mouthOpenness * sensitivity);
    this.setParameter(coreModel, PARAM_NAMES.mouthOpenY, mouthOpen);

    // 微笑（嘴型）
    const mouthForm = data.mouthSmile;
    this.setParameter(coreModel, PARAM_NAMES.mouthForm, mouthForm);
  }

  // ========================
  // Gaze Tracking
  // ========================

  private applyGazeTracking(coreModel: any, data: FaceExpressionData): void {
    // 根据面部位置计算眼球方向
    // 当用户看向屏幕边缘时，眼球跟随
    const gazeX = (data.faceX - 0.5) * 2; // -1 到 1
    const gazeY = (data.faceY - 0.5) * -2; // -1 到 1 (y轴翻转)

    this.setParameter(coreModel, PARAM_NAMES.eyeBallX, gazeX * 0.5);
    this.setParameter(coreModel, PARAM_NAMES.eyeBallY, gazeY * 0.5);
  }

  // ========================
  // Parameter Helper
  // ========================

  private setParameter(
    coreModel: any,
    paramNames: string[],
    value: number
  ): void {
    // 尝试不同的参数名
    for (const name of paramNames) {
      try {
        const index = coreModel.getParameterIndex(name);
        if (index >= 0) {
          // 应用平滑
          const smoothedValue = this.smoothValue(name, value);
          coreModel.setParameterValueByIndex(index, smoothedValue);
          return;
        }
      } catch {
        // 参数不存在，尝试下一个
      }
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
    if (!model?.internalModel?.coreModel) return;

    const coreModel = model.internalModel.coreModel as any;

    // 重置眼睛
    this.setParameter(coreModel, PARAM_NAMES.eyeLOpen, 1);
    this.setParameter(coreModel, PARAM_NAMES.eyeROpen, 1);

    // 重置眉毛
    this.setParameter(coreModel, PARAM_NAMES.browLY, 0);
    this.setParameter(coreModel, PARAM_NAMES.browRY, 0);

    // 重置头部
    this.setParameter(coreModel, PARAM_NAMES.angleX, 0);
    this.setParameter(coreModel, PARAM_NAMES.angleY, 0);
    this.setParameter(coreModel, PARAM_NAMES.angleZ, 0);

    // 重置身体
    this.setParameter(coreModel, PARAM_NAMES.bodyAngleX, 0);
    this.setParameter(coreModel, PARAM_NAMES.bodyAngleZ, 0);

    // 重置嘴巴
    this.setParameter(coreModel, PARAM_NAMES.mouthOpenY, 0);
    this.setParameter(coreModel, PARAM_NAMES.mouthForm, 0);
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

