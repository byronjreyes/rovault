# Universal Bento & Linear Dashboard Design System Specification

> **Version:** 2.0.0 (Universal Master Standard)  
> **Philosophy:** Minimalist, high-density, tactile, and zero-distraction. Built on Linear + Shadcn aesthetics with Bento Box grid architecture, unified scroll mathematics, boxy geometric precision, and WCAG-compliant dual-theme contrast.
> **Target Applicability:** Any modern web or desktop application (SaaS, FinTech, DevTools, Cloud Infrastructure, CRM, Admin Panels, Consumer Apps).

---

## 1. Design Philosophy & Visual Tenets

1. **Monochrome First, Purposeful Accents:**  
   Base UI relies strictly on deep obsidian blacks (`#000000` / `#09090b`), slate greys, and crisp whites. Colors are strictly functional:
   - **Amber / Gold:** Starred / favorites / high-priority items (`#f59e0b`).
   - **Emerald / Green:** Encrypted / active / operational health / success states (`#10b981`).
   - **Rose / Red:** Security alerts / critical warnings / destructive deletions (`#ef4444`).
   - **Brand Monograms & Vectors:** High-visibility provider logos and crisp vector badges.

2. **Zero "AI Slop" & Emoji Clutter:**  
   Never use decorative emojis (e.g., ✨, 🚀, 💡). Replace with crisp, consistent 14–16px vector icons (`lucide-react`) with exact stroke weights (`1.5px` to `2px`).

3. **Boxy Geometry Over Oval Bubbles:**  
   Avoid exaggerated pill shapes. Modern software interfaces rely on crisp, sleek box geometry:
   - **Outer Bento Cards:** `rounded-xl border border-border/80 bg-card`.
   - **Inner Inset Slots (Fields/Metrics):** `rounded-lg border border-border/70 bg-muted/40`.
   - **Action Buttons & Chips:** `rounded-md` or `rounded-lg`.
   - **Brand / Service Icons:** `rounded-lg` (crisp box with centered vector).

4. **Snappy Micro-interactions:**  
   All transitions are sub-180ms cubic-bezier (`150ms ease-out` / `160ms cubic-bezier(0.16, 1, 0.3, 1)`). Dialogs pop with subtle scale (`0.97` to `1.0`), eliminating sluggish slide sheets.

---

## 2. Layout Structure & Unified Scroll Mathematics

### The Golden Alignment Rule (Single-Canvas Architecture)
When placing summary KPI cards above an item grid, **never put the KPI cards in a static header while the items sit in a separate scroll container**. Doing so causes the right scrollbar gutter to offset the bottom cards, breaking vertical alignment with the top widgets.

**Solution:** Place BOTH the Top Summary Bento Cards and the Main Grid inside the **exact same parent scroll container**:

```tsx
<main className="flex flex-1 flex-col overflow-hidden">
  {/* Top Navigation Header */}
  <header className="h-14 border-b border-border/50 px-4 flex items-center justify-between">...</header>

  {/* UNIFIED SCROLL CONTAINER: Top widgets + Grid share exact width & gutter math */}
  <div className="flex-1 overflow-y-auto p-5 pr-4 space-y-4">
    {/* 1. Top Summary Bento Cards (3-column grid) */}
    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
      {/* Widget 1, Widget 2, Widget 3 */}
    </div>

    {/* 2. Notification / Alert Banners (if active) */}
    {hasAlert && <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3.5 ...">...</div>}

    {/* 3. Main Bento Items Grid (Matching columns) */}
    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 pb-4">
      {items.map((item) => (
        <Card key={item.id} className="min-h-[220px] flex flex-col justify-between" />
      ))}
    </div>
  </div>
</main>
```

---

## 3. Desktop Shell & Apple-Style Frameless TitleBar

For desktop applications (Tauri, Electron, Neutralino), disable native OS window decorations (`"decorations": false`) and render a custom **macOS-Style Traffic Light TitleBar**:

