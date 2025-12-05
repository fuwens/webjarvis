/*
 * @Author: fuwen
 * @LastEditors: fuwens@163.com
 * @Date: 2025-12-05 12:03:10
 * @Description: 介绍文件的作用、文件的入参、出参。
 */
import { create } from "zustand";
import type { FaceExpressionData } from "../modules/mediapipe/faceTracker";

// ========================
// Type Definitions
// ========================

export type GestureType =
  | "idle"
  | "pinch"
  | "drag"
  | "click"
  | "swipe_left"
  | "swipe_right"
  | "point"
  | "open_palm";

export type ThemeType = "jarvis-blue" | "neon-purple" | "holo-green";

export interface HandPosition {
  x: number;
  y: number;
  z: number;
}

export interface GestureCallbacks {
  onAirClick?: (x: number, y: number) => void;
  onAirDrag?: (dx: number, dy: number) => void;
  onPinchZoom?: (scale: number) => void;
  onGestureChange?: (gestureType: GestureType) => void;
  onSpeakingStart?: () => void;
  onSpeakingEnd?: () => void;
  onHandDetected?: (isLeft: boolean, isRight: boolean) => void;
  onExpressionUpdate?: (expression: FaceExpressionData) => void;
}

export interface JarvisState {
  // Hand tracking state
  isLeftHandDetected: boolean;
  isRightHandDetected: boolean;
  leftHandPosition: HandPosition | null;
  rightHandPosition: HandPosition | null;
  currentGesture: GestureType;
  isPinching: boolean;
  pinchScale: number;

  // Face tracking state
  isSpeaking: boolean;
  mouthOpenness: number;
  faceExpression: FaceExpressionData | null;

  // UI state
  isMenuOpen: boolean;
  selectedMenuItem: number | null;
  theme: ThemeType;
  isLoading: boolean;
  isCameraReady: boolean;

  // Interaction state
  pointerPosition: { x: number; y: number };
  dragDelta: { dx: number; dy: number };

  // Callbacks registry
  callbacks: GestureCallbacks;
}

export interface JarvisActions {
  // Hand tracking actions
  setLeftHandDetected: (detected: boolean) => void;
  setRightHandDetected: (detected: boolean) => void;
  setLeftHandPosition: (position: HandPosition | null) => void;
  setRightHandPosition: (position: HandPosition | null) => void;
  setCurrentGesture: (gesture: GestureType) => void;
  setIsPinching: (pinching: boolean) => void;
  setPinchScale: (scale: number) => void;

  // Face tracking actions
  setIsSpeaking: (speaking: boolean) => void;
  setMouthOpenness: (openness: number) => void;
  setFaceExpression: (expression: FaceExpressionData | null) => void;

  // UI actions
  toggleMenu: () => void;
  setMenuOpen: (open: boolean) => void;
  selectMenuItem: (index: number | null) => void;
  setTheme: (theme: ThemeType) => void;
  setLoading: (loading: boolean) => void;
  setCameraReady: (ready: boolean) => void;

  // Interaction actions
  setPointerPosition: (x: number, y: number) => void;
  setDragDelta: (dx: number, dy: number) => void;

  // Event system
  registerCallbacks: (callbacks: GestureCallbacks) => void;

  // Unified event triggers
  triggerAirClick: (x: number, y: number) => void;
  triggerAirDrag: (dx: number, dy: number) => void;
  triggerPinchZoom: (scale: number) => void;
  triggerGestureChange: (gestureType: GestureType) => void;
  triggerSpeakingStart: () => void;
  triggerSpeakingEnd: () => void;
  triggerHandDetected: (isLeft: boolean, isRight: boolean) => void;
  triggerExpressionUpdate: (expression: FaceExpressionData) => void;
}

// ========================
// Store Implementation
// ========================

