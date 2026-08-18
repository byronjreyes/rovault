import { useEffect, useState } from "react";
import { api, type VaultSummary } from "@/lib/api";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Plus,
  ChevronRight,
  Fingerprint,
  Eye,
  EyeOff,
  KeyRound,
  Trash2,
  Upload,
  ArrowLeft,
  ShieldCheck,
  LockKeyhole,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Mode = "list" | "unlock";

function ROVaultBrandLogo() {
  return (
    <div className="relative flex items-center justify-center mb-3">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-foreground text-background shadow-xl ring-1 ring-border/30 transition-transform duration-300 hover:scale-105">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-7 w-7"
        >
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <path d="M9 11a3 3 0 1 1 6 0c0 1.3-.8 2.4-2 2.8V16h-2v-2.2c-1.2-.4-2-1.5-2-2.8z" fill="currentColor" />
        </svg>
      </div>
    </div>
  );
}

export function VaultPicker({
  onOpened,
  onCreateNew,
}: {
  onOpened: () => void;
  onCreateNew: () => void;
}) {
  const toast = useToast();
  const [vaults, setVaults] = useState<VaultSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>("list");
  const [selected, setSelected] = useState<VaultSummary | null>(null);

  // unlock form
  const [useRecovery, setUseRecovery] = useState(false);
  const [secret, setSecret] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  // delete confirm
  const [deleteTarget, setDeleteTarget] = useState<VaultSummary | null>(null);
  const [deletePw, setDeletePw] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      setVaults(await api.listVaults());
    } catch (e) {
      toast(String(e), "error");
    } finally {
      setLoading(false);
    }
  }

  async function importEncryptedBackup() {
    try {
      const path = await open({
        multiple: false,
        filters: [
          { name: "Encrypted ROVault backup", extensions: ["rovault", "json"] },
        ],
      });
      if (typeof path !== "string") return;
      const contents = await readTextFile(path);
      const imported = await api.importEncrypted(contents);
      toast(`Encrypted vault "${imported.name}" imported`, "success");
      await refresh();
      pick(imported);
    } catch (e) {
      toast(String(e), "error");
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  function pick(v: VaultSummary) {
    setSelected(v);
    setSecret("");
    setUseRecovery(false);
    setShow(false);
    setMode("unlock");
  }

  async function submitUnlock(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !secret) return;
    setBusy(true);
    try {
      await api.unlock(selected.id, secret, useRecovery);
      setSecret("");
      onOpened();
    } catch {
      toast(useRecovery ? "Invalid recovery key" : "Incorrect master password", "error");
    } finally {
      setBusy(false);
    }
  }

  async function biometricUnlock() {
    if (!selected) return;
    setBusy(true);
    try {
      await api.unlockBiometric(selected.id);
      onOpened();
    } catch (e) {
      toast(String(e), "error");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      await api.deleteVault(deleteTarget.id, deletePw);
      toast(`Vault "${deleteTarget.name}" deleted`, "success");
      setDeleteTarget(null);
      setDeletePw("");
      await refresh();
    } catch (e) {
      toast(String(e), "error");
    } finally {
      setDeleteBusy(false);
    }
  }

  const getInitials = (name: string) => {
    const clean = name.trim();
    if (!clean) return "VA";
    const parts = clean.split(/\s+/);
    if (parts.length > 1) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return clean.slice(0, 2).toUpperCase();
  };

  return (
    <div className="relative flex h-full w-full items-center justify-center bg-background p-6 overflow-hidden">
      {/* Background Ambience */}
      <div className="absolute -left-20 -top-20 h-72 w-72 rounded-full bg-foreground/[0.03] blur-3xl pointer-events-none" />
      <div className="absolute -right-20 -bottom-20 h-72 w-72 rounded-full bg-foreground/[0.03] blur-3xl pointer-events-none" />

      <div className="relative z-10 w-full max-w-md animate-fade-in">
        {/* Brand Header */}
        <div className="mb-6 flex flex-col items-center text-center">
          <ROVaultBrandLogo />
          <h1 className="text-2xl font-bold tracking-tight text-foreground">ROVault</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {mode === "list"
              ? "Select an encrypted vault to unlock"
              : `Unlock ${selected?.name || "Vault"}`}
          </p>
        </div>

        <div className="rounded-2xl border border-border/80 bg-card p-6 shadow-2xl">
          {mode === "list" && (
            <div className="space-y-4">
              {loading ? (
                <div className="py-8 text-center text-xs font-medium text-muted-foreground animate-pulse">
                  Loading encrypted vaults…
                </div>
              ) : vaults.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  No vaults found. Create your first vault to get started.
                </div>
              ) : (
                <div className="space-y-2 max-h-[280px] overflow-y-auto pr-0.5">
                  {vaults.map((v) => (
                    <div
                      key={v.id}
                      className="group flex items-center justify-between rounded-xl border border-border/70 bg-card p-3 transition-all duration-150 hover:bg-muted/40 hover:border-foreground/30 active:scale-[0.99]"
                    >
                      <button
                        onClick={() => pick(v)}
                        className="flex flex-1 items-center gap-3 text-left min-w-0"
                      >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-bold text-foreground border border-border/50">
                          {getInitials(v.name)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 font-bold text-sm text-foreground truncate">
                            <span>{v.name || "Untitled vault"}</span>
                            {v.biometric_enabled && (
                              <span title="Windows Hello Enabled">
                                <Fingerprint className="h-3.5 w-3.5 text-primary shrink-0" />
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            Created {new Date(v.created_at * 1000).toLocaleDateString()}
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget(v);
                          setDeletePw("");
                        }}
                        className="ml-2 rounded-lg p-2 text-muted-foreground opacity-60 transition-all hover:bg-destructive/10 hover:text-destructive hover:opacity-100"
                        title="Delete vault"
                        aria-label="Delete vault"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-2 pt-1">
                <Button className="w-full rounded-xl font-bold h-10 shadow-sm" onClick={onCreateNew}>
                  <Plus className="h-4 w-4 mr-1" /> Create New Vault
                </Button>
                <Button
                  variant="outline"
                  className="w-full rounded-xl font-semibold h-10 border-border/80 hover:bg-muted/60"
                  onClick={importEncryptedBackup}
                >
                  <Upload className="h-4 w-4 mr-1.5" /> Import Encrypted Backup (.rovault)
                </Button>
              </div>

              <div className="flex items-center justify-center gap-1.5 pt-1 text-[11px] text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>Zero-knowledge authenticated encryption</span>
              </div>
            </div>
          )}

          {mode === "unlock" && selected && (
            <form onSubmit={submitUnlock} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="secret" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {useRecovery ? "One-Time Recovery Key" : "Master Password"}
                </Label>
                <div className="relative">
                  <Input
                    id="secret"
                    type={useRecovery || show ? "text" : "password"}
                    value={secret}
                    onChange={(e) => setSecret(e.target.value)}
                    placeholder={useRecovery ? "XXXX-XXXX-XXXX-XXXX" : "••••••••••••"}
                    autoFocus
                    className={cn("rounded-xl pr-10", useRecovery ? "font-mono text-xs uppercase" : "font-mono text-sm")}
                  />
                  {!useRecovery && (
                    <button
                      type="button"
                      onClick={() => setShow((s) => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
                      aria-label={show ? "Hide" : "Show"}
                    >
                      {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  )}
                </div>
              </div>

              <Button type="submit" className="w-full rounded-xl font-bold h-10 shadow-sm" disabled={busy || !secret}>
                <LockKeyhole className="h-4 w-4 mr-1" />
                {busy ? "Decrypting Vault…" : "Unlock Vault"}
              </Button>

              {selected.biometric_enabled && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full rounded-xl font-bold h-10 border-border/80"
                  onClick={biometricUnlock}
                  disabled={busy}
                >
                  <Fingerprint className="h-4 w-4 mr-1 text-primary" /> Unlock with Windows Hello
                </Button>
              )}

              <div className="flex items-center justify-between text-xs pt-2 border-t border-border/60">
                <button
                  type="button"
                  onClick={() => {
                    setUseRecovery((r) => !r);
                    setSecret("");
                  }}
                  className="flex items-center gap-1.5 font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  <KeyRound className="h-3.5 w-3.5 text-primary" />
                  {useRecovery
                    ? "Use master password"
                    : "Use recovery key"}
                </button>
                <button
                  type="button"
                  onClick={() => setMode("list")}
                  className="flex items-center gap-1 font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> All vaults
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Delete vault confirmation modal */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="rounded-2xl border border-destructive/40 bg-card p-6 shadow-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-destructive">Confirm Vault Deletion</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Permanently delete <strong>{deleteTarget?.name}</strong> and all encrypted records stored within it. Enter your master password to confirm.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <Label htmlFor="delpw" className="text-xs font-bold text-muted-foreground">Master Password</Label>
            <Input
              id="delpw"
              type="password"
              value={deletePw}
              onChange={(e) => setDeletePw(e.target.value)}
              autoFocus
              className="rounded-xl"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} className="rounded-xl">
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleteBusy || !deletePw}
              className="rounded-xl font-bold"
            >
              {deleteBusy ? "Deleting…" : "Permanently Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
