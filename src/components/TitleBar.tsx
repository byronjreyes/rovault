import { useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { cn } from "@/lib/utils";

export function TitleBar({
  title,
  className,
  children,
}: {
  title?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const [hovered, setHovered] = useState(false);

  const handleAction = async (action: "close" | "minimize" | "maximize") => {
    try {
      const appWindow = getCurrentWindow();
      if (action === "close") await appWindow.close();
      if (action === "minimize") await appWindow.minimize();
      if (action === "maximize") await appWindow.toggleMaximize();
    } catch {
      // Fallback in browser dev mode
    }
  };

  const handleMouseDown = async (e: React.MouseEvent) => {
    // Ignore if clicking buttons, inputs, or interactive controls
    if ((e.target as HTMLElement).closest("button, input, a, select, [role='button']")) return;

    if (e.detail === 2) {
      // Double click cleanly toggles maximize without starting a drag snap
      try {
        const appWindow = getCurrentWindow();
        await appWindow.toggleMaximize();
      } catch {}
      return;
    }

    if (e.detail === 1 && e.buttons === 1) {
      // Single left-click initiates window drag
      try {
        const appWindow = getCurrentWindow();
        await appWindow.startDragging();
      } catch {}
    }
  };

  return (
    <div
      onMouseDown={handleMouseDown}
      className={cn(
        "h-9 w-full select-none flex items-center justify-between px-3 border-b border-border/50 bg-background/95 backdrop-blur-md z-50 shrink-0 cursor-default",
        className
      )}
    >
      {/* Apple Traffic Lights (Close / Minimize / Maximize) */}
      <div
        className="flex items-center gap-2 pl-1 py-1 z-10"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Red: Close */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleAction("close");
          }}
          title="Close window"
          className="flex h-3 w-3 items-center justify-center rounded-full bg-[#ff5f56] border border-[#e0443e] text-[#4d0000] shadow-xs transition-transform active:scale-90"
        >
          {hovered && (
            <svg viewBox="0 0 6 6" className="h-1.5 w-1.5 fill-current">
              <path d="M0.5 0.5L5.5 5.5M5.5 0.5L0.5 5.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          )}
        </button>

        {/* Yellow / Amber: Minimize */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleAction("minimize");
          }}
          title="Minimize window"
          className="flex h-3 w-3 items-center justify-center rounded-full bg-[#ffbd2e] border border-[#dea123] text-[#5c3c00] shadow-xs transition-transform active:scale-90"
        >
          {hovered && (
            <svg viewBox="0 0 6 6" className="h-1.5 w-1.5 fill-current">
              <path d="M0.5 3H5.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          )}
        </button>

        {/* Green: Maximize / Fullscreen */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleAction("maximize");
          }}
          title="Toggle maximize"
          className="flex h-3 w-3 items-center justify-center rounded-full bg-[#27c93f] border border-[#1aab29] text-[#004d11] shadow-xs transition-transform active:scale-90"
        >
          {hovered && (
            <svg viewBox="0 0 6 6" className="h-1.5 w-1.5 fill-current">
              <path d="M0.5 1.5L2.5 0.5M5.5 4.5L3.5 5.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          )}
        </button>
      </div>

      {/* Middle Title / Draggable Canvas */}
      <div className="flex-1 h-full flex items-center justify-center text-xs font-semibold text-muted-foreground/70 tracking-tight">
        {title && <span>{title}</span>}
      </div>

      {/* Right Children */}
      <div className="flex items-center gap-2 pr-1 z-10">
        {children}
      </div>
    </div>
  );
}
