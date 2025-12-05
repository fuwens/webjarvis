import { getLive2DController } from "./Live2DController";

// ========================
// Type Definitions
// ========================

export interface LipSyncConfig {
  enabled: boolean;
  sensitivity: number; // 0-1, how responsive to mouth movement
  smoothing: number; // 0-1, smoothing factor
  minOpenness: number; // minimum threshold to trigger
  maxOpenness: number; // cap for mouth openness
  attentivePoseEnabled: boolean; // lean forward when listening
}

// ========================
// Default Configuration
// ========================

const DEFAULT_CONFIG: LipSyncConfig = {
  enabled: true,
  sensitivity: 2.0, // Amplify small mouth movements
  smoothing: 0.3,
  minOpenness: 0.01,
  maxOpenness: 1.0,
  attentivePoseEnabled: true,
};

// ========================
// Lip Sync Controller Class
// ========================

export class LipSyncController {
  private static instance: LipSyncController | null = null;

  private config: LipSyncConfig;
  private isSpeaking = false;
  private currentOpenness = 0;
  private smoothedOpenness = 0;
  private attentiveStartTime: number | null = null;

  // Attentive pose parameters
  private readonly ATTENTIVE_BODY_ANGLE_Z = 5; // Lean forward
  private readonly ATTENTIVE_TRANSITION_DURATION = 500; // ms

  // ========================
  // Singleton
  // ========================

  private constructor(config: Partial<LipSyncConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  static getInstance(config?: Partial<LipSyncConfig>): LipSyncController {
    if (!LipSyncController.instance) {
      LipSyncController.instance = new LipSyncController(config);
    }
    return LipSyncController.instance;
  }

  // ========================
  // Speaking State Handlers
  // ========================

  /**
   * Called when user starts speaking
   */
  onSpeakingStart(): void {
    if (!this.config.enabled) return;

    this.isSpeaking = true;
    this.attentiveStartTime = Date.now();

    console.log("[LipSyncController] Speaking started - entering attentive mode");

    // Enter attentive pose
    if (this.config.attentivePoseEnabled) {
      this.enterAttentiveMode();
    }
  }

  /**
   * Called when user stops speaking
   */
  onSpeakingEnd(): void {
    if (!this.config.enabled) return;

    this.isSpeaking = false;
    this.attentiveStartTime = null;

    console.log("[LipSyncController] Speaking ended - exiting attentive mode");

    // Close mouth
    const controller = getLive2DController();
    if (controller.isReady()) {
      controller.setMouthOpenness(0);
    }

    // Exit attentive pose
    if (this.config.attentivePoseEnabled) {
      this.exitAttentiveMode();
    }
  }

  /**
   * Update mouth openness based on detected value
   * Called continuously during speech detection
   */
  onMouthOpennessUpdate(rawOpenness: number): void {
    if (!this.config.enabled) return;

    const controller = getLive2DController();
    if (!controller.isReady()) return;

    // Apply threshold
    if (rawOpenness < this.config.minOpenness) {
      rawOpenness = 0;
    }

    // Apply sensitivity and cap
    let openness = rawOpenness * this.config.sensitivity;
    openness = Math.min(openness, this.config.maxOpenness);

    // Apply smoothing
    this.smoothedOpenness =
      this.smoothedOpenness * (1 - this.config.smoothing) +
      openness * this.config.smoothing;

    this.currentOpenness = this.smoothedOpenness;

    // Update Live2D mouth
    controller.setMouthOpenness(this.currentOpenness);
  }

  // ========================
  // Attentive Mode
  // ========================

  private enterAttentiveMode(): void {
    const controller = getLive2DController();
    if (!controller.isReady()) return;

    // Look at center (focus on user)
    controller.setTargetFocus(0, 0);

    // Lean forward slightly
    controller.setBodyAngle(0, 0, this.ATTENTIVE_BODY_ANGLE_Z);
  }

  private exitAttentiveMode(): void {
    const controller = getLive2DController();
    if (!controller.isReady()) return;

    // Return to neutral pose
    controller.setBodyAngle(0, 0, 0);

    // Play idle motion
    controller.playIdleMotion();
  }

  // ========================
  // Simulated Lip Sync
  // ========================

  /**
   * Simulate lip movement when actual mouth detection isn't available
   * Creates a natural-looking oscillation
   */
  simulateSpeaking(intensity: number = 0.5): void {
    if (!this.config.enabled || !this.isSpeaking) return;

    const controller = getLive2DController();
    if (!controller.isReady()) return;

    // Generate pseudo-random mouth movement
    const time = Date.now() / 100;
    const wave1 = Math.sin(time * 1.5) * 0.3;
    const wave2 = Math.sin(time * 2.7) * 0.2;
    const wave3 = Math.sin(time * 4.1) * 0.1;

    const openness = (wave1 + wave2 + wave3 + 0.6) * intensity;
    const normalizedOpenness = Math.max(0, Math.min(1, openness));

    controller.setMouthOpenness(normalizedOpenness);
  }

  // ========================
  // Configuration
  // ========================

  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }

  setSensitivity(sensitivity: number): void {
    this.config.sensitivity = Math.max(0.1, Math.min(5, sensitivity));
  }

  setSmoothing(smoothing: number): void {
    this.config.smoothing = Math.max(0, Math.min(1, smoothing));
  }

  setAttentivePoseEnabled(enabled: boolean): void {
    this.config.attentivePoseEnabled = enabled;
  }

  // ========================
  // Getters
  // ========================

  getIsSpeaking(): boolean {
    return this.isSpeaking;
  }

  getCurrentOpenness(): number {
    return this.currentOpenness;
  }

  // ========================
  // Cleanup
  // ========================

  dispose(): void {
    this.isSpeaking = false;
    this.currentOpenness = 0;
    this.smoothedOpenness = 0;
    this.attentiveStartTime = null;
    LipSyncController.instance = null;
  }
}

// ========================
// Export singleton accessor
// ========================

export function getLipSyncController(
  config?: Partial<LipSyncConfig>
): LipSyncController {
  return LipSyncController.getInstance(config);
}

