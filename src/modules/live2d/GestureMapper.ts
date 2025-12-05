import { getLive2DController } from "./Live2DController";
import type { GestureType } from "../mediapipe/handTracker";

// ========================
// Type Definitions
// ========================

export interface GestureMapperConfig {
  enabled: boolean;
  focusTrackingEnabled: boolean;
  gestureReactionsEnabled: boolean;
  bodyTiltSensitivity: number;
  focusSmoothness: number;
}

interface HandPosition {
  x: number; // 0-1 normalized
  y: number;
  z: number;
}

// ========================
// Default Configuration
// ========================

const DEFAULT_CONFIG: GestureMapperConfig = {
  enabled: true,
  focusTrackingEnabled: true,
  gestureReactionsEnabled: true,
  bodyTiltSensitivity: 15, // degrees
  focusSmoothness: 0.1,
};

// ========================
// Gesture Mapper Class
// ========================

export class GestureMapper {
  private static instance: GestureMapper | null = null;

  private config: GestureMapperConfig;
  private lastGesture: GestureType = "idle";
  private lastHandPosition: HandPosition | null = null;
  private gestureCooldown: Map<string, number> = new Map();
  private isListening = true;

  // ========================
  // Singleton
  // ========================

  private constructor(config: Partial<GestureMapperConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  static getInstance(config?: Partial<GestureMapperConfig>): GestureMapper {
    if (!GestureMapper.instance) {
      GestureMapper.instance = new GestureMapper(config);
    }
    return GestureMapper.instance;
  }

  // ========================
  // Event Handlers
  // ========================

  /**
   * Handle hand detection event
   * Enable focus tracking when hand is detected
   */
  onHandDetected(isLeft: boolean, isRight: boolean): void {
    if (!this.config.enabled || !this.isListening) return;

    const controller = getLive2DController();
    if (!controller.isReady()) return;

    // When no hands detected, return focus to center
    if (!isLeft && !isRight) {
      controller.setTargetFocus(0, 0);
      this.lastHandPosition = null;
    }
  }

  /**
   * Handle hand position update
   * Drive Live2D focus (look at) tracking
   */
  onHandPositionUpdate(position: HandPosition): void {
    if (!this.config.enabled || !this.config.focusTrackingEnabled) return;
    if (!this.isListening) return;

    const controller = getLive2DController();
    if (!controller.isReady()) return;

    // Convert normalized position to focus coordinates (-1 to 1)
    // Note: x is mirrored for natural feel (move right hand, character looks right)
    const focusX = (position.x - 0.5) * 2;
    const focusY = (0.5 - position.y) * 2; // Invert Y

    controller.setTargetFocus(focusX, focusY);

    // Calculate body tilt based on hand position distance from center
    const tiltX = focusX * this.config.bodyTiltSensitivity;
    const tiltY = focusY * this.config.bodyTiltSensitivity * 0.5;
    controller.setBodyAngle(tiltX, tiltY);

    this.lastHandPosition = position;
  }

  /**
   * Handle gesture change event
   * Map gestures to Live2D reactions
   */
  onGestureChange(gesture: GestureType): void {
    if (!this.config.enabled || !this.config.gestureReactionsEnabled) return;
    if (!this.isListening) return;
    if (gesture === this.lastGesture) return;

    const controller = getLive2DController();
    if (!controller.isReady()) return;

    // Check cooldown
    if (this.isOnCooldown(gesture)) return;

    // Map gesture to Live2D action
    switch (gesture) {
      case "click":
        this.handleClick();
        break;
      case "pinch":
        this.handlePinch();
        break;
      case "drag":
        this.handleDrag();
        break;
      case "swipe_left":
        this.handleSwipeLeft();
        break;
      case "swipe_right":
        this.handleSwipeRight();
        break;
      case "point":
        this.handlePoint();
        break;
      case "open_palm":
        this.handleOpenPalm();
        break;
      case "idle":
        this.handleIdle();
        break;
    }

    this.lastGesture = gesture;
  }

  /**
   * Handle air click event
   */
  onAirClick(x: number, y: number): void {
    if (!this.config.enabled || !this.config.gestureReactionsEnabled) return;
    if (!this.isListening) return;

    const controller = getLive2DController();
    if (!controller.isReady()) return;

    // Look at click position briefly
    controller.setFocusFromScreenCoords(x, y);

    // Play tap reaction
    controller.tap();

    this.setCooldown("click", 500);
  }

  /**
   * Handle air drag event
   */
  onAirDrag(dx: number, dy: number): void {
    if (!this.config.enabled) return;
    if (!this.isListening) return;

    const controller = getLive2DController();
    if (!controller.isReady()) return;

    // Tilt body in drag direction
    const tiltX = Math.max(-30, Math.min(30, dx * 0.5));
    const tiltY = Math.max(-15, Math.min(15, -dy * 0.3));
    controller.setBodyAngle(tiltX, tiltY);
  }

  /**
   * Handle pinch zoom event
   */
  onPinchZoom(scale: number): void {
    if (!this.config.enabled || !this.config.gestureReactionsEnabled) return;
    if (!this.isListening) return;

    const controller = getLive2DController();
    if (!controller.isReady()) return;

    // Only react to significant scale changes
    if (scale > 1.2) {
      // Zoom in - surprised reaction
      controller.setExpression("surprised");
      this.setCooldown("pinch", 1000);
    } else if (scale < 0.8) {
      // Zoom out - calm down
      controller.setExpression("default");
    }
  }

  // ========================
  // Gesture Handlers
  // ========================

  private handleClick(): void {
    const controller = getLive2DController();

    // Wink or nod reaction
    controller.tap();
    console.log("[GestureMapper] Click -> Tap reaction");
  }

  private handlePinch(): void {
    const controller = getLive2DController();

    // Surprised or attention expression
    controller.setExpression("surprised");
    console.log("[GestureMapper] Pinch -> Surprised expression");
  }

  private handleDrag(): void {
    // Body tilt is handled in onAirDrag
    console.log("[GestureMapper] Drag detected");
  }

  private handleSwipeLeft(): void {
    const controller = getLive2DController();

    // Look left
    controller.setTargetFocus(-1, 0);
    controller.setBodyAngle(-20, 0);

    // Reset after delay
    setTimeout(() => {
      controller.setTargetFocus(0, 0);
      controller.setBodyAngle(0, 0);
    }, 500);

    this.setCooldown("swipe", 800);
    console.log("[GestureMapper] Swipe Left -> Look left");
  }

  private handleSwipeRight(): void {
    const controller = getLive2DController();

    // Look right
    controller.setTargetFocus(1, 0);
    controller.setBodyAngle(20, 0);

    // Reset after delay
    setTimeout(() => {
      controller.setTargetFocus(0, 0);
      controller.setBodyAngle(0, 0);
    }, 500);

    this.setCooldown("swipe", 800);
    console.log("[GestureMapper] Swipe Right -> Look right");
  }

  private handlePoint(): void {
    const controller = getLive2DController();

    // Attention pose - look at pointing direction
    if (this.lastHandPosition) {
      const focusX = (this.lastHandPosition.x - 0.5) * 2;
      const focusY = (0.5 - this.lastHandPosition.y) * 2;
      controller.setTargetFocus(focusX, focusY);
    }

    console.log("[GestureMapper] Point -> Track finger");
  }

  private handleOpenPalm(): void {
    const controller = getLive2DController();

    // Friendly wave reaction
    controller.flick();

    this.setCooldown("palm", 1000);
    console.log("[GestureMapper] Open Palm -> Wave reaction");
  }

  private handleIdle(): void {
    const controller = getLive2DController();

    // Return to neutral
    controller.setTargetFocus(0, 0);
    controller.setBodyAngle(0, 0);
    controller.setExpression("default");
  }

  // ========================
  // Cooldown Management
  // ========================

  private setCooldown(action: string, duration: number): void {
    this.gestureCooldown.set(action, Date.now() + duration);
  }

  private isOnCooldown(gesture: string): boolean {
    const cooldownEnd = this.gestureCooldown.get(gesture);
    if (!cooldownEnd) return false;
    return Date.now() < cooldownEnd;
  }

  // ========================
  // Control Methods
  // ========================

  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }

  setFocusTrackingEnabled(enabled: boolean): void {
    this.config.focusTrackingEnabled = enabled;
  }

  setGestureReactionsEnabled(enabled: boolean): void {
    this.config.gestureReactionsEnabled = enabled;
  }

  pause(): void {
    this.isListening = false;
  }

  resume(): void {
    this.isListening = true;
  }

  // ========================
  // Cleanup
  // ========================

  dispose(): void {
    this.gestureCooldown.clear();
    this.lastHandPosition = null;
    this.lastGesture = "idle";
    GestureMapper.instance = null;
  }
}

// ========================
// Export singleton accessor
// ========================

export function getGestureMapper(
  config?: Partial<GestureMapperConfig>
): GestureMapper {
  return GestureMapper.getInstance(config);
}