```
+-------------------------------------------------------------------------------+
| (●) (●) (●)               [App Title] — [Active Workspace / View]             |
+-------------------------------------------------------------------------------+
```

### Apple Traffic Light Specs:
- 🔴 **Close Window (`#ff5f56`, border `#e0443e`):** Closes window on click.
- 🟡 **Minimize Window (`#ffbd2e`, border `#dea123`):** Minimizes window on click.
- 🟢 **Maximize Window (`#27c93f`, border `#1aab29`):** Toggles maximize/fullscreen on click.
- **Hover Glyph FX:** Hovering over the traffic light group reveals tactile vector symbols (`✕`, `−`, `+`).

### Drag vs Double-Click Race Condition Fix:
```tsx
import { useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { cn } from "@/lib/utils";

export function TitleBar({ title, className, children }: { title?: string; className?: string; children?: React.ReactNode }) {
  const [hovered, setHovered] = useState(false);

  const handleAction = async (action: "close" | "minimize" | "maximize") => {
    try {
      const appWindow = getCurrentWindow();
      if (action === "close") await appWindow.close();
      if (action === "minimize") await appWindow.minimize();
      if (action === "maximize") await appWindow.toggleMaximize();
    } catch {}
  };

  const handleMouseDown = async (e: React.MouseEvent) => {
    // Ignore interactive elements
    if ((e.target as HTMLElement).closest("button, input, a, select, [role='button']")) return;

    if (e.detail === 2) {
      // Double-click cleanly toggles maximize without initiating a drag lock
      try {
        const appWindow = getCurrentWindow();
        await appWindow.toggleMaximize();
      } catch {}
      return;
    }

    if (e.detail === 1 && e.buttons === 1) {
      // Single left-click initiates native window drag
      try {
        const appWindow = getCurrentWindow();
        await appWindow.startDragging();
      } catch {}
    }
  };

  return (
    <div
      onMouseDown={handleMouseDown}
      className={cn("h-9 w-full select-none flex items-center justify-between px-3 border-b border-border/50 bg-background/95 backdrop-blur-md z-50 shrink-0 cursor-default", className)}
    >
      {/* Apple Traffic Lights */}
      <div className="flex items-center gap-2 pl-1 py-1 z-10" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
        <button onClick={(e) => { e.stopPropagation(); handleAction("close"); }} className="flex h-3 w-3 items-center justify-center rounded-full bg-[#ff5f56] border border-[#e0443e] text-[#4d0000]">
          {hovered && <span className="text-[8px] font-black">✕</span>}
        </button>
        <button onClick={(e) => { e.stopPropagation(); handleAction("minimize"); }} className="flex h-3 w-3 items-center justify-center rounded-full bg-[#ffbd2e] border border-[#dea123] text-[#5c3c00]">
          {hovered && <span className="text-[8px] font-black">−</span>}
        </button>
        <button onClick={(e) => { e.stopPropagation(); handleAction("maximize"); }} className="flex h-3 w-3 items-center justify-center rounded-full bg-[#27c93f] border border-[#1aab29] text-[#004d11]">
          {hovered && <span className="text-[8px] font-black">+</span>}
        </button>
      </div>

      {/* Middle Draggable Title */}
      <div className="flex-1 h-full flex items-center justify-center text-xs font-semibold text-muted-foreground/70">
        {title && <span>{title}</span>}
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-2 pr-1 z-10">{children}</div>
    </div>
  );
}
```

---

## 4. Theme & Contrast Engine (Light & Dark)

### Strict Contrast Rules (Avoiding False Hovers)
- **Do not apply global `button { background: ... }` styles in CSS.** All buttons must default to `bg-transparent` so idle navigation items remain clean and flush with the canvas.
- **Dark Mode Active State:** `bg-[#1f1f23] text-white font-medium shadow-sm`.
- **Dark Mode Idle State:** `bg-transparent text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.04]`.
- **Light Mode Active State:** `bg-slate-200/90 text-slate-950 font-semibold shadow-xs`.
- **Light Mode Idle State:** `bg-transparent text-slate-700 hover:text-slate-950 hover:bg-slate-100`.

