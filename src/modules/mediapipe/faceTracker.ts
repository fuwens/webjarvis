import {
  FaceLandmarker,
  FilesetResolver,
  type FaceLandmarkerResult,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";

// ========================
// Type Definitions
// ========================

export interface FaceExpressionData {
  // 眼睛开合度 (0-1, 0=闭眼, 1=睁开)
  leftEyeOpenness: number;
  rightEyeOpenness: number;

  // 眉毛高度 (-1 to 1, 负=皱眉, 正=挑眉)
  leftBrowY: number;
  rightBrowY: number;

  // 头部旋转角度 (度)
  headAngleX: number; // 左右摇头 (-30 to 30)
  headAngleY: number; // 上下点头 (-30 to 30)
  headAngleZ: number; // 头部倾斜 (-30 to 30)

  // 嘴巴
  mouthOpenness: number; // 0-1
  mouthSmile: number; // -1 to 1 (撇嘴 to 微笑)

  // 面部位置 (归一化 0-1)
  faceX: number;
  faceY: number;

  // 是否检测到面部
  faceDetected: boolean;
}

export interface FaceTrackerCallbacks {
  onSpeakingStart?: () => void;
  onSpeakingEnd?: () => void;
  onMouthOpennessChange?: (openness: number) => void;
  onFaceDetected?: (detected: boolean) => void;
  onLandmarksUpdate?: (landmarks: NormalizedLandmark[]) => void;
  // 新增：完整表情数据回调
  onExpressionUpdate?: (expression: FaceExpressionData) => void;
}

interface SpeakingState {
  isSpeaking: boolean;
  mouthOpenness: number;
  speakingStartTime: number | null;
  lastMouthOpenness: number;
  smoothedOpenness: number;
  consecutiveOpenFrames: number;
  consecutiveClosedFrames: number;
}

// ========================
// Face Landmark Indices (478 landmarks)
// ========================

// 嘴巴
const UPPER_LIP_TOP = 13;
const LOWER_LIP_BOTTOM = 14;
const LEFT_MOUTH_CORNER = 61;
const RIGHT_MOUTH_CORNER = 291;

// 左眼
const LEFT_EYE_UPPER = 159;
const LEFT_EYE_LOWER = 145;
const LEFT_EYE_OUTER = 33;
const LEFT_EYE_INNER = 133;

// 右眼
const RIGHT_EYE_UPPER = 386;
const RIGHT_EYE_LOWER = 374;
const RIGHT_EYE_OUTER = 263;
const RIGHT_EYE_INNER = 362;

// 眉毛
const LEFT_BROW_INNER = 107;
const LEFT_BROW_OUTER = 70;
const LEFT_BROW_CENTER = 105;
const RIGHT_BROW_INNER = 336;
const RIGHT_BROW_OUTER = 300;
const RIGHT_BROW_CENTER = 334;

// 面部参考点
const NOSE_TIP = 1;
const FOREHEAD_CENTER = 10;
const CHIN_CENTER = 152;
const LEFT_CHEEK = 234;
const RIGHT_CHEEK = 454;

// ========================
// Thresholds & Constants
// ========================

const MOUTH_OPEN_THRESHOLD = 0.02;
const SPEAKING_FRAMES_THRESHOLD = 3;
const SMOOTHING_FACTOR = 0.3;
const EXPRESSION_SMOOTHING = 0.4;

// 眼睛开合的参考比例
const EYE_OPEN_RATIO_MIN = 0.15; // 闭眼
const EYE_OPEN_RATIO_MAX = 0.35; // 睁大

// ========================
// Singleton state
// ========================
let isInitializing = false;
let isInitialized = false;

// ========================
// Face Tracker Class
// ========================

export class FaceTracker {
  private faceLandmarker: FaceLandmarker | null = null;
  private callbacks: FaceTrackerCallbacks = {};
  private speakingState: SpeakingState = {
    isSpeaking: false,
    mouthOpenness: 0,
    speakingStartTime: null,
    lastMouthOpenness: 0,
    smoothedOpenness: 0,
    consecutiveOpenFrames: 0,
    consecutiveClosedFrames: 0,
  };
  private lastVideoTime = -1;

  // 平滑后的表情数据
  private smoothedExpression: FaceExpressionData = this.getDefaultExpression();

  // ========================
  // Initialization
  // ========================

  async initialize(): Promise<boolean> {
    if (isInitialized) {
      console.log("[FaceTracker] Already initialized");
      return true;
    }

    if (isInitializing) {
      console.log("[FaceTracker] Already initializing, waiting...");
      return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          if (isInitialized) {
            clearInterval(checkInterval);
            resolve(true);
          }
        }, 100);
        setTimeout(() => {
          clearInterval(checkInterval);
          resolve(false);
        }, 10000);
      });
    }

    isInitializing = true;

    try {
      console.log("[FaceTracker] Loading vision WASM...");
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
      );

      console.log("[FaceTracker] Creating FaceLandmarker...");
      this.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numFaces: 1,
        minFaceDetectionConfidence: 0.5,
        minFacePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: false,
      });

      isInitialized = true;
      isInitializing = false;
      console.log("[FaceTracker] Initialized successfully");
      return true;
    } catch (error) {
      isInitializing = false;
      console.error("[FaceTracker] Initialization failed:", error);
      return false;
    }
  }

  // ========================
  // Callback Registration
  // ========================

  registerCallbacks(callbacks: FaceTrackerCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  // ========================
  // Video Processing
  // ========================

  processVideoFrame(video: HTMLVideoElement): FaceLandmarkerResult | null {
    if (!this.faceLandmarker || !isInitialized) {
      return null;
    }

    const currentTime = video.currentTime;
    if (currentTime === this.lastVideoTime) {
      return null;
    }
    this.lastVideoTime = currentTime;

    try {
      const results = this.faceLandmarker.detectForVideo(
        video,
        performance.now()
      );
      this.processResults(results);
      return results;
    } catch (error) {
      console.error("[FaceTracker] Error processing frame:", error);
      return null;
    }
  }

  // ========================
  // Results Processing
  // ========================

  private processResults(results: FaceLandmarkerResult): void {
    const hasFace = results.faceLandmarks.length > 0;
    this.callbacks.onFaceDetected?.(hasFace);

    if (!hasFace) {
      this.handleNoFace();
      return;
    }

    const landmarks = results.faceLandmarks[0];
    this.callbacks.onLandmarksUpdate?.(landmarks);

    // 提取完整表情数据
    const expression = this.extractExpressionData(landmarks);

    // 应用平滑
    this.smoothExpression(expression);

    // 调用表情更新回调
    this.callbacks.onExpressionUpdate?.(this.smoothedExpression);

    // 检测嘴巴开合（兼容旧回调）
    this.detectMouthOpenness(landmarks);
  }

  // ========================
  // Expression Data Extraction
  // ========================

  private extractExpressionData(
    landmarks: NormalizedLandmark[]
  ): FaceExpressionData {
    // 眼睛开合度
    const leftEyeOpenness = this.calculateEyeOpenness(
      landmarks,
      LEFT_EYE_UPPER,
      LEFT_EYE_LOWER,
      LEFT_EYE_OUTER,
      LEFT_EYE_INNER
    );
    const rightEyeOpenness = this.calculateEyeOpenness(
      landmarks,
      RIGHT_EYE_UPPER,
      RIGHT_EYE_LOWER,
      RIGHT_EYE_OUTER,
      RIGHT_EYE_INNER
    );

    // 眉毛高度
    const { leftBrowY, rightBrowY } = this.calculateBrowPosition(landmarks);

    // 头部姿态
    const { headAngleX, headAngleY, headAngleZ } =
      this.calculateHeadPose(landmarks);

    // 嘴巴
    const { mouthOpenness, mouthSmile } = this.calculateMouthShape(landmarks);

    // 面部中心位置
    const nose = landmarks[NOSE_TIP];
    const faceX = nose.x;
    const faceY = nose.y;

    return {
      leftEyeOpenness,
      rightEyeOpenness,
      leftBrowY,
      rightBrowY,
      headAngleX,
      headAngleY,
      headAngleZ,
      mouthOpenness,
      mouthSmile,
      faceX,
      faceY,
      faceDetected: true,
    };
  }

  // ========================
  // Eye Openness Calculation
  // ========================

  private calculateEyeOpenness(
    landmarks: NormalizedLandmark[],
    upperIdx: number,
    lowerIdx: number,
    outerIdx: number,
    innerIdx: number
  ): number {
    const upper = landmarks[upperIdx];
    const lower = landmarks[lowerIdx];
    const outer = landmarks[outerIdx];
    const inner = landmarks[innerIdx];

    // 眼睛高度
    const eyeHeight = Math.abs(upper.y - lower.y);
    // 眼睛宽度
    const eyeWidth = Math.abs(outer.x - inner.x);

    if (eyeWidth === 0) return 1;

    // 高宽比
    const ratio = eyeHeight / eyeWidth;

    // 归一化到 0-1
    const normalized =
      (ratio - EYE_OPEN_RATIO_MIN) / (EYE_OPEN_RATIO_MAX - EYE_OPEN_RATIO_MIN);

    return Math.max(0, Math.min(1, normalized));
  }

  // ========================
  // Brow Position Calculation
  // ========================

  private calculateBrowPosition(landmarks: NormalizedLandmark[]): {
    leftBrowY: number;
    rightBrowY: number;
  } {
    // 眉毛中心点
    const leftBrowCenter = landmarks[LEFT_BROW_CENTER];
    const rightBrowCenter = landmarks[RIGHT_BROW_CENTER];

    // 左眼中心作为参考
    const leftEyeCenter = {
      y: (landmarks[LEFT_EYE_UPPER].y + landmarks[LEFT_EYE_LOWER].y) / 2,
    };
    const rightEyeCenter = {
      y: (landmarks[RIGHT_EYE_UPPER].y + landmarks[RIGHT_EYE_LOWER].y) / 2,
    };

    // 眉毛与眼睛的距离（归一化）
    // 正值 = 挑眉，负值 = 皱眉
    const leftBrowDist = leftEyeCenter.y - leftBrowCenter.y;
    const rightBrowDist = rightEyeCenter.y - rightBrowCenter.y;

    // 参考距离大约是 0.03-0.06，映射到 -1 到 1
    const baseDist = 0.045;
    const leftBrowY = ((leftBrowDist - baseDist) / 0.02) * 1;
    const rightBrowY = ((rightBrowDist - baseDist) / 0.02) * 1;

    return {
      leftBrowY: Math.max(-1, Math.min(1, leftBrowY)),
      rightBrowY: Math.max(-1, Math.min(1, rightBrowY)),
    };
  }

  // ========================
  // Head Pose Estimation
  // ========================

  private calculateHeadPose(landmarks: NormalizedLandmark[]): {
    headAngleX: number;
    headAngleY: number;
    headAngleZ: number;
  } {
    const nose = landmarks[NOSE_TIP];
    const leftCheek = landmarks[LEFT_CHEEK];
    const rightCheek = landmarks[RIGHT_CHEEK];
    const forehead = landmarks[FOREHEAD_CENTER];
    const chin = landmarks[CHIN_CENTER];

    // 头部左右旋转 (基于鼻子相对于双颊的位置)
    const cheekCenterX = (leftCheek.x + rightCheek.x) / 2;
    const headAngleX = (nose.x - cheekCenterX) * 100; // 归一化到大约 -30 到 30

    // 头部上下点头 (基于前额和下巴的垂直比例)
    const faceCenterY = (forehead.y + chin.y) / 2;
    const headAngleY = (nose.y - faceCenterY) * 150; // 归一化

    // 头部倾斜 (基于双眼的相对高度)
    const leftEye = landmarks[LEFT_EYE_OUTER];
    const rightEye = landmarks[RIGHT_EYE_OUTER];
    const eyeDeltaY = leftEye.y - rightEye.y;
    const eyeDeltaX = rightEye.x - leftEye.x;
    const headAngleZ = Math.atan2(eyeDeltaY, eyeDeltaX) * (180 / Math.PI);

    return {
      headAngleX: Math.max(-30, Math.min(30, headAngleX)),
      headAngleY: Math.max(-30, Math.min(30, headAngleY)),
      headAngleZ: Math.max(-30, Math.min(30, headAngleZ)),
    };
  }

  // ========================
  // Mouth Shape Calculation
  // ========================

  private calculateMouthShape(landmarks: NormalizedLandmark[]): {
    mouthOpenness: number;
    mouthSmile: number;
  } {
    const upperLip = landmarks[UPPER_LIP_TOP];
    const lowerLip = landmarks[LOWER_LIP_BOTTOM];
    const leftCorner = landmarks[LEFT_MOUTH_CORNER];
    const rightCorner = landmarks[RIGHT_MOUTH_CORNER];

    // 嘴巴张开度
    const mouthHeight = Math.abs(lowerLip.y - upperLip.y);
    const mouthWidth = Math.abs(rightCorner.x - leftCorner.x);
    const normalizedOpenness =
      mouthWidth > 0 ? mouthHeight / mouthWidth : mouthHeight;
    const mouthOpenness = Math.min(1, normalizedOpenness * 3);

    // 微笑检测：嘴角相对于嘴唇中心的高度
    const lipCenterY = (upperLip.y + lowerLip.y) / 2;
    const leftCornerRelative = lipCenterY - leftCorner.y;
    const rightCornerRelative = lipCenterY - rightCorner.y;
    const avgCornerLift = (leftCornerRelative + rightCornerRelative) / 2;

    // 归一化微笑值 (-1 到 1)
    const mouthSmile = Math.max(-1, Math.min(1, avgCornerLift * 30));

    return { mouthOpenness, mouthSmile };
  }

  // ========================
  // Expression Smoothing
  // ========================

  private smoothExpression(current: FaceExpressionData): void {
    const factor = EXPRESSION_SMOOTHING;
    const prev = this.smoothedExpression;

    this.smoothedExpression = {
      leftEyeOpenness: this.lerp(
        prev.leftEyeOpenness,
        current.leftEyeOpenness,
        factor
      ),
      rightEyeOpenness: this.lerp(
        prev.rightEyeOpenness,
        current.rightEyeOpenness,
        factor
      ),
      leftBrowY: this.lerp(prev.leftBrowY, current.leftBrowY, factor),
      rightBrowY: this.lerp(prev.rightBrowY, current.rightBrowY, factor),
      headAngleX: this.lerp(prev.headAngleX, current.headAngleX, factor),
      headAngleY: this.lerp(prev.headAngleY, current.headAngleY, factor),
      headAngleZ: this.lerp(prev.headAngleZ, current.headAngleZ, factor),
      mouthOpenness: this.lerp(
        prev.mouthOpenness,
        current.mouthOpenness,
        factor
      ),
      mouthSmile: this.lerp(prev.mouthSmile, current.mouthSmile, factor),
      faceX: this.lerp(prev.faceX, current.faceX, factor),
      faceY: this.lerp(prev.faceY, current.faceY, factor),
      faceDetected: current.faceDetected,
    };
  }

  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  private getDefaultExpression(): FaceExpressionData {
    return {
      leftEyeOpenness: 1,
      rightEyeOpenness: 1,
      leftBrowY: 0,
      rightBrowY: 0,
      headAngleX: 0,
      headAngleY: 0,
      headAngleZ: 0,
      mouthOpenness: 0,
      mouthSmile: 0,
      faceX: 0.5,
      faceY: 0.5,
      faceDetected: false,
    };
  }

  // ========================
  // Mouth Detection (Legacy)
  // ========================

  private detectMouthOpenness(landmarks: NormalizedLandmark[]): void {
    const upperLip = landmarks[UPPER_LIP_TOP];
    const lowerLip = landmarks[LOWER_LIP_BOTTOM];
    const leftCorner = landmarks[LEFT_MOUTH_CORNER];
    const rightCorner = landmarks[RIGHT_MOUTH_CORNER];

    const mouthHeight = Math.abs(lowerLip.y - upperLip.y);
    const mouthWidth = Math.abs(rightCorner.x - leftCorner.x);
    const normalizedOpenness =
      mouthWidth > 0 ? mouthHeight / mouthWidth : mouthHeight;

    this.speakingState.smoothedOpenness =
      this.speakingState.smoothedOpenness * (1 - SMOOTHING_FACTOR) +
      normalizedOpenness * SMOOTHING_FACTOR;

    const smoothedOpenness = this.speakingState.smoothedOpenness;
    this.speakingState.mouthOpenness = smoothedOpenness;

    this.callbacks.onMouthOpennessChange?.(smoothedOpenness);

    const isMouthOpen = smoothedOpenness > MOUTH_OPEN_THRESHOLD;

    if (isMouthOpen) {
      this.speakingState.consecutiveOpenFrames++;
      this.speakingState.consecutiveClosedFrames = 0;

      if (
        !this.speakingState.isSpeaking &&
        this.speakingState.consecutiveOpenFrames >= SPEAKING_FRAMES_THRESHOLD
      ) {
        this.startSpeaking();
      }
    } else {
      this.speakingState.consecutiveClosedFrames++;
      this.speakingState.consecutiveOpenFrames = 0;

      if (
        this.speakingState.isSpeaking &&
        this.speakingState.consecutiveClosedFrames >=
          SPEAKING_FRAMES_THRESHOLD * 2
      ) {
        this.stopSpeaking();
      }
    }

    this.speakingState.lastMouthOpenness = smoothedOpenness;
  }

  // ========================
  // Speaking State Management
  // ========================

  private startSpeaking(): void {
    this.speakingState.isSpeaking = true;
    this.speakingState.speakingStartTime = Date.now();
    console.log("[FaceTracker] Speaking started");
    this.callbacks.onSpeakingStart?.();
  }

  private stopSpeaking(): void {
    this.speakingState.isSpeaking = false;
    const duration = this.speakingState.speakingStartTime
      ? Date.now() - this.speakingState.speakingStartTime
      : 0;
    console.log(`[FaceTracker] Speaking ended (duration: ${duration}ms)`);
    this.speakingState.speakingStartTime = null;
    this.callbacks.onSpeakingEnd?.();
  }

  private handleNoFace(): void {
    if (this.speakingState.isSpeaking) {
      this.stopSpeaking();
    }
    this.resetSpeakingState();

    // 发送默认表情数据
    const defaultExpr = this.getDefaultExpression();
    this.smoothedExpression = defaultExpr;
    this.callbacks.onExpressionUpdate?.(defaultExpr);
  }

  private resetSpeakingState(): void {
    this.speakingState = {
      isSpeaking: false,
      mouthOpenness: 0,
      speakingStartTime: null,
      lastMouthOpenness: 0,
      smoothedOpenness: 0,
      consecutiveOpenFrames: 0,
      consecutiveClosedFrames: 0,
    };
  }

  // ========================
  // Public Getters
  // ========================

  get isSpeaking(): boolean {
    return this.speakingState.isSpeaking;
  }

  get mouthOpenness(): number {
    return this.speakingState.smoothedOpenness;
  }

  get currentExpression(): FaceExpressionData {
    return this.smoothedExpression;
  }

  // ========================
  // Cleanup
  // ========================

  dispose(): void {
    if (this.faceLandmarker) {
      this.faceLandmarker.close();
      this.faceLandmarker = null;
    }
    console.log("[FaceTracker] Disposed");
  }
}

// ========================
// Singleton Instance
// ========================

let faceTrackerInstance: FaceTracker | null = null;

export function getFaceTracker(): FaceTracker {
  if (!faceTrackerInstance) {
    faceTrackerInstance = new FaceTracker();
  }
  return faceTrackerInstance;
}

export function disposeFaceTracker(): void {
  if (faceTrackerInstance) {
    faceTrackerInstance.dispose();
  }
}
