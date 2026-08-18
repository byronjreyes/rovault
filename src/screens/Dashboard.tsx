import { useEffect, useMemo, useState, useCallback } from "react";
import { api, type Credential } from "@/lib/api";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { CredentialDialog } from "./CredentialDialog";
import { SettingsDialog, getAutolockMinutes } from "./Settings";
import { PasswordGenerator } from "./PasswordGenerator";
import { TotpDisplay } from "@/components/TotpDisplay";
import { ProviderIcon } from "@/components/ProviderIcon";
import { passwordStrength } from "@/lib/password";
import { cn } from "@/lib/utils";
import {
  Plus,
  Search,
  Settings as SettingsIcon,
  Copy,
  Eye,
  EyeOff,
  Star,
  Trash2,
  Pencil,
  Globe,
  LayoutGrid,
  Mail,
  CreditCard,
  Briefcase,
  ShoppingBag,
  Users,
  Folder,
  KeyRound,
  ShieldAlert,
  ShieldCheck,
  ExternalLink,
  LockKeyhole,
  PanelLeft,
  PanelLeftClose,
  LogOut,
} from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";

const CATEGORY_ICONS: Record<string, typeof Globe> = {
  Social: Users,
  Email: Mail,
  Banking: CreditCard,
  Work: Briefcase,
  Shopping: ShoppingBag,
  Other: Folder,
};

function openWebsite(url: string) {
  if (!url) return;
  const clean = url.trim();
  const target = clean.startsWith("http://") || clean.startsWith("https://")
    ? clean
    : `https://${clean}`;
  openUrl(target).catch(() => {});
}

