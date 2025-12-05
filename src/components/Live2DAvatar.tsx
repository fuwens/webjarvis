import { useEffect, useRef, useState, useCallback } from "react";
import {
  getLive2DController,
  getGestureMapper,
  getLipSyncController,
  getExpressionMapper,
  AVAILABLE_MODELS,
} from "../modules/live2d";
import { useJarvisStore } from "../stores/useJarvisStore";

// ========================
// Props
// ========================

interface Live2DAvatarProps {
  modelKey?: keyof typeof AVAILABLE_MODELS | string;
  scale?: number;
  position?: { x: number; y: number };
  onReady?: () => void;
  onError?: (error: Error) => void;
}

// ========================
// Component
// ========================

export function Live2DAvatar({
  modelKey = "haru",
  scale = 0.08,
  position = { x: 0.5, y: 0.9 },
  onReady,
  onError,
}: Live2DAvatarProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const initializedRef = useRef(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  // Initialize Live2D
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Prevent double initialization
    if (initializedRef.current) return;
    initializedRef.current = true;

    const init = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Get or create controller instance
        const controller = getLive2DController({
          scale,
          position,
        });

        const initSuccess = await controller.initialize(canvas);

        if (!initSuccess) {
          throw new Error("Failed to initialize Live2D controller");
        }

        // Get model URL
        const modelUrl =
          AVAILABLE_MODELS[modelKey as keyof typeof AVAILABLE_MODELS] ||
          modelKey;

        // Load model
        const loadSuccess = await controller.loadModel(modelUrl);

        if (!loadSuccess) {
          throw new Error("Failed to load Live2D model");
        }

        setIsLoading(false);
        setIsReady(true);
        onReady?.();

        console.log("[Live2DAvatar] Ready");
      } catch (err) {
        console.error("[Live2DAvatar] Initialization error:", err);
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error occurred";
        setError(errorMessage);
        setIsLoading(false);
        onError?.(err instanceof Error ? err : new Error(errorMessage));
      }
    };

    init();

    // No cleanup - let the singleton handle its own lifecycle
  }, []);

  // Connect to store events
  useEffect(() => {
    if (!isReady) return;

    const gestureMapper = getGestureMapper();
    const lipSyncController = getLipSyncController();
    const expressionMapper = getExpressionMapper();

    // Subscribe to store changes
    const unsubscribe = useJarvisStore.subscribe((state, prevState) => {
      // Hand detection changed
      if (
        state.isLeftHandDetected !== prevState.isLeftHandDetected ||
        state.isRightHandDetected !== prevState.isRightHandDetected
      ) {
        gestureMapper.onHandDetected(
          state.isLeftHandDetected,
          state.isRightHandDetected
        );
      }

      // Gesture changed
      if (state.currentGesture !== prevState.currentGesture) {
        gestureMapper.onGestureChange(state.currentGesture);
      }

      // Hand position update (for focus tracking)
      if (state.rightHandPosition !== prevState.rightHandPosition) {
        if (state.rightHandPosition) {
          gestureMapper.onHandPositionUpdate(state.rightHandPosition);
        }
      } else if (state.leftHandPosition !== prevState.leftHandPosition) {
        if (state.leftHandPosition) {
          gestureMapper.onHandPositionUpdate(state.leftHandPosition);
        }
      }

      // Pointer position (from click)
      if (state.pointerPosition !== prevState.pointerPosition) {
        gestureMapper.onAirClick(
          state.pointerPosition.x,
          state.pointerPosition.y
        );
      }

      // Drag delta
      if (state.dragDelta !== prevState.dragDelta) {
        gestureMapper.onAirDrag(state.dragDelta.dx, state.dragDelta.dy);
      }

      // Pinch scale
      if (state.pinchScale !== prevState.pinchScale) {
        gestureMapper.onPinchZoom(state.pinchScale);
      }

      // Speaking state
      if (state.isSpeaking !== prevState.isSpeaking) {
        if (state.isSpeaking) {
          lipSyncController.onSpeakingStart();
        } else {
          lipSyncController.onSpeakingEnd();
        }
      }

      // Mouth openness (legacy - for LipSyncController)
      if (state.mouthOpenness !== prevState.mouthOpenness) {
        lipSyncController.onMouthOpennessUpdate(state.mouthOpenness);
      }

      // Face expression update - drives Live2D with full face tracking
      if (state.faceExpression !== prevState.faceExpression) {
        if (state.faceExpression) {
          expressionMapper.updateFromFaceData(state.faceExpression);
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [isReady]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      const controller = getLive2DController();
      controller.resize();
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Retry function
  const retry = useCallback(() => {
    window.location.reload();
  }, []);

  return (
    <div
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 50 }} // Above Three.js (z-0), below HUD (z-100)
    >
      {/* React-managed canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
      />

      {/* Loading overlay - only show if loading AND not ready */}
      {isLoading && !isReady && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="loading-spinner" />
            <span className="text-xs text-[var(--hud-text)] opacity-70">
              加载 Live2D 模型...
            </span>
          </div>
        </div>
      )}

      {/* Error overlay */}
      {error && (
        <div className="absolute bottom-40 left-1/2 -translate-x-1/2 p-4 bg-[var(--hud-bg)] border border-red-500/50 rounded-lg">
          <div className="text-center">
            <p className="text-xs text-red-400">Live2D 加载失败</p>
            <p className="text-[10px] text-red-400/70 mt-1">{error}</p>
            <button
              onClick={retry}
              className="mt-2 px-3 py-1 text-[10px] border border-[var(--hud-border)] hover:bg-[var(--hud-glow)] transition-colors pointer-events-auto"
            >
              重试
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