export const useJarvisStore = create<JarvisState & JarvisActions>(
  (set, get) => ({
    // Initial state
    isLeftHandDetected: false,
    isRightHandDetected: false,
    leftHandPosition: null,
    rightHandPosition: null,
    currentGesture: "idle",
    isPinching: false,
    pinchScale: 1,

    isSpeaking: false,
    mouthOpenness: 0,
    faceExpression: null,

    isMenuOpen: false,
    selectedMenuItem: null,
    theme: "jarvis-blue",
    isLoading: true,
    isCameraReady: false,

    pointerPosition: { x: 0, y: 0 },
    dragDelta: { dx: 0, dy: 0 },

    callbacks: {},

    // Hand tracking actions
    setLeftHandDetected: (detected) => set({ isLeftHandDetected: detected }),
    setRightHandDetected: (detected) => set({ isRightHandDetected: detected }),
    setLeftHandPosition: (position) => set({ leftHandPosition: position }),
    setRightHandPosition: (position) => set({ rightHandPosition: position }),
    setCurrentGesture: (gesture) => set({ currentGesture: gesture }),
    setIsPinching: (pinching) => set({ isPinching: pinching }),
    setPinchScale: (scale) => set({ pinchScale: scale }),

    // Face tracking actions
    setIsSpeaking: (speaking) => set({ isSpeaking: speaking }),
    setMouthOpenness: (openness) => set({ mouthOpenness: openness }),
    setFaceExpression: (expression) => set({ faceExpression: expression }),

    // UI actions
    toggleMenu: () => set((state) => ({ isMenuOpen: !state.isMenuOpen })),
    setMenuOpen: (open) => set({ isMenuOpen: open }),
    selectMenuItem: (index) => set({ selectedMenuItem: index }),
    setTheme: (theme) => {
      set({ theme });
      // Update document data-theme attribute
      if (typeof document !== "undefined") {
        if (theme === "jarvis-blue") {
          document.documentElement.removeAttribute("data-theme");
        } else {
          document.documentElement.setAttribute("data-theme", theme);
        }
      }
    },
    setLoading: (loading) => set({ isLoading: loading }),
    setCameraReady: (ready) => set({ isCameraReady: ready }),

    // Interaction actions
    setPointerPosition: (x, y) => set({ pointerPosition: { x, y } }),
    setDragDelta: (dx, dy) => set({ dragDelta: { dx, dy } }),

    // Event system
    registerCallbacks: (callbacks) =>
      set((state) => ({
        callbacks: { ...state.callbacks, ...callbacks },
      })),

    // Unified event triggers
    triggerAirClick: (x, y) => {
      const { callbacks } = get();
      callbacks.onAirClick?.(x, y);
    },

    triggerAirDrag: (dx, dy) => {
      const { callbacks } = get();
      set({ dragDelta: { dx, dy } });
      callbacks.onAirDrag?.(dx, dy);
    },

    triggerPinchZoom: (scale) => {
      const { callbacks } = get();
      set({ pinchScale: scale });
      callbacks.onPinchZoom?.(scale);
    },

    triggerGestureChange: (gestureType) => {
      const { callbacks, currentGesture } = get();
      if (currentGesture !== gestureType) {
        set({ currentGesture: gestureType });
        callbacks.onGestureChange?.(gestureType);
      }
    },

    triggerSpeakingStart: () => {
      const { callbacks, isSpeaking } = get();
      if (!isSpeaking) {
        set({ isSpeaking: true });
        callbacks.onSpeakingStart?.();
      }
    },

    triggerSpeakingEnd: () => {
      const { callbacks, isSpeaking } = get();
      if (isSpeaking) {
        set({ isSpeaking: false });
        callbacks.onSpeakingEnd?.();
      }
    },

    triggerHandDetected: (isLeft, isRight) => {
      const { callbacks } = get();
      set({
        isLeftHandDetected: isLeft,
        isRightHandDetected: isRight,
      });
      callbacks.onHandDetected?.(isLeft, isRight);
    },

    triggerExpressionUpdate: (expression) => {
      const { callbacks } = get();
      set({ faceExpression: expression });
      callbacks.onExpressionUpdate?.(expression);
    },
  })
);

// ========================
// Selector Hooks
// ========================

export const useHandState = () =>
  useJarvisStore((state) => ({
    isLeftHandDetected: state.isLeftHandDetected,
    isRightHandDetected: state.isRightHandDetected,
    leftHandPosition: state.leftHandPosition,
    rightHandPosition: state.rightHandPosition,
    currentGesture: state.currentGesture,
    isPinching: state.isPinching,
  }));

export const useFaceState = () =>
  useJarvisStore((state) => ({
    isSpeaking: state.isSpeaking,
    mouthOpenness: state.mouthOpenness,
    faceExpression: state.faceExpression,
  }));

export const useUIState = () =>
  useJarvisStore((state) => ({
    isMenuOpen: state.isMenuOpen,
    selectedMenuItem: state.selectedMenuItem,
    theme: state.theme,
    isLoading: state.isLoading,
    isCameraReady: state.isCameraReady,
  }));

export const useInteractionState = () =>
  useJarvisStore((state) => ({
    pointerPosition: state.pointerPosition,
    dragDelta: state.dragDelta,
    pinchScale: state.pinchScale,
  }));
