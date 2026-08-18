import { useState } from "react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { api } from "@/lib/api";
import { passwordStrength } from "@/lib/password";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/toast";
import {
  ShieldCheck,
  KeyRound,
  Copy,
  Download,
  Eye,
  EyeOff,
  Lock,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Step = "welcome" | "password" | "recovery" | "done";

export function Onboarding({
  onComplete,
  onCancel,
}: {
  onComplete: () => void;
  onCancel?: () => void;
}) {
  const toast = useToast();
  const [step, setStep] = useState<Step>("welcome");
  const [name, setName] = useState("ROVault");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const strength = passwordStrength(password);

  async function createVault() {
    if (password.length < 8) {
      toast("Master password must be at least 8 characters", "error");
      return;
    }
    if (password !== confirm) {
      toast("Passwords do not match", "error");
      return;
    }
    setBusy(true);
    try {
      const res = await api.createVault(name.trim() || "ROVault", password);
      setRecoveryKey(res.recovery_key);
      setStep("recovery");
    } catch (e) {
      toast(String(e), "error");
    } finally {
      setBusy(false);
    }
  }

  async function copyKey() {
    await writeText(recoveryKey);
    toast("Recovery key copied to clipboard", "success");
  }

  async function downloadKey() {
    try {
      const path = await save({
        defaultPath: "rovault-recovery-key.txt",
        filters: [{ name: "Text", extensions: ["txt"] }],
      });
      if (path) {
        await writeTextFile(
          path,
          `ROVault Recovery Key\nVault: ${name}\n\n${recoveryKey}\n\nKeep this somewhere safe and offline. It can unlock your vault if you forget your master password.`
        );
        toast("Recovery key saved", "success");
      }
    } catch (e) {
      toast(String(e), "error");
    }
  }

  return (
    <div className="relative flex h-full w-full items-center justify-center bg-background p-6 overflow-hidden">
      {/* Subtle Background Glow Orbs */}
      <div className="absolute -left-20 -top-20 h-72 w-72 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
      <div className="absolute -right-20 -bottom-20 h-72 w-72 rounded-full bg-brand-violet/10 blur-3xl pointer-events-none" />

      <div className="relative z-10 w-full max-w-md animate-fade-in">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-3xl bg-primary text-primary-foreground shadow-glow-teal">
            <Lock className="h-8 w-8" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">ROVault</h1>
          <p className="mt-1 text-xs font-semibold text-muted-foreground">
            Zero-Knowledge • Local Authenticated Encryption
          </p>
        </div>

        <div className="rounded-3xl border border-border/80 bg-card/90 p-6 shadow-2xl backdrop-blur-2xl">
          {step === "welcome" && (
            <div className="space-y-5">
              <div className="flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-3.5">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                  <h2 className="text-sm font-bold text-foreground">Initialize Secure Vault</h2>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    All credentials are encrypted locally with Argon2id + XChaCha20-Poly1305. Nothing ever touches the cloud.
                  </p>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="vault-name" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Vault Name
                </Label>
                <Input
                  id="vault-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Personal, Work, Primary Vault"
                  autoFocus
                  className="rounded-xl font-medium"
                />
              </div>
              <Button className="w-full rounded-2xl font-bold h-11 shadow-md" onClick={() => setStep("password")}>
                Continue <ArrowRight className="h-4 w-4" />
              </Button>
              {onCancel && (
                <button
                  type="button"
                  onClick={onCancel}
                  className="w-full text-center text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
                >
                  ← Back to vaults
                </button>
              )}
            </div>
          )}

          {step === "password" && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-2xl border border-border/70 bg-muted/30 p-3.5">
                <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                  <h2 className="text-sm font-bold text-foreground">Create Master Password</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    This password derives your encryption key. Choose at least 8 characters.
                  </p>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pw" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Master Password
                </Label>
                <div className="relative">
                  <Input
                    id="pw"
                    type={show ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoFocus
                    className="rounded-xl pr-10 font-mono text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShow((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
                    aria-label={show ? "Hide password" : "Show password"}
                  >
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {password && (
                  <div className="mt-1 flex items-center gap-2">
                    <div className="flex h-1.5 flex-1 gap-1.5 overflow-hidden rounded-full bg-muted">
                      {[0, 1, 2, 3].map((i) => (
                        <div
                          key={i}
                          className={cn(
                            "h-full flex-1 rounded-full transition-all duration-300",
                            i < strength.score &&
                              (strength.score <= 1
                                ? "bg-destructive shadow-sm"
                                : strength.score <= 2
                                ? "bg-amber-500 shadow-sm"
                                : "bg-emerald-500 shadow-sm")
                          )}
                        />
                      ))}
                    </div>
                    <span className="text-[11px] font-bold text-muted-foreground">
                      {strength.label}
                    </span>
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pw2" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Confirm Password
                </Label>
                <Input
                  id="pw2"
                  type={show ? "text" : "password"}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="rounded-xl font-mono text-sm"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  className="flex-1 rounded-xl"
                  onClick={() => setStep("welcome")}
                >
                  Back
                </Button>
                <Button className="flex-1 rounded-xl font-bold shadow-md" onClick={createVault} disabled={busy}>
                  {busy ? "Creating…" : "Create Vault"}
                </Button>
              </div>
            </div>
          )}

          {step === "recovery" && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3.5">
                <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
                <div>
                  <h2 className="text-sm font-bold text-foreground">One-Time Recovery Key</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Save this key offline. It is the only way to recover your vault if you ever forget your master password.
                  </p>
                </div>
              </div>
              <div className="rounded-2xl border border-dashed border-primary/40 bg-primary/5 p-4 text-center font-mono text-xs font-bold tracking-widest text-primary break-all">
                {recoveryKey}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" className="rounded-xl" onClick={copyKey}>
                  <Copy className="h-4 w-4" /> Copy Key
                </Button>
                <Button variant="outline" className="rounded-xl" onClick={downloadKey}>
                  <Download className="h-4 w-4" /> Download
                </Button>
              </div>
              <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-border/70 bg-muted/20 p-3 text-xs">
                <input
                  type="checkbox"
                  checked={saved}
                  onChange={(e) => setSaved(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]"
                />
                <span className="text-muted-foreground leading-relaxed">
                  I have saved my recovery key in a secure location.
                </span>
              </label>
              <Button
                className="w-full rounded-2xl font-bold h-11 shadow-md"
                disabled={!saved}
                onClick={() => setStep("done")}
              >
                Complete Setup
              </Button>
            </div>
          )}

          {step === "done" && (
            <div className="space-y-5 text-center py-2">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-500 shadow-glow-teal">
                <ShieldCheck className="h-7 w-7" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground">Vault Successfully Created</h2>
                <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
                  Your encrypted vault is primed and protected. Let's start organizing your credentials.
                </p>
              </div>
              <Button className="w-full rounded-2xl font-bold h-11 shadow-md" onClick={onComplete}>
                Open Dashboard <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
