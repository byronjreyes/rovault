import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useTheme } from "@/components/theme-provider";
import { useToast } from "@/components/toast";
import { save, open, ask } from "@tauri-apps/plugin-dialog";
import { writeTextFile, readTextFile } from "@tauri-apps/plugin-fs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Sun,
  Moon,
  Monitor,
  Download,
  Upload,
  ShieldAlert,
  KeyRound,
  Timer,
  Fingerprint,
  Trash2,
  Type,
  Check,
  Sparkles,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { FontFamily, FontSize } from "@/components/theme-provider";
import { checkForAppUpdates, installUpdate, type UpdateState } from "@/lib/updater";

const AUTOLOCK_KEY = "rovault-autolock-min";

export function SettingsDialog({
  open: isOpen,
  onClose,
  onImported,
  onVaultDeleted,
}: {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
  onVaultDeleted: () => void;
}) {
  const { theme, setTheme, fontFamily, setFontFamily, fontSize, setFontSize } = useTheme();
  const toast = useToast();
  const [tab, setTab] = useState<"appearance" | "accessibility" | "security" | "data" | "updates">(
    "appearance"
  );

  const [updateState, setUpdateState] = useState<UpdateState>({ status: "idle" });

  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [autolock, setAutolock] = useState(
    () => Number(localStorage.getItem(AUTOLOCK_KEY)) || 5
  );

  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioReason, setBioReason] = useState("");
  const [bioEnabled, setBioEnabled] = useState(false);
  const [bioBusy, setBioBusy] = useState(false);
  const [vaultId, setVaultId] = useState("");

  const [showDelete, setShowDelete] = useState(false);
  const [deletePw, setDeletePw] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    api
      .sessionInfo()
      .then((s) => {
        setBioAvailable(s.biometric_available);
        setBioEnabled(s.biometric_enabled);
        setVaultId(s.vault_id);
      })
      .catch(() => {});
    api.biometricReason().then(setBioReason).catch(() => {});
  }, [isOpen]);

  async function toggleBiometric(next: boolean) {
    setBioBusy(true);
    try {
      if (next) {
        await api.enableBiometric();
        toast("Windows Hello unlock enabled", "success");
      } else {
        await api.disableBiometric();
        toast("Windows Hello unlock disabled", "success");
      }
      setBioEnabled(next);
    } catch (e) {
      toast(String(e), "error");
    } finally {
      setBioBusy(false);
    }
  }

  async function confirmDeleteVault() {
    setDeleteBusy(true);
    try {
      await api.deleteVault(vaultId, deletePw);
      toast("Vault deleted", "success");
      setShowDelete(false);
      setDeletePw("");
      onClose();
      onVaultDeleted();
    } catch (e) {
      toast(String(e), "error");
    } finally {
      setDeleteBusy(false);
    }
  }

  async function changePassword() {
    if (newPw.length < 8) return toast("New password too short", "error");
    if (newPw !== confirmPw) return toast("Passwords do not match", "error");
    try {
      await api.changeMasterPassword(curPw, newPw);
      setCurPw("");
      setNewPw("");
      setConfirmPw("");
      toast("Master password changed", "success");
    } catch (e) {
      toast(String(e), "error");
    }
  }

  async function exportEncrypted() {
    try {
      const data = await api.exportEncrypted();
      const path = await save({
        defaultPath: "rovault-backup.rovault",
        filters: [{ name: "ROVault backup", extensions: ["rovault", "json"] }],
      });
      if (path) {
        await writeTextFile(path, data);
        toast("Encrypted backup saved", "success");
      }
    } catch (e) {
      toast(String(e), "error");
    }
  }

  async function exportPlaintext() {
    const confirmed = await ask(
      "This exports an UNENCRYPTED file readable by anyone who opens it. Only do this to migrate your data. Continue?",
      { title: "Plaintext export", kind: "warning" }
    );
    if (!confirmed) return;
    try {
      const data = await api.exportPlaintext();
      const path = await save({
        defaultPath: "rovault-plaintext-export.json",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (path) {
        await writeTextFile(path, data);
        toast("Plaintext export saved — keep it safe!", "success");
      }
    } catch (e) {
      toast(String(e), "error");
    }
  }

  async function importEncryptedData() {
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
      toast(`Imported "${imported.name}" successfully`, "success");
      onImported();
      onClose();
    } catch (e) {
      toast(String(e), "error");
    }
  }

  async function importData() {
    try {
      const path = await open({
        multiple: false,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (typeof path !== "string") return;
      const contents = await readTextFile(path);
      const count = await api.importPlaintext(contents);
      toast(`Imported ${count} credential(s)`, "success");
      onImported();
      onClose();
    } catch (e) {
      toast(String(e), "error");
    }
  }

  const themeOptions = [
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
    { value: "system", label: "System", icon: Monitor },
  ] as const;

  const fontOptions: { value: FontFamily; label: string; preview: string; description: string }[] = [
    { value: "bricolage", label: "Bricolage Grotesque", preview: "Bg", description: "Expressive high-contrast modern grotesque" },
    { value: "gotham", label: "Gotham", preview: "Go", description: "Iconic geometric architectural sans" },
    { value: "poppins", label: "Poppins", preview: "Po", description: "Clean geometric rounded sans" },
    { value: "montserrat", label: "Montserrat", preview: "Mo", description: "Classic urban signage aesthetic" },
    { value: "jakarta", label: "Plus Jakarta Sans", preview: "Jk", description: "Refined contemporary geometric sans" },
  ];

  const sizeOptions: { value: FontSize; label: string; scale: string }[] = [
    { value: "sm", label: "Compact", scale: "13px (90%)" },
    { value: "md", label: "Default", scale: "14px (100%)" },
    { value: "lg", label: "Large", scale: "16px (112%)" },
    { value: "xl", label: "Extra Large", scale: "18px (125%)" },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] flex flex-col sm:max-w-xl rounded-2xl border border-border/80 bg-card p-6 shadow-2xl">
        <DialogHeader className="shrink-0 pb-1">
          <DialogTitle className="text-xl font-bold text-foreground">Vault Settings</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Configure vault preferences, typography accessibility, and security.
          </DialogDescription>
        </DialogHeader>

        {/* Bento Tab Switcher */}
        <div className="flex gap-1.5 rounded-xl border border-border/70 bg-muted/40 p-1 shrink-0">
          {(["appearance", "accessibility", "security", "data", "updates"] as const).map((t) => (
            <button
              key={t}
              onClick={() => {
                setTab(t);
                if (t === "updates" && updateState.status === "idle") {
                  checkForAppUpdates(setUpdateState);
                }
              }}
              className={cn(
                "flex-1 rounded-lg py-2 text-xs font-bold capitalize transition-all duration-150 active:scale-[0.98]",
                tab === t
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-card/50"
              )}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto pr-1.5 space-y-4 py-2">
          {tab === "appearance" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Theme Preset
                </Label>
                <div className="grid grid-cols-3 gap-2.5">
                  {themeOptions.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setTheme(opt.value)}
                      className={cn(
                        "flex flex-col items-center gap-2 rounded-xl border p-3.5 text-xs font-bold transition-all duration-150 active:scale-95",
                        theme === opt.value
                          ? "border-primary bg-primary/10 text-primary shadow-sm"
                          : "border-border/70 bg-card text-muted-foreground hover:border-border hover:text-foreground"
                      )}
                    >
                      <opt.icon className="h-5 w-5" />
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-border/70 bg-muted/20 p-4 space-y-2">
                <Label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-foreground">
                  <Timer className="h-4 w-4 text-primary" /> Auto-Lock Timer (Minutes)
                </Label>
                <Input
                  type="number"
                  min={0}
                  value={autolock}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setAutolock(v);
                    localStorage.setItem(AUTOLOCK_KEY, String(v));
                  }}
                  className="rounded-xl font-mono text-sm max-w-[120px]"
                />
                <p className="text-[11px] text-muted-foreground">
                  Set to 0 to disable. The vault will also lock instantly when closing the application.
                </p>
              </div>
            </div>
          )}

          {tab === "accessibility" && (
            <div className="space-y-4">
              {/* Font Family Selection */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  <Type className="h-4 w-4" /> Font Style / Family
                </Label>
                <div className="grid grid-cols-1 gap-2">
                  {fontOptions.map((opt) => {
                    const fontMap: Record<FontFamily, string> = {
                      bricolage: '"Bricolage Grotesque", sans-serif',
                      gotham: '"Montserrat", "Gotham", sans-serif',
                      poppins: '"Poppins", sans-serif',
                      montserrat: '"Montserrat", sans-serif',
                      jakarta: '"Plus Jakarta Sans", sans-serif',
                    };
                    return (
                      <button
                        key={opt.value}
                        onClick={() => setFontFamily(opt.value)}
                        style={{ fontFamily: fontMap[opt.value] }}
                        className={cn(
                          "flex items-center justify-between rounded-xl border p-3 text-left transition-all duration-150 active:scale-[0.99]",
                          fontFamily === opt.value
                            ? "border-primary bg-primary/10 text-foreground shadow-sm"
                            : "border-border/70 bg-card text-muted-foreground hover:border-border hover:text-foreground"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-sm font-bold text-foreground">
                            {opt.preview}
                          </div>
                          <div>
                            <div className="text-sm font-bold text-foreground">{opt.label}</div>
                            <div className="text-[11px] text-muted-foreground opacity-80">{opt.description}</div>
                          </div>
                        </div>
                        {fontFamily === opt.value && (
                          <Check className="h-4 w-4 text-primary" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Font Size Scaling */}
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Interface Font Scale
                </Label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {sizeOptions.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setFontSize(opt.value)}
                      className={cn(
                        "flex flex-col items-center gap-1 rounded-xl border p-2.5 text-center transition-all duration-150 active:scale-95",
                        fontSize === opt.value
                          ? "border-primary bg-primary/10 text-primary shadow-sm"
                          : "border-border/70 bg-card text-muted-foreground hover:border-border hover:text-foreground"
                      )}
                    >
                      <span className="text-xs font-bold">{opt.label}</span>
                      <span className="text-[10px] text-muted-foreground">{opt.scale}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Live Preview Box */}
              <div className="rounded-xl border border-border/70 bg-muted/20 p-4 space-y-1.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Live Typography Preview
                </div>
                <div className="text-base font-bold text-foreground tracking-tight">
                  Shadcn blocks for marketing.
                </div>
                <div className="text-xs text-muted-foreground">
                  Zero-knowledge authenticated encryption across all your logins, notes, and credentials.
                </div>
              </div>
            </div>
          )}

          {tab === "security" && (
            <div className="space-y-4">
              <div className="flex items-start gap-2.5 rounded-xl border border-border/70 bg-muted/30 p-3.5 text-xs">
                <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span className="text-foreground leading-relaxed">
                  Changing your master password automatically re-encrypts your Data Encryption Key (DEK). Your recovery key remains valid.
                </span>
              </div>

              <div className="rounded-xl border border-border/70 bg-card p-4 space-y-3">
                <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Change Master Password
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="curpw" className="text-xs font-medium text-muted-foreground">Current Password</Label>
                  <Input
                    id="curpw"
                    type="password"
                    value={curPw}
                    onChange={(e) => setCurPw(e.target.value)}
                    className="rounded-xl"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="newpw" className="text-xs font-medium text-muted-foreground">New Master Password</Label>
                  <Input
                    id="newpw"
                    type="password"
                    value={newPw}
                    onChange={(e) => setNewPw(e.target.value)}
                    className="rounded-xl"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="cfpw" className="text-xs font-medium text-muted-foreground">Confirm New Password</Label>
                  <Input
                    id="cfpw"
                    type="password"
                    value={confirmPw}
                    onChange={(e) => setConfirmPw(e.target.value)}
                    className="rounded-xl"
                  />
                </div>
                <div className="pt-1">
                  <Button
                    onClick={changePassword}
                    disabled={!curPw || !newPw}
                    className="w-full sm:w-auto px-5 h-10 rounded-xl font-bold shadow-sm"
                  >
                    Update Password
                  </Button>
                </div>
              </div>

              {/* Windows Hello */}
              <div className="rounded-xl border border-border/70 bg-card p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <Fingerprint className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                    <div>
                      <div className="text-sm font-bold text-foreground">Windows Hello Biometrics</div>
                      <div className="text-xs text-muted-foreground">
                        {bioAvailable
                          ? "Unlock with fingerprint, facial recognition, or Windows PIN."
                          : bioReasonText(bioReason)}
                      </div>
                    </div>
                  </div>
                  <Switch
                    checked={bioEnabled}
                    disabled={!bioAvailable || bioBusy}
                    onCheckedChange={toggleBiometric}
                  />
                </div>
                {!bioAvailable && bioReasonHint(bioReason) && (
                  <p className="mt-2.5 rounded-xl bg-muted/40 p-2.5 text-xs text-muted-foreground">
                    {bioReasonHint(bioReason)}
                  </p>
                )}
              </div>

              {/* Delete Vault Danger Box */}
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 space-y-2.5">
                <Label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-destructive">
                  <Trash2 className="h-4 w-4" /> Danger Zone
                </Label>
                <p className="text-xs text-muted-foreground">
                  Permanently destroy this vault and all encrypted records stored within it.
                </p>
                <div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setShowDelete(true)}
                    className="w-full sm:w-auto px-4 h-9 rounded-xl font-bold shadow-sm"
                  >
                    <Trash2 className="h-4 w-4" /> Delete Vault
                  </Button>
                </div>
              </div>
            </div>
          )}

          {tab === "data" && (
            <div className="space-y-4">
              {/* Backup & Restore Box */}
              <div className="rounded-xl border border-border/70 bg-card p-4 space-y-3">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Encrypted Backup (.rovault)
                </Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <Button variant="outline" onClick={exportEncrypted} className="rounded-xl h-10">
                    <Download className="h-4 w-4" /> Export Backup
                  </Button>
                  <Button variant="outline" onClick={importEncryptedData} className="rounded-xl h-10">
                    <Upload className="h-4 w-4" /> Restore Backup
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Encrypted backups restore the vault directly. Unlock with the original password or recovery key.
                </p>
              </div>

              {/* Plaintext Migration Box */}
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
                <Label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                  <ShieldAlert className="h-4 w-4" /> External Migration (JSON)
                </Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <Button variant="outline" onClick={importData} className="rounded-xl h-10">
                    <Upload className="h-4 w-4" /> Import JSON
                  </Button>
                  <Button variant="destructive" onClick={exportPlaintext} className="rounded-xl h-10">
                    <Download className="h-4 w-4" /> Export Plaintext
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Only for migrating out to third-party tools. Plaintext files are readable by anyone.
                </p>
              </div>
            </div>
          )}

          {tab === "updates" && (
            <div className="space-y-4">
              {/* Version & Status Card */}
              <div className="rounded-xl border border-border/80 bg-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Installed Version</div>
                    <div className="text-lg font-bold text-foreground mt-0.5">ROVault v0.1.0</div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => checkForAppUpdates(setUpdateState)}
                    disabled={updateState.status === "checking" || updateState.status === "downloading"}
                    className="rounded-xl gap-2 h-9 text-xs"
                  >
                    <RefreshCw className={cn("h-3.5 w-3.5", updateState.status === "checking" && "animate-spin")} />
                    <span>{updateState.status === "checking" ? "Checking…" : "Check for Updates"}</span>
                  </Button>
                </div>

                {/* State: Up to date */}
                {updateState.status === "up-to-date" && (
                  <div className="flex items-center gap-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    <span>You are running the latest secure version of ROVault.</span>
                  </div>
                )}

                {/* State: Checking */}
                {updateState.status === "checking" && (
                  <div className="flex items-center gap-2.5 rounded-lg bg-muted/40 border border-border/60 p-3 text-xs text-muted-foreground">
                    <RefreshCw className="h-4 w-4 shrink-0 animate-spin text-primary" />
                    <span>Checking for new cryptographic releases on GitHub…</span>
                  </div>
                )}

                {/* State: Update Available */}
                {updateState.status === "available" && (
                  <div className="rounded-lg bg-primary/10 border border-primary/20 p-3.5 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-primary shrink-0" />
                        <div>
                          <div className="text-xs font-bold text-foreground">New Version Available</div>
                          <div className="text-sm font-black text-primary">v{updateState.version}</div>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => installUpdate(setUpdateState)}
                        className="rounded-xl font-semibold gap-1.5 h-8 text-xs shadow-sm"
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span>Install & Restart</span>
                      </Button>
                    </div>
                    {updateState.body && (
                      <p className="text-[11px] text-muted-foreground whitespace-pre-line border-t border-border/40 pt-2">
                        {updateState.body}
                      </p>
                    )}
                  </div>
                )}

                {/* State: Downloading */}
                {updateState.status === "downloading" && (
                  <div className="rounded-lg bg-muted/40 border border-border/60 p-3.5 space-y-2">
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span>Downloading Update…</span>
                      <span>{updateState.progress}%</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all duration-300"
                        style={{ width: `${updateState.progress}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* State: Error */}
                {updateState.status === "error" && (
                  <div className="flex items-start gap-2.5 rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-xs text-destructive">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold">Update Check Notice</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {updateState.message.includes("404") || updateState.message.includes("release")
                          ? "No remote releases published yet on GitHub. When you publish a release, updates will be verified and downloaded here automatically."
                          : updateState.message}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>

      {/* Delete-vault confirmation */}
      <Dialog open={showDelete} onOpenChange={(o) => !o && setShowDelete(false)}>
        <DialogContent className="rounded-2xl border border-destructive/40 bg-card p-6 shadow-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-destructive">Confirm Vault Deletion</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              This action is permanent and cannot be undone. Enter your master password to verify.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <Label htmlFor="delvpw" className="text-xs font-bold text-muted-foreground">Master Password</Label>
            <Input
              id="delvpw"
              type="password"
              value={deletePw}
              onChange={(e) => setDeletePw(e.target.value)}
              autoFocus
              className="rounded-xl"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowDelete(false)} className="rounded-xl">
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDeleteVault}
              disabled={deleteBusy || !deletePw}
              className="rounded-xl font-bold"
            >
              {deleteBusy ? "Deleting…" : "Permanently Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}

export function getAutolockMinutes(): number {
  return Number(localStorage.getItem(AUTOLOCK_KEY)) || 5;
}

/** Short status line for the Hello toggle. */
function bioReasonText(reason: string): string {
  switch (reason) {
    case "device_not_present":
      return "No Windows Hello hardware/PIN found on this device.";
    case "not_configured":
      return "Windows Hello isn't set up for your account yet.";
    case "disabled_by_policy":
      return "Windows Hello is disabled by a system/organization policy.";
    case "device_busy":
      return "The Hello device is busy — try again in a moment.";
    case "not_windows":
      return "Only available on Windows.";
    default:
      if (reason.startsWith("error:")) return "Couldn't query Windows Hello.";
      return "Not available on this device.";
  }
}

/** Actionable hint on HOW to enable it. */
function bioReasonHint(reason: string): string {
  switch (reason) {
    case "not_configured":
    case "device_not_present":
      return "Set it up in Windows Settings → Accounts → Sign-in options → add a PIN, fingerprint, or face. At minimum a Windows Hello PIN is required — then reopen this dialog.";
    case "disabled_by_policy":
      return "A group/organization policy is blocking Windows Hello. You'll need admin/IT to allow it, or keep using your master password + recovery key.";
    case "device_busy":
      return "Close any other app using the sensor and try again.";
    default:
      return "";
  }
}

