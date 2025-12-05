import { useEffect } from "react";
import { JarvisScene } from "./components/JarvisScene";
import { HudOverlay } from "./components/HudOverlay";
import { SideMenu } from "./components/SideMenu";
import { CameraFeed } from "./components/CameraFeed";
import { useJarvisStore } from "./stores/useJarvisStore";
import { getInteractionController } from "./modules/threejs/interactionController";

function App() {
  const { registerCallbacks, isLoading } = useJarvisStore();

  // Register interaction controller callbacks
  useEffect(() => {
    const controller = getInteractionController();

    registerCallbacks({
      onAirClick: (x, y) => {
        controller.handleAirClick(x, y);
      },
      onAirDrag: (dx, dy) => {
        controller.handleAirDrag(dx, dy);
      },
      onPinchZoom: (scale) => {
        controller.handlePinchZoom(scale);
      },
      onGestureChange: (gesture) => {
        controller.handleGestureChange(gesture);
      },
      onSpeakingStart: () => {
        controller.handleSpeakingStart();
      },
      onSpeakingEnd: () => {
        controller.handleSpeakingEnd();
      },
      onHandDetected: () => {
        // Hand detection handled in store
      },
    });

    return () => {
      controller.dispose();
    };
  }, [registerCallbacks]);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[#000810]">
      {/* Three.js particle scene (background) */}
      <JarvisScene />

      {/* HUD overlay */}
      <HudOverlay />

      {/* Side menu */}
      <SideMenu />

      {/* Camera feed (bottom-left corner) */}
      <CameraFeed />

      {/* Global loading overlay */}
      {isLoading && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-[#000810]">
          <div className="flex flex-col items-center gap-4">
            <div className="loading-spinner w-16 h-16" />
            <div className="text-[var(--hud-primary)] text-lg tracking-widest animate-pulse">
              JARVIS 初始化中...
            </div>
            <div className="text-[var(--hud-text)] text-xs opacity-60">
              正在加载 AI 模型和摄像头
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
