import {
  HandLandmarker,
  FilesetResolver,
  type HandLandmarkerResult,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";

// ========================
// Type Definitions
// ========================

export interface HandTrackerCallbacks {
  onAirClick?: (x: number, y: number) => void;
  onAirDrag?: (dx: number, dy: number) => void;
  onPinchZoom?: (scale: number) => void;
  onGestureChange?: (gesture: GestureType) => void;
  onHandDetected?: (isLeft: boolean, isRight: boolean) => void;
  onLandmarksUpdate?: (
    landmarks: NormalizedLandmark[][],
    handedness: string[]
  ) => void;
}

export type GestureType =
  | "idle"
  | "pinch"
  | "drag"
  | "click"
  | "swipe_left"
  | "swipe_right"
  | "point"
  | "open_palm";

interface GestureState {
  isPinching: boolean;
  isDragging: boolean;
  lastPinchDistance: number;
  lastPosition: { x: number; y: number } | null;
  pinchStartPosition: { x: number; y: number } | null;
  clickCooldown: boolean;
  lastZDepth: number;
  gestureHistory: GestureType[];
}

// ========================
// Constants
// ========================

const PINCH_THRESHOLD = 0.05; // Distance threshold for pinch detection
const DRAG_THRESHOLD = 0.02; // Movement threshold for drag detection
const CLICK_Z_THRESHOLD = 0.03; // Z-axis movement for click detection
const SWIPE_THRESHOLD = 0.15; // Horizontal movement for swipe
const CLICK_COOLDOWN_MS = 300; // Cooldown between clicks

// Hand landmark indices
const THUMB_TIP = 4;
const INDEX_TIP = 8;
const MIDDLE_TIP = 12;
const RING_TIP = 16;
const PINKY_TIP = 20;
const WRIST = 0;
const INDEX_MCP = 5;

// ========================
// Singleton state
// ========================
let isInitializing = false;
let isInitialized = false;

// ========================
// Hand Tracker Class
// ========================

export class HandTracker {
  private handLandmarker: HandLandmarker | null = null;
  private callbacks: HandTrackerCallbacks = {};
  private gestureState: GestureState = {
    isPinching: false,
    isDragging: false,
    lastPinchDistance: 0,
    lastPosition: null,
    pinchStartPosition: null,
    clickCooldown: false,
    lastZDepth: 0,
    gestureHistory: [],
  };
  private lastVideoTime = -1;

  // ========================
  // Initialization
  // ========================

  async initialize(): Promise<boolean> {
    // Prevent multiple initializations
    if (isInitialized) {
      console.log("[HandTracker] Already initialized");
      return true;
    }

    if (isInitializing) {
      console.log("[HandTracker] Already initializing, waiting...");
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
      console.log("[HandTracker] Loading vision WASM...");
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
      );

      console.log("[HandTracker] Creating HandLandmarker...");
      this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      isInitialized = true;
      isInitializing = false;
      console.log("[HandTracker] Initialized successfully");
      return true;
    } catch (error) {
      isInitializing = false;
      console.error("[HandTracker] Initialization failed:", error);
      return false;
    }
  }

  // ========================
  // Callback Registration
  // ========================

  registerCallbacks(callbacks: HandTrackerCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  // ========================
  // Video Processing
  // ========================

  processVideoFrame(video: HTMLVideoElement): HandLandmarkerResult | null {
    if (!this.handLandmarker || !isInitialized) {
      return null;
    }

    const currentTime = video.currentTime;
    if (currentTime === this.lastVideoTime) {
      return null;
    }
    this.lastVideoTime = currentTime;

    try {
      const results = this.handLandmarker.detectForVideo(
        video,
        performance.now()
      );
      this.processResults(results);
      return results;
    } catch (error) {
      console.error("[HandTracker] Error processing frame:", error);
      return null;
    }
  }

  // ========================
  // Results Processing
  // ========================

  private processResults(results: HandLandmarkerResult): void {
    const hasHands = results.landmarks.length > 0;

    // Detect handedness
    let isLeftHand = false;
    let isRightHand = false;

    results.handednesses.forEach((handedness) => {
      // Note: Mediapipe returns mirrored handedness for front camera
      const label = handedness[0]?.categoryName?.toLowerCase();
      if (label === "left") isRightHand = true; // Mirrored
      if (label === "right") isLeftHand = true; // Mirrored
    });

    this.callbacks.onHandDetected?.(isLeftHand, isRightHand);

    // Send landmarks for visualization
    if (results.landmarks.length > 0) {
      const handednessLabels = results.handednesses.map(
        (h) => h[0]?.categoryName || "unknown"
      );
      this.callbacks.onLandmarksUpdate?.(results.landmarks, handednessLabels);
    }

    if (!hasHands) {
      this.resetGestureState();
      this.callbacks.onGestureChange?.("idle");
      return;
    }

    // Process primary hand (first detected)
    const landmarks = results.landmarks[0];
    this.detectGestures(landmarks);
  }

  // ========================
  // Gesture Detection
  // ========================

  private detectGestures(landmarks: NormalizedLandmark[]): void {
    const thumbTip = landmarks[THUMB_TIP];
    const indexTip = landmarks[INDEX_TIP];
    const wrist = landmarks[WRIST];
    const indexMcp = landmarks[INDEX_MCP];

    // Calculate pinch distance (thumb to index)
    const pinchDistance = this.calculateDistance(thumbTip, indexTip);

    // Detect pinch gesture
    const isPinching = pinchDistance < PINCH_THRESHOLD;

    // Get palm center for position tracking
    const palmCenter = {
      x: (wrist.x + indexMcp.x) / 2,
      y: (wrist.y + indexMcp.y) / 2,
      z: (wrist.z + indexMcp.z) / 2,
    };

    // ---- Pinch Zoom Detection ----
    if (isPinching) {
      if (!this.gestureState.isPinching) {
        // Pinch started
        this.gestureState.isPinching = true;
        this.gestureState.lastPinchDistance = pinchDistance;
        this.gestureState.pinchStartPosition = {
          x: palmCenter.x,
          y: palmCenter.y,
        };
        this.callbacks.onGestureChange?.("pinch");
      } else {
        // Ongoing pinch - check for drag
        if (this.gestureState.lastPosition) {
          const dx = palmCenter.x - this.gestureState.lastPosition.x;
          const dy = palmCenter.y - this.gestureState.lastPosition.y;

          if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
            this.gestureState.isDragging = true;
            this.callbacks.onAirDrag?.(dx * 100, dy * 100);
            this.callbacks.onGestureChange?.("drag");
          }
        }

        // Calculate zoom scale based on pinch distance change
        const scale = this.gestureState.lastPinchDistance / pinchDistance;
        if (Math.abs(scale - 1) > 0.05) {
          this.callbacks.onPinchZoom?.(scale);
        }
        this.gestureState.lastPinchDistance = pinchDistance;
      }
    } else {
      if (this.gestureState.isPinching) {
        // Pinch ended
        this.gestureState.isPinching = false;
        this.gestureState.isDragging = false;
        this.gestureState.pinchStartPosition = null;
      }
    }

    // ---- Air Click Detection (Z-axis poke) ----
    if (!isPinching && !this.gestureState.clickCooldown) {
      const currentZ = indexTip.z;
      const zDelta = this.gestureState.lastZDepth - currentZ; // Forward motion = negative delta

      if (zDelta > CLICK_Z_THRESHOLD) {
        // Forward poke detected
        const screenX = indexTip.x * window.innerWidth;
        const screenY = indexTip.y * window.innerHeight;
        this.callbacks.onAirClick?.(screenX, screenY);
        this.callbacks.onGestureChange?.("click");

        // Set cooldown
        this.gestureState.clickCooldown = true;
        setTimeout(() => {
          this.gestureState.clickCooldown = false;
        }, CLICK_COOLDOWN_MS);
      }
      this.gestureState.lastZDepth = currentZ;
    }

    // ---- Swipe Detection ----
    if (!isPinching && this.gestureState.lastPosition) {
      const dx = palmCenter.x - this.gestureState.lastPosition.x;

      if (dx > SWIPE_THRESHOLD) {
        this.callbacks.onGestureChange?.("swipe_right");
      } else if (dx < -SWIPE_THRESHOLD) {
        this.callbacks.onGestureChange?.("swipe_left");
      }
    }

    // ---- Open Palm Detection ----
    if (!isPinching) {
      const fingerSpread = this.calculateFingerSpread(landmarks);
      if (fingerSpread > 0.15) {
        this.callbacks.onGestureChange?.("open_palm");
      }
    }

    // ---- Point Detection ----
    const isPointing = this.detectPointGesture(landmarks);
    if (isPointing && !isPinching) {
      this.callbacks.onGestureChange?.("point");
    }

    // Update last position
    this.gestureState.lastPosition = { x: palmCenter.x, y: palmCenter.y };
  }

  // ========================
  // Helper Methods
  // ========================

  private calculateDistance(
    p1: NormalizedLandmark,
    p2: NormalizedLandmark
  ): number {
    return Math.sqrt(
      Math.pow(p1.x - p2.x, 2) +
        Math.pow(p1.y - p2.y, 2) +
        Math.pow(p1.z - p2.z, 2)
    );
  }

  private calculateFingerSpread(landmarks: NormalizedLandmark[]): number {
    const tips = [
      landmarks[THUMB_TIP],
      landmarks[INDEX_TIP],
      landmarks[MIDDLE_TIP],
      landmarks[RING_TIP],
      landmarks[PINKY_TIP],
    ];

    let totalSpread = 0;
    for (let i = 0; i < tips.length - 1; i++) {
      totalSpread += this.calculateDistance(tips[i], tips[i + 1]);
    }
    return totalSpread / 4;
  }

  private detectPointGesture(landmarks: NormalizedLandmark[]): boolean {
    // Index finger extended, others curled
    const indexTip = landmarks[INDEX_TIP];
    const indexMcp = landmarks[INDEX_MCP];
    const middleTip = landmarks[MIDDLE_TIP];
    const ringTip = landmarks[RING_TIP];
    const pinkyTip = landmarks[PINKY_TIP];

    // Index should be extended (tip above MCP)
    const indexExtended = indexTip.y < indexMcp.y - 0.05;

    // Other fingers should be curled (tips closer to wrist than index tip)
    const othersCurled =
      middleTip.y > indexTip.y + 0.05 &&
      ringTip.y > indexTip.y + 0.05 &&
      pinkyTip.y > indexTip.y + 0.05;

    return indexExtended && othersCurled;
  }

  private resetGestureState(): void {
    this.gestureState = {
      isPinching: false,
      isDragging: false,
      lastPinchDistance: 0,
      lastPosition: null,
      pinchStartPosition: null,
      clickCooldown: false,
      lastZDepth: 0,
      gestureHistory: [],
    };
  }

  // ========================
  // Cleanup
  // ========================

  dispose(): void {
    if (this.handLandmarker) {
      this.handLandmarker.close();
      this.handLandmarker = null;
    }
    // Don't reset global state to allow re-use
    console.log("[HandTracker] Disposed");
  }
}

// ========================
// Singleton Instance
// ========================

let handTrackerInstance: HandTracker | null = null;

export function getHandTracker(): HandTracker {
  if (!handTrackerInstance) {
    handTrackerInstance = new HandTracker();
  }
  return handTrackerInstance;
}

export function disposeHandTracker(): void {
  if (handTrackerInstance) {
    handTrackerInstance.dispose();
    // Keep instance for potential reuse
  }
}