### CSS Variables Template (`src/index.css`)
```css
:root {
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --card: 0 0% 100%;
  --card-foreground: 222.2 84% 4.9%;
  --primary: 222.2 47.4% 11.2%;
  --primary-foreground: 210 40% 98%;
  --muted: 210 40% 96.1%;
  --muted-foreground: 215.4 16.3% 46.9%;
  --border: 214.3 31.8% 91.4%;
  --radius: 0.75rem;
}

.dark {
  --background: 0 0% 0%;         /* Pure Obsidian Dark */
  --foreground: 210 40% 98%;
  --card: 240 6% 7%;            /* Linear Dark Card #111113 */
  --card-foreground: 210 40% 98%;
  --primary: 210 40% 98%;
  --primary-foreground: 222.2 47.4% 11.2%;
  --muted: 240 4% 14%;
  --muted-foreground: 240 5% 65%;
  --border: 240 4% 16%;
}
```

---

## 5. Universal Component Blueprints & Patterns

### 1. Collapsible Sidebar Navigation (`SidebarNav` & `SidebarItem`)
Provides high-density navigation with zero distraction, badge counters, and seamless collapse states:

```tsx
export function SidebarItem({
  icon: Icon,
  label,
  count,
  active,
  badgeVariant = "default",
  collapsed,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count?: number;
  active?: boolean;
  badgeVariant?: "default" | "warning" | "danger" | "success";
  collapsed?: boolean;
  onClick: () => void;
}) {
  const badgeColors = {
    default: "text-muted-foreground",
    warning: "text-amber-500 font-bold",
    danger: "text-rose-500 font-bold",
    success: "text-emerald-500 font-bold",
  };

  return (
    <button
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={cn(
        "flex items-center rounded-lg text-xs font-medium transition-all duration-150 active:scale-[0.99]",
        collapsed ? "h-9 w-9 justify-center p-0 mx-auto" : "w-full gap-2.5 px-2.5 py-2",
        active
          ? "bg-slate-200/90 text-slate-950 font-semibold shadow-xs dark:bg-[#1f1f23] dark:text-white"
          : "bg-transparent text-slate-700 hover:text-slate-950 hover:bg-slate-100 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-white/[0.04]"
      )}
    >
      <Icon className={cn("h-4 w-4 shrink-0 transition-colors", active ? "text-slate-950 dark:text-white" : "text-slate-500 dark:text-zinc-400")} />
      {!collapsed && <span className="flex-1 text-left truncate tracking-tight">{label}</span>}
      {!collapsed && count !== undefined && count > 0 && (
        <span className={cn("text-[11px]", badgeColors[badgeVariant])}>
          {count}
        </span>
      )}
    </button>
  );
}
```

---

### 2. Top Application Header (`TopHeader` & Global Search)
Compact action bar with sidebar collapse trigger, debounced search, and primary CTA:

```tsx
export function TopHeader({
  title,
  search,
  onSearchChange,
  onCollapseToggle,
  onPrimaryAction,
  primaryActionLabel = "Create New",
}: {
  title?: string;
  search: string;
  onSearchChange: (value: string) => void;
  onCollapseToggle: () => void;
  onPrimaryAction: () => void;
  primaryActionLabel?: string;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border/50 bg-background/95 px-4 backdrop-blur-md">
      <div className="flex items-center gap-2">
        <button
          onClick={onCollapseToggle}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Toggle Sidebar"
        >
          <PanelLeft className="h-4 w-4" />
        </button>
        {title && <span className="text-sm font-bold tracking-tight text-foreground">{title}</span>}
      </div>

      {/* Global Search Bar */}
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Filter or search items... (⌘K)"
          className="h-8 w-full rounded-lg border border-border/70 bg-muted/30 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground/60 transition-colors focus:border-primary focus:bg-background focus:outline-hidden"
        />
      </div>

      {/* Primary Action Button */}
      <button
        onClick={onPrimaryAction}
        className="flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-xs transition-transform hover:opacity-90 active:scale-95"
      >
        <Plus className="h-3.5 w-3.5" />
        <span>{primaryActionLabel}</span>
      </button>
    </header>
  );
}
```

