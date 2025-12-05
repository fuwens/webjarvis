import { useEffect, useRef, useState, useCallback } from "react";
import { useHandTracker } from "../hooks/useHandTracker";
import { useFaceTracker } from "../hooks/useFaceTracker";
import { useJarvisStore } from "../stores/useJarvisStore";
import { getHandTracker } from "../modules/mediapipe/handTracker";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

// Hand connections for drawing skeleton
const HAND_CONNECTIONS = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4], // Thumb
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8], // Index
  [0, 9],
  [9, 10],
  [10, 11],
  [11, 12], // Middle
  [0, 13],
  [13, 14],
  [14, 15],
  [15, 16], // Ring
  [0, 17],
  [17, 18],
  [18, 19],
  [19, 20], // Pinky
  [5, 9],
  [9, 13],
  [13, 17], // Palm
];

export function CameraFeed() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [landmarks, setLandmarks] = useState<NormalizedLandmark[][]>([]);
  const [initStatus, setInitStatus] = useState("");

  const {
    setCameraReady,
    setLoading,
    isLeftHandDetected,
    isRightHandDetected,
    isSpeaking,
  } = useJarvisStore();

  // Initialize trackers
  const handTracker = useHandTracker({
    onReady: () => {
      console.log("[CameraFeed] Hand tracker ready");
      setInitStatus((prev) => prev + " | Hand ✓");
    },
    onError: (err) => console.error("[CameraFeed] Hand tracker error:", err),
  });

  const faceTracker = useFaceTracker({
    onReady: () => {
      console.log("[CameraFeed] Face tracker ready");
      setInitStatus((prev) => prev + " | Face ✓");
    },
    onError: (err) => console.error("[CameraFeed] Face tracker error:", err),
  });

  // Start camera
  const startCamera = useCallback(async () => {
    setInitStatus("Starting camera...");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: "user",
        },
        audio: false,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();

        setIsLoading(false);
        setLoading(false);
        setCameraReady(true);
        setInitStatus("Camera ready");

        console.log("[CameraFeed] Camera started");
      }
    } catch (err) {
      console.error("[CameraFeed] Camera error:", err);
      setError("无法访问摄像头。请确保已授予摄像头权限。");
      setIsLoading(false);
      setLoading(false);
    }
  }, [setCameraReady, setLoading]);

  // Start trackers when both camera and trackers are ready
  useEffect(() => {
    if (!videoRef.current || isLoading) return;
    if (!handTracker.isReady || !faceTracker.isReady) return;

    console.log("[CameraFeed] Starting trackers...");

    // Register landmark callback for visualization
    const tracker = getHandTracker();
    tracker.registerCallbacks({
      onLandmarksUpdate: (lm) => setLandmarks(lm),
    });

    handTracker.start(videoRef.current);
    faceTracker.start(videoRef.current);

    setInitStatus("All systems ready!");
  }, [
    handTracker.isReady,
    faceTracker.isReady,
    isLoading,
    handTracker,
    faceTracker,
  ]);

  // Draw landmarks on canvas
  useEffect(() => {
    if (!canvasRef.current || !videoRef.current || landmarks.length === 0)
      return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Match canvas size to video
    canvas.width = videoRef.current.videoWidth || 640;
    canvas.height = videoRef.current.videoHeight || 480;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw each hand
    landmarks.forEach((handLandmarks) => {
      // Draw connections
      ctx.strokeStyle = "var(--hud-primary, #00d4ff)";
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.6;

      HAND_CONNECTIONS.forEach(([start, end]) => {
        const startPoint = handLandmarks[start];
        const endPoint = handLandmarks[end];

        ctx.beginPath();
        ctx.moveTo(startPoint.x * canvas.width, startPoint.y * canvas.height);
        ctx.lineTo(endPoint.x * canvas.width, endPoint.y * canvas.height);
        ctx.stroke();
      });

      // Draw landmarks
      ctx.globalAlpha = 1;
      handLandmarks.forEach((landmark, index) => {
        const x = landmark.x * canvas.width;
        const y = landmark.y * canvas.height;

        // Special colors for fingertips
        const isFingerTip = [4, 8, 12, 16, 20].includes(index);

        ctx.beginPath();
        ctx.arc(x, y, isFingerTip ? 6 : 4, 0, Math.PI * 2);
        ctx.fillStyle = isFingerTip ? "#66e5ff" : "#00d4ff";
        ctx.fill();

        // Glow effect for fingertips
        if (isFingerTip) {
          ctx.beginPath();
          ctx.arc(x, y, 10, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(0, 212, 255, 0.3)";
          ctx.fill();
        }
      });
    });
  }, [landmarks]);

  // Initialize camera on mount
  useEffect(() => {
    startCamera();

    return () => {
      // Cleanup camera stream
      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [startCamera]);

  return (
    <div className="camera-container">
      {/* Status indicators */}
      <div className="absolute top-2 left-2 z-10 flex flex-col gap-1">
        <div className="status-indicator">
          <div
            className={`status-dot ${
              isLeftHandDetected || isRightHandDetected ? "active" : ""
            }`}
          />
          <span className="text-[10px]">手势</span>
        </div>
        <div className="status-indicator">
          <div className={`status-dot ${isSpeaking ? "active" : ""}`} />
          <span className="text-[10px]">语音</span>
        </div>
      </div>

      {/* Video element */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-cover"
      />

      {/* Landmark overlay canvas */}
      <canvas
        ref={canvasRef}
        className="absolute top-0 left-0 w-full h-full pointer-events-none"
        style={{ transform: "scaleX(-1)" }}
      />

      {/* Loading state */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80">
          <div className="flex flex-col items-center gap-3">
            <div className="loading-spinner" />
            <span className="text-xs text-[var(--hud-text)]">
              初始化系统...
            </span>
            <span className="text-[10px] text-[var(--hud-text)] opacity-60">
              {initStatus}
            </span>
          </div>
        </div>
      )}

      {/* Init status overlay */}
      {!isLoading && (!handTracker.isReady || !faceTracker.isReady) && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
          <div className="flex flex-col items-center gap-2">
            <div className="loading-spinner w-8 h-8" />
            <span className="text-[10px] text-[var(--hud-text)]">
              加载 AI 模型...
            </span>
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/90 p-4">
          <div className="text-center">
            <div className="text-[var(--hud-primary)] text-2xl mb-2">⚠</div>
            <p className="text-xs text-red-400">{error}</p>
            <button
              onClick={startCamera}
              className="mt-3 px-3 py-1 text-xs border border-[var(--hud-border)] hover:bg-[var(--hud-glow)] transition-colors"
            >
              重试
            </button>
          </div>
        </div>
      )}

      {/* Camera frame decoration */}
      <div className="absolute inset-0 pointer-events-none border border-[var(--hud-border)] rounded-lg">
        <div
          className="corner-decoration top-left"
          style={{ top: 0, left: 0, width: 15, height: 15 }}
        />
        <div
          className="corner-decoration top-right"
          style={{ top: 0, right: 0, width: 15, height: 15 }}
        />
        <div
          className="corner-decoration bottom-left"
          style={{ bottom: 0, left: 0, width: 15, height: 15 }}
        />
        <div
          className="corner-decoration bottom-right"
          style={{ bottom: 0, right: 0, width: 15, height: 15 }}
        />
      </div>
    </div>
  );
}