export function Dashboard({ onLock }: { onLock: () => void }) {
  const toast = useToast();
  const [entries, setEntries] = useState<Credential[]>([]);
  const [vaultName, setVaultName] = useState("ROVault");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("All");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Credential | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Credential | null>(null);

  const refresh = useCallback(async () => {
    try {
      setEntries(await api.listEntries());
      const s = await api.sessionInfo();
      setVaultName(s.name || "ROVault");
    } catch (e) {
      toast(String(e), "error");
    }
  }, [toast]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Auto-lock on inactivity.
  useEffect(() => {
    const mins = getAutolockMinutes();
    if (mins === 0) return;
    let timer: number;
    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(async () => {
        await api.lock();
        onLock();
      }, mins * 60 * 1000);
    };
    const events = ["mousedown", "keydown", "touchstart", "scroll"];
    events.forEach((ev) => window.addEventListener(ev, reset, { passive: true }));
    reset();
    return () => {
      window.clearTimeout(timer);
      events.forEach((ev) => window.removeEventListener(ev, reset));
    };
  }, [onLock]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const e of entries) {
      if (e.category && e.category.trim()) set.add(e.category);
    }
    return Array.from(set).sort();
  }, [entries]);

  // Password audit: weak + reused.
  const audit = useMemo(() => {
    const weak = new Set<string>();
    const passMap = new Map<string, string[]>();
    for (const e of entries) {
      if (passwordStrength(e.password || "").score <= 1) weak.add(e.id);
      if (e.password) {
        const list = passMap.get(e.password) ?? [];
        list.push(e.id);
        passMap.set(e.password, list);
      }
    }
    const reused = new Set<string>();
    for (const ids of passMap.values()) {
      if (ids.length > 1) ids.forEach((id) => reused.add(id));
    }
    return { weak, reused };
  }, [entries]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (category === "Favorites" && !e.favorite) return false;
      if (category === "Audit" && !audit.weak.has(e.id) && !audit.reused.has(e.id))
        return false;
      if (category !== "All" && category !== "Favorites" && category !== "Audit") {
        if (e.category !== category) return false;
      }
      if (!q) return true;
      return (
        e.provider.toLowerCase().includes(q) ||
        e.username.toLowerCase().includes(q) ||
        e.url.toLowerCase().includes(q) ||
        e.notes.toLowerCase().includes(q)
      );
    });
  }, [entries, category, search, audit]);

  function copy(text: string, label: string) {
    writeText(text);
    toast(`${label} copied`, "success");
  }

  function toggleReveal(id: string) {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function toggleFavorite(c: Credential, e: React.MouseEvent) {
    e.stopPropagation();
    const updated = { ...c, favorite: !c.favorite };
    await api.upsertEntry(updated);
    await refresh();
    toast(updated.favorite ? "Added to favorites" : "Removed from favorites", "success");
  }

  async function save(c: Credential) {
    await api.upsertEntry(c);
    await refresh();
    toast(c.id ? "Credential updated" : "Credential added", "success");
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await api.deleteEntry(deleteTarget.id);
      await refresh();
      toast(`Credential "${deleteTarget.provider}" deleted`, "success");
    } catch (e) {
      toast(String(e), "error");
    } finally {
      setDeleteTarget(null);
    }
  }

  const auditCount = audit.weak.size + new Set([...audit.reused]).size;
  const healthScore = useMemo(() => {
    if (entries.length === 0) return 100;
    let totalScore = 0;
    entries.forEach((e) => {
      const s = passwordStrength(e.password || "").score; // 0 to 4
      let itemScore = (s / 4) * 100;
      if (audit.reused.has(e.id)) {
        itemScore = Math.max(0, itemScore - 25);
      }
      if (e.totp_secret) {
        itemScore = Math.min(100, itemScore + 10);
      }
      totalScore += itemScore;
    });
    return Math.max(0, Math.min(100, Math.round(totalScore / entries.length)));
  }, [entries, audit]);

  return (
    <div className="flex h-full w-full overflow-hidden bg-background">
      {/* Collapsible Sidebar */}
      <aside
        className={cn(
          "flex shrink-0 flex-col border-r border-border/50 bg-background p-2.5 transition-all duration-200 ease-in-out",
          sidebarCollapsed ? "w-16 items-center" : "w-60"
        )}
      >
        {/* Vault Profile Header - Linear style */}
        <div
          className={cn(
            "mb-2.5 flex items-center gap-2.5 px-2 py-1.5 transition-colors",
            sidebarCollapsed ? "justify-center px-0" : "w-full"
          )}
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-orange-600 font-bold text-[11px] text-white shadow-sm">
            {vaultName.slice(0, 2).toUpperCase()}
          </div>
          {!sidebarCollapsed && (
            <div className="min-w-0 flex-1 flex items-center justify-between">
              <span className="truncate text-sm font-bold text-foreground tracking-tight">
                {vaultName}
              </span>
              {/* Glowing encrypted status dot with sleek hover tooltip */}
              <div className="relative flex items-center group/tooltip cursor-pointer">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]" />
                </span>
                <div className="pointer-events-none absolute right-0 top-full mt-1.5 z-50 hidden group-hover/tooltip:flex items-center gap-1.5 rounded-lg border border-border/80 bg-popover/95 px-2.5 py-1 text-xs font-semibold text-emerald-500 shadow-lg backdrop-blur-md whitespace-nowrap animate-in fade-in-0 duration-150">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                  <span>Vault Encrypted</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Navigation Categories */}
        <nav className="flex-1 space-y-0.5 overflow-y-auto w-full pr-0.5" aria-label="Categories">
          <SidebarButton
            collapsed={sidebarCollapsed}
            active={category === "All"}
            onClick={() => setCategory("All")}
            icon={LayoutGrid}
            label="All items"
            count={entries.length}
          />
          <SidebarButton
            collapsed={sidebarCollapsed}
            active={category === "Favorites"}
            onClick={() => setCategory("Favorites")}
            icon={Star}
            label="Favorites"
            count={entries.filter((e) => e.favorite).length}
          />
          <SidebarButton
            collapsed={sidebarCollapsed}
            active={category === "Audit"}
            onClick={() => setCategory("Audit")}
            icon={ShieldAlert}
            label="Security audit"
            count={auditCount}
            danger={auditCount > 0}
          />

          {!sidebarCollapsed && categories.length > 0 && (
            <div className="px-2.5 pb-1 pt-3.5 text-xs font-semibold text-slate-700 dark:text-zinc-400">
              Categories
            </div>
          )}
          {categories.map((c) => (
            <SidebarButton
              key={c}
              collapsed={sidebarCollapsed}
              active={category === c}
              onClick={() => setCategory(c)}
              icon={CATEGORY_ICONS[c] || Folder}
              label={c}
              count={entries.filter((e) => e.category === c).length}
            />
          ))}
        </nav>

        {/* Bottom Controls (Settings + Sign Out Lock) */}
        <div className="space-y-0.5 pt-2 border-t border-border/70 w-full">
          <SidebarButton
            collapsed={sidebarCollapsed}
            icon={KeyRound}
            label="Password generator"
            onClick={() => setGeneratorOpen(true)}
          />
          <SidebarButton
            collapsed={sidebarCollapsed}
            icon={SettingsIcon}
            label="Settings"
            onClick={() => setSettingsOpen(true)}
          />
          <SidebarButton
            collapsed={sidebarCollapsed}
            icon={LogOut}
            label="Lock vault"
            onClick={async () => {
              await api.lock();
              onLock();
            }}
          />
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {/* Header Bar */}
        <header className="flex items-center gap-3 border-b border-border/80 bg-card/40 px-5 py-3 backdrop-blur-md">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="rounded-xl shrink-0 text-muted-foreground hover:text-foreground h-9 w-9"
          >
            {sidebarCollapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </Button>

          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search credentials, usernames, websites…"
              className="h-9.5 pl-10 bg-background/80 rounded-xl"
              aria-label="Search credentials"
            />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setGeneratorOpen(true)}
              className="rounded-xl border-border/80 h-9"
            >
              <KeyRound className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Generator</span>
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
              className="rounded-xl h-9 shadow-sm"
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Add Item</span>
              <span className="sm:hidden">Add</span>
            </Button>
          </div>
        </header>        {/* Dashboard Content - Unified Scroll Container */}
        <div className="flex-1 overflow-y-auto p-5 pr-4 space-y-4">
          {/* Static Top Stat Bento Cards (3-column grid) */}
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
            {/* Widget 1: Total Items */}
            <div className="rounded-xl border border-border/80 bg-card/80 p-4 shadow-sm">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Total Items</span>
                <LayoutGrid className="h-4 w-4" />
              </div>
              <div className="mt-1.5 text-2xl font-black tracking-tight text-foreground">
                {entries.length}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                Across {categories.length || 1} {categories.length === 1 ? "category" : "categories"}
              </div>
            </div>

            {/* Widget 2: Starred Favorites */}
            <div className="rounded-xl border border-border/80 bg-card/80 p-4 shadow-sm">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Starred Favorites</span>
                <Star className="h-4 w-4 text-amber-400 fill-amber-400" />
              </div>
              <div className="mt-1.5 text-2xl font-black tracking-tight text-foreground">
                {entries.filter((e) => e.favorite).length}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                Quick-access logins
              </div>
            </div>

            {/* Widget 3: Security Health */}
            <div className="rounded-xl border border-border/80 bg-card/80 p-4 shadow-sm">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Security Health</span>
                {auditCount === 0 ? (
                  <ShieldCheck className="h-4 w-4 text-emerald-500" />
                ) : (
                  <ShieldAlert className="h-4 w-4 text-destructive" />
                )}
              </div>
              <div className="mt-1.5 flex items-baseline gap-2">
                <span className="text-2xl font-black tracking-tight text-foreground">
                  {healthScore}%
                </span>
                <span className="text-xs font-medium text-muted-foreground">
                  {auditCount === 0 ? "All secure" : `${auditCount} alert(s)`}
                </span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    healthScore >= 80
                      ? "bg-emerald-500"
                      : healthScore >= 50
                      ? "bg-amber-500"
                      : "bg-destructive"
                  )}
                  style={{ width: `${healthScore}%` }}
                />
              </div>
            </div>
          </div>

          {/* Audit Notification Banner (if in Audit view) */}
          {category === "Audit" && auditCount > 0 && (
            <div className="flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3.5 text-xs text-foreground">
              <ShieldAlert className="h-4 w-4 shrink-0 text-destructive" />
              <div className="flex-1">
                <span className="font-semibold text-destructive">Security recommendations: </span>
                {audit.weak.size > 0 && `${audit.weak.size} weak password(s)`}
                {audit.weak.size > 0 && audit.reused.size > 0 && " and "}
                {audit.reused.size > 0 && `${audit.reused.size} reused password(s)`} found. Update them to improve vault security.
              </div>
            </div>
          )}

          {/* Grid / Empty State View */}
          {filtered.length === 0 ? (
            <EmptyState
              hasAny={entries.length > 0}
              isAudit={category === "Audit"}
              onAdd={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
            />
          ) : (
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 pb-4">
              {filtered.map((c) => {
                const isRevealed = revealed.has(c.id);
                const isWeak = audit.weak.has(c.id);
                const isReused = audit.reused.has(c.id);
                return (
                  <div
                    key={c.id}
                    className="group relative flex flex-col justify-between rounded-xl border border-border/80 bg-card/90 p-4 shadow-sm transition-all duration-150 hover:border-border hover:shadow-md min-h-[220px]"
                  >
                    <div>
                      {/* Header: Avatar, Provider, Badges, Action buttons */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <ProviderIcon name={c.provider} url={c.url} size="md" />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate text-sm font-bold text-foreground">
                                {c.provider}
                              </span>
                            </div>
                            <div className="mt-0.5 flex flex-wrap gap-1">
                              {c.category && (
                                <Badge className="text-[10px] py-0 px-2 font-medium">
                                  {c.category}
                                </Badge>
                              )}
                              {isWeak && (
                                <Badge className="bg-destructive/15 text-[10px] py-0 px-2 text-destructive border-destructive/20">
                                  Weak
                                </Badge>
                              )}
                              {isReused && (
                                <Badge className="bg-amber-500/15 text-[10px] py-0 px-2 text-amber-600 dark:text-amber-400 border-amber-500/20">
                                  Reused
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Top Right: Favorite, Edit & Delete Actions (Always Visible) */}
                        <div className="flex items-center gap-1">
                          <button
                            onClick={(e) => toggleFavorite(c, e)}
                            title={c.favorite ? "Starred" : "Add to favorites"}
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-amber-400 hover:bg-muted/60 active:scale-95"
                            aria-label="Favorite"
                          >
                            <Star
                              className={cn(
                                "h-3.5 w-3.5 transition-transform",
                                c.favorite
                                  ? "fill-amber-400 text-amber-400 scale-110"
                                  : "text-muted-foreground/70 hover:text-foreground"
                              )}
                            />
                          </button>
                          <button
                            onClick={() => {
                              setEditing(c);
                              setDialogOpen(true);
                            }}
                            title="Edit credential"
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground active:scale-95"
                            aria-label="Edit"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(c)}
                            title="Delete credential"
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive active:scale-95"
                            aria-label="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Card Body: Bento slots for Username & Password */}
                      <div className="mt-3.5 space-y-2 text-sm">
                        {c.username && (
                          <Field
                            label="Username"
                            value={c.username}
                            onCopy={() => copy(c.username, "Username")}
                          />
                        )}
                        <Field
                          label="Password"
                          value={isRevealed ? c.password : "••••••••••••"}
                          mono
                          onCopy={() => copy(c.password, "Password")}
                          trailing={
                            <button
                              onClick={() => toggleReveal(c.id)}
                              className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                              aria-label={isRevealed ? "Hide" : "Reveal"}
                            >
                              {isRevealed ? (
                                <EyeOff className="h-3.5 w-3.5" />
                              ) : (
                                <Eye className="h-3.5 w-3.5" />
                              )}
                            </button>
                          }
                        />
                        {c.totp_secret && <TotpDisplay secret={c.totp_secret} />}
                      </div>
                    </div>

                    {/* Card Footer: Website Link / Clean placeholder for equal card heights */}
                    <div className="mt-3 pt-2.5 border-t border-border/50 flex items-center justify-between text-xs min-h-[26px]">
                      {c.url ? (
                        <button
                          onClick={() => openWebsite(c.url)}
                          title={`Open ${c.url}`}
                          className="flex items-center gap-1.5 truncate font-medium text-foreground hover:underline max-w-full text-left"
                        >
                          <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="truncate">{c.url.replace(/^https?:\/\//, "")}</span>
                          <ExternalLink className="h-3 w-3 shrink-0 opacity-60 ml-0.5" />
                        </button>
                      ) : (
                        <span className="flex items-center gap-1.5 text-muted-foreground/35 text-[11px]">
                          <Globe className="h-3.5 w-3.5 shrink-0 opacity-30" />
                          No website linked
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      <CredentialDialog
        open={dialogOpen}
        initial={editing}
        onClose={() => setDialogOpen(false)}
        onSave={save}
      />
      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onImported={refresh}
        onVaultDeleted={onLock}
      />
      <PasswordGenerator
        open={generatorOpen}
        onClose={() => setGeneratorOpen(false)}
      />

      {/* Delete Credential Confirmation Modal */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="rounded-2xl border border-destructive/40 bg-card p-6 shadow-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-destructive flex items-center gap-2">
              <Trash2 className="h-5 w-5" />
              Delete Credential
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground pt-1">
              Are you sure you want to permanently delete credentials for <strong className="text-foreground">{deleteTarget?.provider}</strong>{deleteTarget?.username ? ` (${deleteTarget.username})` : ""}? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0 pt-3">
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              className="rounded-xl border-border/80"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              className="rounded-xl font-bold gap-1.5"
            >
              <Trash2 className="h-4 w-4" />
              Delete Permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SidebarButton({
  icon: Icon,
  label,
  count,
  active,
  danger,
  collapsed,
  onClick,
}: {
  icon: typeof Globe;
  label: string;
  count?: number;
  active?: boolean;
  danger?: boolean;
  collapsed?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={cn(
        "flex items-center rounded-lg text-xs font-medium transition-colors duration-150 active:scale-[0.99]",
        collapsed ? "w-9 h-9 justify-center p-0 mx-auto" : "w-full gap-2.5 px-2.5 py-2",
        active
          ? "bg-slate-200/90 text-slate-950 font-semibold shadow-xs dark:bg-[#1f1f23] dark:text-white"
          : "bg-transparent text-slate-700 hover:text-slate-950 hover:bg-slate-100 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-white/[0.04]"
      )}
    >
      <Icon
        className={cn(
          "h-4 w-4 shrink-0 transition-colors",
          active ? "text-slate-950 dark:text-white" : "text-slate-600 dark:text-zinc-400"
        )}
      />
      {!collapsed && <span className="flex-1 text-left truncate">{label}</span>}
      {!collapsed && count !== undefined && count > 0 && (
        <span
          className={cn(
            "text-[11px] font-medium transition-colors",
            danger
              ? "text-rose-600 dark:text-rose-400 font-bold"
              : active
              ? "text-slate-900 dark:text-zinc-300 font-semibold"
              : "text-slate-500 dark:text-zinc-500"
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function Field({
  label,
  value,
  mono,
  onCopy,
  trailing,
}: {
  label: string;
  value: string;
  mono?: boolean;
  onCopy: () => void;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-muted/40 px-2.5 py-1.5 transition-colors hover:border-border/90">
      <div className="min-w-0 flex-1">
        <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div className={cn("truncate font-medium text-foreground text-xs", mono && "font-mono text-xs font-semibold")}>
          {value}
        </div>
      </div>
      {trailing}
      <button
        onClick={onCopy}
        className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-95"
        aria-label={`Copy ${label}`}
      >
        <Copy className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function EmptyState({
  hasAny,
  isAudit,
  onAdd,
}: {
  hasAny: boolean;
  isAudit: boolean;
  onAdd: () => void;
}) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center py-8 text-center">
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-foreground shadow-sm">
        <LockKeyhole className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="text-base font-bold text-foreground">
        {isAudit
          ? "No security issues found"
          : hasAny
          ? "No matching credentials"
          : "Your vault is ready"}
      </h3>
      <p className="mt-1 mb-5 max-w-sm text-xs text-muted-foreground leading-relaxed">
        {isAudit
          ? "All your stored passwords are strong and unique."
          : hasAny
          ? "Try a different search term or select another category."
          : "Add your first credential to keep it encrypted, protected, and available anywhere."}
      </p>
      {!hasAny && !isAudit && (
        <Button onClick={onAdd} className="rounded-xl shadow-md font-bold text-xs h-9">
          <Plus className="h-3.5 w-3.5" /> Add First Credential
        </Button>
      )}
    </div>
  );
}