---

### 3. Glanceable KPI / Metric Bento Widget (`KpiCard`)
High-impact summary card displaying numeric metrics, trends, and visual progress:

```tsx
export function KpiCard({
  title,
  value,
  subtitle,
  icon: Icon,
  progress,
  progressColor = "bg-primary",
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  progress?: number; // 0 to 100
  progressColor?: string;
}) {
  return (
    <div className="rounded-xl border border-border/80 bg-card/80 p-4 shadow-sm transition-all hover:border-border">
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{title}</span>
        <Icon className="h-4 w-4" />
      </div>
      <div className="mt-1.5 text-2xl font-black tracking-tight text-foreground">
        {value}
      </div>
      {subtitle && <div className="mt-0.5 text-xs text-muted-foreground">{subtitle}</div>}
      {progress !== undefined && (
        <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full transition-all duration-500", progressColor)}
            style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
          />
        </div>
      )}
    </div>
  );
}
```

---

### 4. Universal Data Bento Card (`BentoCard`)
Equal-height card for presenting structured entity records with discrete inset fields:

```tsx
export function BentoCard({
  title,
  category,
  badge,
  icon: Icon,
  fields,
  footerLink,
  onEdit,
  onDelete,
}: {
  title: string;
  category?: string;
  badge?: { label: string; variant: "default" | "warning" | "danger" | "success" };
  icon?: React.ComponentType<{ className?: string }>;
  fields: Array<{ label: string; value: string; mono?: boolean; onCopy?: () => void }>;
  footerLink?: { label: string; url: string; onClick?: () => void };
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="group relative flex flex-col justify-between rounded-xl border border-border/80 bg-card/90 p-4 shadow-sm transition-all duration-150 hover:border-border hover:shadow-md min-h-[220px]">
      <div>
        {/* Card Header: Icon, Titles, Badges, Action Buttons */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            {Icon && (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border/80 bg-card shadow-xs">
                <Icon className="h-5 w-5 text-foreground" />
              </div>
            )}
            <div className="min-w-0">
              <span className="truncate text-sm font-bold text-foreground">{title}</span>
              <div className="mt-0.5 flex flex-wrap gap-1">
                {category && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{category}</span>}
                {badge && <span className="rounded bg-destructive/15 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">{badge.label}</span>}
              </div>
            </div>
          </div>

          {/* Action Toolbar */}
          {(onEdit || onDelete) && (
            <div className="flex items-center gap-1">
              {onEdit && (
                <button onClick={onEdit} className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
              {onDelete && (
                <button onClick={onDelete} className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Card Body: Structured Inset Data Slots */}
        <div className="mt-3.5 space-y-2 text-sm">
          {fields.map((f, i) => (
            <div key={i} className="flex items-center gap-2 rounded-lg border border-border/70 bg-muted/40 px-2.5 py-1.5 transition-colors hover:border-border/90">
              <div className="min-w-0 flex-1">
                <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{f.label}</div>
                <div className={cn("truncate font-medium text-foreground text-xs", f.mono && "font-mono text-xs font-semibold")}>{f.value}</div>
              </div>
              {f.onCopy && (
                <button onClick={f.onCopy} className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground active:scale-95">
                  <Copy className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Card Footer: Aligned Metadata / Action Link */}
      <div className="mt-3 pt-2.5 border-t border-border/50 flex items-center justify-between text-xs min-h-[26px]">
        {footerLink ? (
          <button onClick={footerLink.onClick} className="flex items-center gap-1.5 truncate font-medium text-foreground hover:underline max-w-full text-left">
            <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{footerLink.label}</span>
            <ExternalLink className="h-3 w-3 opacity-60 ml-0.5" />
          </button>
        ) : (
          <span className="flex items-center gap-1.5 text-muted-foreground/35 text-[11px]">
            <Globe className="h-3.5 w-3.5 shrink-0 opacity-30" />
            No link attached
          </span>
        )}
      </div>
    </div>
  );
}
```

