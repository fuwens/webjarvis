import * as THREE from "three";
import { ParticleSystem } from "./particleSystem";
import type { GestureType } from "../mediapipe/handTracker";

// ========================
// Type Definitions
// ========================

export interface InteractionConfig {
  clickExplosionRadius: number;
  dragSensitivity: number;
  zoomSensitivity: number;
  smoothingFactor: number;
}

export interface InteractionState {
  isPointing: boolean;
  isSpeakingAndPointing: boolean;
  selectedRegion: THREE.Vector3 | null;
  hoverTarget: THREE.Object3D | null;
}

// ========================
// Default Configuration
// ========================

const DEFAULT_CONFIG: InteractionConfig = {
  clickExplosionRadius: 5,
  dragSensitivity: 0.01,
  zoomSensitivity: 0.1,
  smoothingFactor: 0.2,
};

// ========================
// Interaction Controller Class
// ========================

export class InteractionController {
  private particleSystem: ParticleSystem | null = null;
  private camera: THREE.Camera | null = null;
  private raycaster: THREE.Raycaster;
  private config: InteractionConfig;
  private state: InteractionState;

  // Interaction tracking
  private currentGesture: GestureType = "idle";
  private isSpeaking: boolean = false;
  private pointerPosition: THREE.Vector2 = new THREE.Vector2();
  private lastPointerPosition: THREE.Vector2 = new THREE.Vector2();
  private currentScale: number = 1;
  private targetScale: number = 1;

  constructor(config: Partial<InteractionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.raycaster = new THREE.Raycaster();
    this.state = {
      isPointing: false,
      isSpeakingAndPointing: false,
      selectedRegion: null,
      hoverTarget: null,
    };
  }

  // ========================
  // Setup
  // ========================

  setParticleSystem(particleSystem: ParticleSystem): void {
    this.particleSystem = particleSystem;
  }

  setCamera(camera: THREE.Camera): void {
    this.camera = camera;
  }

  // ========================
  // Gesture Handling
  // ========================

  handleGestureChange(gesture: GestureType): void {
    this.currentGesture = gesture;
    this.state.isPointing = gesture === "point";

    // Check combined state
    this.state.isSpeakingAndPointing = this.isSpeaking && this.state.isPointing;

    if (this.state.isSpeakingAndPointing && this.camera) {
      // Auto-select region when speaking and pointing
      this.selectRegionAtPointer();
    }
  }

  handleAirClick(x: number, y: number): void {
    if (!this.particleSystem || !this.camera) return;

    // Convert screen coordinates to normalized device coordinates
    const ndcX = (x / window.innerWidth) * 2 - 1;
    const ndcY = -(y / window.innerHeight) * 2 + 1;

    // Create 3D point for explosion
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    const explosionPoint = this.raycaster.ray.at(30, new THREE.Vector3());

    // Trigger particle explosion
    this.particleSystem.triggerExplosion(explosionPoint);

    console.log(`[InteractionController] Air click at (${x}, ${y})`);
  }

  handleAirDrag(dx: number, dy: number): void {
    if (!this.particleSystem) return;

    // Apply drag to particles
    this.particleSystem.setDragging(true, dx, dy);

    // Update pointer position
    this.lastPointerPosition.copy(this.pointerPosition);
    this.pointerPosition.x += dx * this.config.dragSensitivity;
    this.pointerPosition.y += dy * this.config.dragSensitivity;
  }

  handlePinchZoom(scale: number): void {
    if (!this.particleSystem) return;

    // Smooth scale transition
    this.targetScale *= scale;
    this.targetScale = Math.max(0.3, Math.min(2.5, this.targetScale));
  }

  // ========================
  // Speaking State
  // ========================

  handleSpeakingStart(): void {
    this.isSpeaking = true;
    this.particleSystem?.setPulsing(true);

    // Check combined state
    this.state.isSpeakingAndPointing = this.state.isPointing;

    console.log("[InteractionController] Speaking started");
  }

  handleSpeakingEnd(): void {
    this.isSpeaking = false;
    this.particleSystem?.setPulsing(false);
    this.state.isSpeakingAndPointing = false;

    console.log("[InteractionController] Speaking ended");
  }

  // ========================
  // Region Selection
  // ========================

  private selectRegionAtPointer(): void {
    if (!this.camera) return;

    this.raycaster.setFromCamera(this.pointerPosition, this.camera);
    const point = this.raycaster.ray.at(30, new THREE.Vector3());

    this.state.selectedRegion = point;
    console.log("[InteractionController] Region selected:", point);
  }

  // ========================
  // Menu Interactions
  // ========================

  handleSwipeLeft(): void {
    console.log("[InteractionController] Menu close gesture");
    return; // Return value handled by store
  }

  handleSwipeRight(): void {
    console.log("[InteractionController] Menu open gesture");
    return; // Return value handled by store
  }

  // ========================
  // Update Loop
  // ========================

  update(deltaTime: number): void {
    // Smooth scale interpolation
    this.currentScale +=
      (this.targetScale - this.currentScale) * this.config.smoothingFactor;
    this.particleSystem?.setScale(this.currentScale);

    // Update particle system
    this.particleSystem?.update(deltaTime);
  }

  // ========================
  // Raycast Helpers
  // ========================

  raycastFromScreen(
    screenX: number,
    screenY: number,
    objects: THREE.Object3D[]
  ): THREE.Intersection[] {
    if (!this.camera) return [];

    const ndcX = (screenX / window.innerWidth) * 2 - 1;
    const ndcY = -(screenY / window.innerHeight) * 2 + 1;

    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    return this.raycaster.intersectObjects(objects, true);
  }

  getWorldPositionFromScreen(
    screenX: number,
    screenY: number,
    depth: number = 30
  ): THREE.Vector3 {
    if (!this.camera) return new THREE.Vector3();

    const ndcX = (screenX / window.innerWidth) * 2 - 1;
    const ndcY = -(screenY / window.innerHeight) * 2 + 1;

    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    return this.raycaster.ray.at(depth, new THREE.Vector3());
  }

  // ========================
  // State Getters
  // ========================

  getState(): InteractionState {
    return { ...this.state };
  }

  getCurrentGesture(): GestureType {
    return this.currentGesture;
  }

  isSpeakingNow(): boolean {
    return this.isSpeaking;
  }

  getCurrentScale(): number {
    return this.currentScale;
  }

  // ========================
  // Reset
  // ========================

  reset(): void {
    this.currentGesture = "idle";
    this.isSpeaking = false;
    this.pointerPosition.set(0, 0);
    this.lastPointerPosition.set(0, 0);
    this.currentScale = 1;
    this.targetScale = 1;
    this.state = {
      isPointing: false,
      isSpeakingAndPointing: false,
      selectedRegion: null,
      hoverTarget: null,
    };
  }

  // ========================
  // Cleanup
  // ========================

  dispose(): void {
    this.particleSystem = null;
    this.camera = null;
    this.reset();
  }
}

// ========================
// Singleton Instance
// ========================

let controllerInstance: InteractionController | null = null;

export function getInteractionController(): InteractionController {
  if (!controllerInstance) {
    controllerInstance = new InteractionController();
  }
  return controllerInstance;
}

export function disposeInteractionController(): void {
  if (controllerInstance) {
    controllerInstance.dispose();
    controllerInstance = null;
  }
}
