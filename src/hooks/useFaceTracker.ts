import { useEffect, useRef, useCallback, useState } from "react";
import {
  getFaceTracker,
  type FaceTrackerCallbacks,
} from "../modules/mediapipe/faceTracker";
import { useJarvisStore } from "../stores/useJarvisStore";

export interface UseFaceTrackerOptions {
  enabled?: boolean;
  onReady?: () => void;
  onError?: (error: Error) => void;
}

export function useFaceTracker(options: UseFaceTrackerOptions = {}) {
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
      const tracker = getFaceTracker();

      // Register callbacks before initialization
      const callbacks: FaceTrackerCallbacks = {
        onSpeakingStart: () => {
          store.triggerSpeakingStart();
        },
        onSpeakingEnd: () => {
          store.triggerSpeakingEnd();
        },
        onMouthOpennessChange: (openness) => {
          store.setMouthOpenness(openness);
        },
        onFaceDetected: () => {
          // Can add face detection state if needed
        },
        onLandmarksUpdate: () => {
          // Face landmarks for visualization
        },
      };

      tracker.registerCallbacks(callbacks);

      const success = await tracker.initialize();

      if (!success) {
        throw new Error("Failed to initialize face tracker");
      }

      isInitializedRef.current = true;
      setIsReady(true);
      onReady?.();
    } catch (error) {
      console.error("[useFaceTracker] Initialization error:", error);
      onError?.(error as Error);
    }
  }, [enabled, onReady, onError, store]);

  // Process video frame
  const processFrame = useCallback(() => {
    if (!videoRef.current || !isRunningRef.current) return;

    const tracker = getFaceTracker();
    tracker.processVideoFrame(videoRef.current);

    animationRef.current = requestAnimationFrame(processFrame);
  }, []);

  // Start processing
  const start = useCallback(
    (video: HTMLVideoElement) => {
      if (!isInitializedRef.current) {
        console.warn("[useFaceTracker] Not initialized yet");
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
