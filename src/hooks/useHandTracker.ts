import { useEffect, useRef, useCallback, useState } from "react";
import {
  getHandTracker,
  type HandTrackerCallbacks,
} from "../modules/mediapipe/handTracker";
import { useJarvisStore } from "../stores/useJarvisStore";

export interface UseHandTrackerOptions {
  enabled?: boolean;
  onReady?: () => void;
  onError?: (error: Error) => void;
}

export function useHandTracker(options: UseHandTrackerOptions = {}) {
  const { enabled = true, onReady, onError } = options;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const isRunningRef = useRef(false);
  const isInitializedRef = useRef(false);
  const [isReady, setIsReady] = useState(false);

  const store = useJarvisStore();

  // Initialize tracker
  const initialize = useCallback(async () => {
    if (!enabled || isInitializedRef.current) return;

    try {
      const tracker = getHandTracker();

      // Register callbacks before initialization
      const callbacks: HandTrackerCallbacks = {
        onAirClick: (x, y) => {
          store.triggerAirClick(x, y);
          store.setPointerPosition(x, y);
        },
        onAirDrag: (dx, dy) => {
          store.triggerAirDrag(dx, dy);
        },
        onPinchZoom: (scale) => {
          store.triggerPinchZoom(scale);
        },
        onGestureChange: (gesture) => {
          store.triggerGestureChange(gesture);

          // Handle menu gestures
          if (gesture === "swipe_right") {
            store.setMenuOpen(true);
          } else if (gesture === "swipe_left") {
            store.setMenuOpen(false);
          }
        },
        onHandDetected: (isLeft, isRight) => {
          store.triggerHandDetected(isLeft, isRight);
        },
        onLandmarksUpdate: () => {
          // Landmarks are drawn in CameraFeed component
        },
      };

      tracker.registerCallbacks(callbacks);

      const success = await tracker.initialize();

      if (!success) {
        throw new Error("Failed to initialize hand tracker");
      }

      isInitializedRef.current = true;
      setIsReady(true);
      onReady?.();
    } catch (error) {
      console.error("[useHandTracker] Initialization error:", error);
      onError?.(error as Error);
    }
  }, [enabled, onReady, onError, store]);

  // Process video frame
  const processFrame = useCallback(() => {
    if (!videoRef.current || !isRunningRef.current) return;

    const tracker = getHandTracker();
    tracker.processVideoFrame(videoRef.current);

    animationRef.current = requestAnimationFrame(processFrame);
  }, []);

  // Start processing
  const start = useCallback(
    (video: HTMLVideoElement) => {
      if (!isInitializedRef.current) {
        console.warn("[useHandTracker] Not initialized yet");
        return;
      }
      videoRef.current = video;
      isRunningRef.current = true;
      processFrame();
    },
    [processFrame]
  );

  // Stop processing
  const stop = useCallback(() => {
    isRunningRef.current = false;
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
  }, []);

  // Initialize on mount
  useEffect(() => {
    initialize();

    return () => {
      stop();
      // Don't dispose - keep for potential reuse
    };
  }, [initialize, stop]);

  return {
    start,
    stop,
    videoRef,
    isReady,
  };
}
