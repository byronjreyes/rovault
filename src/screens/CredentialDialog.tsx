import { useEffect, useState } from "react";
import { type Credential, emptyCredential } from "@/lib/api";
import { generatePassword, passwordStrength } from "@/lib/password";
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
import { Textarea } from "@/components/ui/textarea";
import { Eye, EyeOff, RefreshCw, Star, History } from "lucide-react";
import { ProviderIcon } from "@/components/ProviderIcon";
import { cn } from "@/lib/utils";

const CATEGORIES = ["Social", "Email", "Banking", "Work", "Shopping", "Other"];

export function CredentialDialog({
  open,
  initial,
  onClose,
  onSave,
}: {
  open: boolean;
  initial: Credential | null;
  onClose: () => void;
  onSave: (c: Credential) => Promise<void>;
}) {
  const [form, setForm] = useState<Credential>(emptyCredential());
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(initial ? { ...initial } : emptyCredential());
      setShow(false);
    }
  }, [open, initial]);

  const set = (k: keyof Credential, v: string | boolean) =>
    setForm((f) => ({ ...f, [k]: v }));

  const strength = passwordStrength(form.password);

  async function handleSave() {
    if (!form.provider.trim()) return;
    setBusy(true);
    try {
      await onSave(form);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] flex flex-col rounded-2xl border border-border/80 bg-card p-6 shadow-2xl sm:max-w-lg">
        <DialogHeader className="shrink-0 pb-1">
          <div className="flex items-center gap-3">
            <ProviderIcon name={form.provider || "ROVault"} url={form.url} size="md" />
            <div>
              <DialogTitle className="text-xl font-bold text-foreground">
                {initial ? `Edit ${form.provider || "Credential"}` : "Add New Credential"}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                {initial ? `Update account details for ${form.provider || "this service"}.` : "Save a new account credential to your vault."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-1.5 space-y-3.5 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="provider" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Provider / Service *
            </Label>
            <Input
              id="provider"
              value={form.provider}
              onChange={(e) => set("provider", e.target.value)}
              placeholder="e.g. GitHub, Google, Netflix"
              autoFocus
              className="rounded-xl font-medium"
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="username" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Username / Email
            </Label>
            <Input
              id="username"
              value={form.username}
              onChange={(e) => set("username", e.target.value)}
              placeholder="you@domain.com"
              className="rounded-xl font-medium"
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="password" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Password
            </Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="password"
                  type={show ? "text" : "password"}
                  value={form.password}
                  onChange={(e) => set("password", e.target.value)}
                  className="pr-10 font-mono text-sm rounded-xl"
                  placeholder="••••••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
                  aria-label={show ? "Hide" : "Show"}
                >
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                title="Generate strong password"
                onClick={() => {
                  set("password", generatePassword(20));
                  setShow(true);
                }}
                className="rounded-xl shrink-0 h-10 w-10 border-border/80"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
            {form.password && (
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="category" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Category
              </Label>
              <select
                id="category"
                value={form.category}
                onChange={(e) => set("category", e.target.value)}
                className="flex h-10 w-full rounded-xl border border-input bg-background/80 px-3 py-2 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Uncategorized</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="url" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Website URL
              </Label>
              <Input
                id="url"
                value={form.url}
                onChange={(e) => set("url", e.target.value)}
                placeholder="https://..."
                className="rounded-xl"
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="notes" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Secure Notes
            </Label>
            <Textarea
              id="notes"
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Recovery codes, security pins, or custom notes"
              className="rounded-xl resize-none text-sm"
              rows={2}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="totp" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              2FA / TOTP Secret (optional)
            </Label>
            <Input
              id="totp"
              value={form.totp_secret}
              onChange={(e) => set("totp_secret", e.target.value)}
              placeholder="JBSWY3DPEHPK3PXP"
              className="rounded-xl font-mono text-sm uppercase"
            />
            <p className="text-[11px] text-muted-foreground">
              Paste the Base32 setup key. ROVault generates live 6-digit codes automatically.
            </p>
          </div>

          {form.history && form.history.length > 0 && (
            <div className="grid gap-1.5">
              <Label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <History className="h-3.5 w-3.5" /> Password History
              </Label>
              <div className="max-h-24 space-y-1 overflow-y-auto rounded-xl border border-border/60 bg-muted/30 p-2.5">
                {[...form.history].reverse().map((h, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-2 text-xs"
                  >
                    <code className="truncate font-mono text-muted-foreground">
                      {h.password}
                    </code>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {new Date(h.changed_at * 1000).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => set("favorite", !form.favorite)}
            className="flex items-center gap-2 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground pt-1"
          >
            <Star
              className={cn(
                "h-4 w-4 transition-transform",
                form.favorite ? "fill-amber-400 text-amber-400 scale-110" : "text-muted-foreground"
              )}
            />
            {form.favorite ? "Favorited in quick access" : "Mark as favorite"}
          </button>
        </div>

        <DialogFooter className="gap-2 sm:gap-0 pt-3 border-t border-border/60 shrink-0">
          <Button variant="outline" onClick={onClose} className="rounded-xl">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={busy || !form.provider.trim()} className="rounded-xl shadow-sm">
            {busy ? "Saving…" : "Save Credential"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
