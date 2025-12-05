import { useJarvisStore, type ThemeType } from "../stores/useJarvisStore";

interface MenuItem {
  id: string;
  label: string;
  icon: string;
  action?: () => void;
}

export function SideMenu() {
  const {
    isMenuOpen,
    setMenuOpen,
    selectedMenuItem,
    selectMenuItem,
    theme,
    setTheme,
  } = useJarvisStore();

  const menuItems: MenuItem[] = [
    { id: "theme-blue", label: "Jarvis 蓝", icon: "🔵" },
    { id: "theme-purple", label: "霓虹紫", icon: "🟣" },
    { id: "theme-green", label: "全息绿", icon: "🟢" },
    { id: "separator", label: "", icon: "" },
    { id: "reset", label: "重置视图", icon: "↺" },
    { id: "fullscreen", label: "全屏模式", icon: "⛶" },
    { id: "help", label: "使用帮助", icon: "?" },
  ];

  const handleItemClick = (item: MenuItem, index: number) => {
    selectMenuItem(index);

    switch (item.id) {
      case "theme-blue":
        setTheme("jarvis-blue");
        break;
      case "theme-purple":
        setTheme("neon-purple");
        break;
      case "theme-green":
        setTheme("holo-green");
        break;
      case "reset":
        // Reset scale and position
        useJarvisStore.getState().setPinchScale(1);
        break;
      case "fullscreen":
        toggleFullscreen();
        break;
      case "help":
        // Could open a help modal
        console.log("Help requested");
        break;
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  const getThemeId = (t: ThemeType): string => {
    switch (t) {
      case "jarvis-blue":
        return "theme-blue";
      case "neon-purple":
        return "theme-purple";
      case "holo-green":
        return "theme-green";
    }
  };

  return (
    <>
      {/* Menu toggle button (visible on edge) */}
      <button
        onClick={() => setMenuOpen(!isMenuOpen)}
        className={`
          fixed right-0 top-1/2 -translate-y-1/2 z-[201]
          w-8 h-24 flex items-center justify-center
          bg-[var(--hud-bg)] border border-r-0 border-[var(--hud-border)]
          rounded-l-lg cursor-pointer transition-all duration-300
          hover:w-10 hover:bg-[var(--hud-glow)]
          ${isMenuOpen ? "translate-x-[300px]" : ""}
        `}
        aria-label={isMenuOpen ? "关闭菜单" : "打开菜单"}
      >
        <span
          className="text-[var(--hud-primary)] text-lg transition-transform duration-300"
          style={{ transform: isMenuOpen ? "rotate(180deg)" : "rotate(0deg)" }}
        >
          ◀
        </span>
      </button>

      {/* Side menu panel */}
      <div className={`side-menu ${isMenuOpen ? "open" : ""}`}>
        {/* Menu header */}
        <div className="p-4 border-b border-[var(--hud-border)]">
          <h2 className="text-lg tracking-widest text-[var(--hud-primary)]">
            JARVIS
          </h2>
          <p className="text-[10px] opacity-60 mt-1">系统控制面板</p>
        </div>

        {/* Menu items */}
        <div className="py-2">
          {menuItems.map((item, index) => {
            if (item.id === "separator") {
              return (
                <div
                  key={index}
                  className="my-2 mx-4 h-px bg-[var(--hud-border)]"
                />
              );
            }

            const isThemeItem = item.id.startsWith("theme-");
            const isActiveTheme = isThemeItem && getThemeId(theme) === item.id;
            const isSelected = selectedMenuItem === index;

            return (
              <div
                key={item.id}
                onClick={() => handleItemClick(item, index)}
                className={`
                  menu-item
                  ${isSelected ? "active" : ""}
                  ${
                    isActiveTheme
                      ? "border-l-2 border-l-[var(--hud-primary)]"
                      : ""
                  }
                `}
              >
                <span className="text-lg">{item.icon}</span>
                <span className="text-sm">{item.label}</span>
                {isActiveTheme && (
                  <span className="ml-auto text-[var(--hud-primary)]">✓</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Menu footer */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-[var(--hud-border)]">
          <div className="text-[10px] opacity-40 text-center">
            <p>手势控制: 右滑打开 / 左滑关闭</p>
            <p className="mt-1">v1.0.0 | Web Jarvis</p>
          </div>
        </div>
      </div>

      {/* Backdrop */}
      {isMenuOpen && (
        <div
          className="fixed inset-0 z-[199] bg-black/30 backdrop-blur-sm"
          onClick={() => setMenuOpen(false)}
        />
      )}
    </>
  );
}
