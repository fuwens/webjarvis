import {
  FaceLandmarker,
  FilesetResolver,
  type FaceLandmarkerResult,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";

// ========================
// Type Definitions
// ========================

export interface FaceTrackerCallbacks {
  onSpeakingStart?: () => void;
  onSpeakingEnd?: () => void;
  onMouthOpennessChange?: (openness: number) => void;
  onFaceDetected?: (detected: boolean) => void;
  onLandmarksUpdate?: (landmarks: NormalizedLandmark[]) => void;
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
// Constants
// ========================

// Mouth landmark indices (478 landmarks total)
const UPPER_LIP_TOP = 13;
const LOWER_LIP_BOTTOM = 14;
const LEFT_MOUTH_CORNER = 61;
const RIGHT_MOUTH_CORNER = 291;

// Thresholds
const MOUTH_OPEN_THRESHOLD = 0.02; // Normalized distance
const SPEAKING_FRAMES_THRESHOLD = 3; // Consecutive frames to confirm speaking
const SMOOTHING_FACTOR = 0.3; // For smoothing mouth openness

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

  // ========================
  // Initialization
  // ========================

  async initialize(): Promise<boolean> {
    // Prevent multiple initializations
    if (isInitialized) {
      console.log("[FaceTracker] Already initialized");
      return true;
    }

    if (isInitializing) {
      console.log("[FaceTracker] Already initializing, waiting...");
      // Wait for initialization to complete
      return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          if (isInitialized) {
            clearInterval(checkInterval);
            resolve(true);
          }
        }, 100);
        // Timeout after 10 seconds
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

    // Detect mouth openness
    this.detectMouthOpenness(landmarks);
  }

  // ========================
  // Mouth Detection
  // ========================

  private detectMouthOpenness(landmarks: NormalizedLandmark[]): void {
    // Get mouth landmarks
    const upperLip = landmarks[UPPER_LIP_TOP];
    const lowerLip = landmarks[LOWER_LIP_BOTTOM];
    const leftCorner = landmarks[LEFT_MOUTH_CORNER];
    const rightCorner = landmarks[RIGHT_MOUTH_CORNER];

    // Calculate mouth opening (vertical distance)
    const mouthHeight = Math.abs(lowerLip.y - upperLip.y);

    // Calculate mouth width for normalization
    const mouthWidth = Math.abs(rightCorner.x - leftCorner.x);

    // Normalize mouth openness by width (accounts for distance from camera)
    const normalizedOpenness =
      mouthWidth > 0 ? mouthHeight / mouthWidth : mouthHeight;

    // Apply smoothing
    this.speakingState.smoothedOpenness =
      this.speakingState.smoothedOpenness * (1 - SMOOTHING_FACTOR) +
      normalizedOpenness * SMOOTHING_FACTOR;

    const smoothedOpenness = this.speakingState.smoothedOpenness;
    this.speakingState.mouthOpenness = smoothedOpenness;

    // Notify openness change
    this.callbacks.onMouthOpennessChange?.(smoothedOpenness);

    // Detect speaking state
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

  // ========================
  // Cleanup
  // ========================

  dispose(): void {
    if (this.faceLandmarker) {
      this.faceLandmarker.close();
      this.faceLandmarker = null;
    }
    // Don't reset global state to allow re-use
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
    // Keep instance for potential reuse
  }
}
