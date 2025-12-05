import { useJarvisStore } from "../stores/useJarvisStore";

export function HudOverlay() {
  const {
    isSpeaking,
    currentGesture,
    isLeftHandDetected,
    isRightHandDetected,
    pointerPosition,
    theme,
  } = useJarvisStore();

  const hasHand = isLeftHandDetected || isRightHandDetected;

  return (
    <div className="hud-container">
      {/* Corner decorations */}
      <div className="corner-decoration top-left" />
      <div className="corner-decoration top-right" />
      <div className="corner-decoration bottom-left" />
      <div className="corner-decoration bottom-right" />

      {/* Scan line effect */}
      <div className="scan-line" />

      {/* Top status bar */}
      <div
        className={`hud-element top-5 left-1/2 -translate-x-1/2 px-6 py-2 rounded-full ${
          isSpeaking ? "hud-speaking hud-glow" : ""
        }`}
      >
        <div className="flex items-center gap-4 text-xs tracking-widest uppercase">
          <div className="status-indicator">
            <div className={`status-dot ${hasHand ? "active" : ""}`} />
            <span>手势追踪</span>
          </div>
          <div className="w-px h-4 bg-[var(--hud-border)]" />
          <div className="status-indicator">
            <div className={`status-dot ${isSpeaking ? "active" : ""}`} />
            <span>语音检测</span>
          </div>
        </div>
      </div>

      {/* Current gesture display */}
      {currentGesture !== "idle" && (
        <div className="hud-element top-20 left-1/2 -translate-x-1/2 px-4 py-1 text-xs tracking-wider">
          当前手势:{" "}
          <span className="text-[var(--hud-accent)] font-bold">
            {getGestureLabel(currentGesture)}
          </span>
        </div>
      )}

      {/* Crosshair - follows pointer when hand is detected */}
      {hasHand && (
        <div
          className="crosshair hud-glow"
          style={{
            left: pointerPosition.x || "50%",
            top: pointerPosition.y || "50%",
          }}
        />
      )}

      {/* Left side info panel */}
      <div className="hud-element left-5 top-1/2 -translate-y-1/2 w-48 p-4 rounded-lg">
        <div className="text-xs tracking-wider mb-3 border-b border-[var(--hud-border)] pb-2">
          系统状态
        </div>
        <div className="space-y-2 text-[10px]">
          <div className="flex justify-between">
            <span className="opacity-60">主题模式</span>
            <span className="text-[var(--hud-accent)]">
              {getThemeLabel(theme)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="opacity-60">手部检测</span>
            <span className={hasHand ? "text-green-400" : "text-red-400"}>
              {hasHand ? "已连接" : "未检测"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="opacity-60">语音状态</span>
            <span className={isSpeaking ? "text-green-400" : "opacity-60"}>
              {isSpeaking ? "正在说话" : "静音"}
            </span>
          </div>
        </div>
      </div>

      {/* Bottom info bar */}
      <div className="hud-element bottom-5 left-1/2 -translate-x-1/2 px-6 py-2 rounded-full">
        <div className="flex items-center gap-6 text-[10px] tracking-wider opacity-80">
          <span>捏合缩放</span>
          <span className="w-px h-3 bg-[var(--hud-border)]" />
          <span>拖拽移动</span>
          <span className="w-px h-3 bg-[var(--hud-border)]" />
          <span>左右滑动菜单</span>
          <span className="w-px h-3 bg-[var(--hud-border)]" />
          <span>点击交互</span>
        </div>
      </div>

      {/* Speaking indicator animation */}
      {isSpeaking && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 flex items-center gap-1">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="w-1 bg-[var(--hud-primary)] rounded-full"
              style={{
                height: `${10 + Math.random() * 20}px`,
                animation: `speaking-pulse 0.3s ease-in-out infinite`,
                animationDelay: `${i * 0.1}s`,
              }}
            />
          ))}
        </div>
      )}

      {/* Decorative elements */}
      <svg
        className="absolute top-5 right-5 w-16 h-16 opacity-30"
        viewBox="0 0 100 100"
      >
        <circle
          cx="50"
          cy="50"
          r="45"
          fill="none"
          stroke="var(--hud-primary)"
          strokeWidth="1"
          strokeDasharray="10 5"
          className="animate-spin"
          style={{ animationDuration: "20s" }}
        />
        <circle
          cx="50"
          cy="50"
          r="35"
          fill="none"
          stroke="var(--hud-primary)"
          strokeWidth="1"
          strokeDasharray="5 10"
          className="animate-spin"
          style={{ animationDuration: "15s", animationDirection: "reverse" }}
        />
      </svg>

      <svg
        className="absolute bottom-5 left-5 w-12 h-12 opacity-30 hidden md:block"
        viewBox="0 0 100 100"
      >
        <polygon
          points="50,10 90,90 10,90"
          fill="none"
          stroke="var(--hud-primary)"
          strokeWidth="2"
        />
      </svg>
    </div>
  );
}

// Helper functions
function getGestureLabel(gesture: string): string {
  const labels: Record<string, string> = {
    idle: "空闲",
    pinch: "捏合",
    drag: "拖拽",
    click: "点击",
    swipe_left: "左滑",
    swipe_right: "右滑",
    point: "指向",
    open_palm: "张开手掌",
  };
  return labels[gesture] || gesture;
}

function getThemeLabel(theme: string): string {
  const labels: Record<string, string> = {
    "jarvis-blue": "Jarvis 蓝",
    "neon-purple": "霓虹紫",
    "holo-green": "全息绿",
  };
  return labels[theme] || theme;
}