---

### 5. Live Status Radar Beacon (`StatusBeacon`)
Animated pulse indicator for real-time connection, sync, or health status:

```tsx
export function StatusBeacon({
  status = "online",
  title = "System Healthy",
  description = "All services operational",
}: {
  status?: "online" | "warning" | "offline";
  title?: string;
  description?: string;
}) {
  const colors = {
    online: { dot: "bg-emerald-500", ping: "bg-emerald-400", shadow: "shadow-[0_0_10px_rgba(16,185,129,0.8)]", text: "text-emerald-500" },
    warning: { dot: "bg-amber-500", ping: "bg-amber-400", shadow: "shadow-[0_0_10px_rgba(245,158,11,0.8)]", text: "text-amber-500" },
    offline: { dot: "bg-rose-500", ping: "bg-rose-400", shadow: "shadow-[0_0_10px_rgba(239,68,68,0.8)]", text: "text-rose-500" },
  };

  const c = colors[status];

  return (
    <div className="relative flex items-center group/tooltip cursor-pointer">
      <span className="relative flex h-2.5 w-2.5">
        <span className={cn("animate-ping absolute inline-flex h-full w-full rounded-full opacity-60", c.ping)} />
        <span className={cn("relative inline-flex rounded-full h-2.5 w-2.5", c.dot, c.shadow)} />
      </span>
      <div className="pointer-events-none absolute right-0 top-full mt-2 z-50 hidden group-hover/tooltip:flex flex-col gap-0.5 rounded-xl border border-border/90 bg-popover/95 px-3 py-2 text-[11px] shadow-xl backdrop-blur-md whitespace-nowrap animate-in fade-in-0 duration-150 text-popover-foreground">
        <div className={cn("flex items-center gap-1.5 font-bold", c.text)}>
          <ShieldCheck className="h-3.5 w-3.5" />
          <span>{title}</span>
        </div>
        <span className="text-[10px] text-muted-foreground font-normal">{description}</span>
      </div>
    </div>
  );
}
```

---

## 6. Snappy Physics-Based Modal Animation Engine

Replace sluggish default sheet animations with **160ms cubic-bezier spring popups**:

```css
@keyframes modal-enter {
  0% { opacity: 0; transform: translate(-50%, -48%) scale(0.97); }
  100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
}

@keyframes modal-exit {
  0% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
  100% { opacity: 0; transform: translate(-50%, -48%) scale(0.97); }
}

.animate-modal-enter {
  animation: modal-enter 160ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
.animate-modal-exit {
  animation: modal-exit 120ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
```

---

## 7. Universal Dashboard Implementation Checklist

When tasked with generating or refactoring a modern dashboard in any project:

- [ ] **Unified Canvas:** Put top KPI summary widgets and main items grid into the **exact same parent scroll container**.
- [ ] **Boxy Geometry:** Use `rounded-xl` for outer cards, `rounded-lg` for inset slots, and `rounded-md` for buttons/icons.
- [ ] **Uniform Card Dimensions:** Apply `min-h-[220px] flex flex-col justify-between` and reserved footer height (`min-h-[26px]`).
- [ ] **Frameless Windowing:** Use Apple traffic lights with single-click drag vs double-click maximize event separation.
- [ ] **Live Status Radar:** Use `animate-ping` with emerald/amber glow and hover popovers.
- [ ] **Strict Contrast Hygiene:** Never set global `button { background: ... }`. Use `text-slate-700` in light mode and `text-zinc-400` in dark mode.
- [ ] **Snappy Physics Modals:** Use 160ms scale-fade keyframes with destructive safety dialogs.

