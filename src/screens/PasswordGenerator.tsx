import { useEffect, useState, useCallback } from "react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { generatePassword, passwordStrength } from "@/lib/password";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { RefreshCw, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A standalone generator you open from the dashboard to mint a password when
 * creating a new account elsewhere — copy it, use it, then save it as a
 * credential.
 */
export function PasswordGenerator({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const [length, setLength] = useState(20);
  const [upper, setUpper] = useState(true);
  const [lower, setLower] = useState(true);
  const [numbers, setNumbers] = useState(true);
  const [symbols, setSymbols] = useState(true);
  const [value, setValue] = useState("");
  const [copied, setCopied] = useState(false);

  const regen = useCallback(() => {
    setValue(generatePassword(length, { upper, lower, numbers, symbols }));
    setCopied(false);
  }, [length, upper, lower, numbers, symbols]);

  useEffect(() => {
    if (open) regen();
  }, [open, regen]);

  const strength = passwordStrength(value);

  async function copy() {
    if (!value) return;
    await writeText(value);
    setCopied(true);
    toast("Password copied — paste it into your new account", "success");
    setTimeout(async () => {
      try {
        await writeText("");
      } catch {
        /* ignore */
      }
    }, 20000);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-2xl border border-border/80 bg-card p-6 shadow-2xl sm:max-w-md">
        <DialogHeader className="pb-1">
          <DialogTitle className="text-xl font-bold text-foreground">Password Generator</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Generate ultra-secure, cryptographically random credentials for your accounts.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Output Display Box */}
          <div className="flex items-center gap-2 rounded-xl border border-border/80 bg-muted/40 p-3 shadow-inner">
            <code className="flex-1 break-all font-mono text-sm font-bold tracking-wide text-foreground">
              {value}
            </code>
            <Button
              variant="ghost"
              size="icon"
              onClick={regen}
              title="Regenerate"
              className="rounded-lg h-8 w-8 hover:bg-accent/80"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={copy}
              title="Copy"
              className="rounded-lg h-8 w-8 hover:bg-accent/80"
            >
              {copied ? (
                <Check className="h-4 w-4 text-emerald-500" />
              ) : (
                <Copy className="h-4 w-4 text-foreground" />
              )}
            </Button>
          </div>

          {/* Strength Bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              <span>Entropy & Strength</span>
              <span
                className={cn(
                  strength.score <= 1
                    ? "text-destructive"
                    : strength.score <= 2
                    ? "text-amber-500"
                    : "text-emerald-500"
                )}
              >
                {strength.label}
              </span>
            </div>
            <div className="flex h-1.5 w-full gap-1.5 overflow-hidden rounded-full bg-muted">
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
          </div>

          {/* Length Slider Box */}
          <div className="rounded-xl border border-border/70 bg-muted/20 p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Password Length
              </Label>
              <span className="font-mono text-xs font-bold text-foreground px-2 py-0.5 rounded-md bg-muted">
                {length} chars
              </span>
            </div>
            <input
              type="range"
              min={8}
              max={64}
              value={length}
              onChange={(e) => setLength(Number(e.target.value))}
              className="w-full accent-[hsl(var(--primary))] cursor-pointer h-1.5 bg-muted rounded-lg"
            />
          </div>

          {/* Character Options Grid */}
          <div className="grid grid-cols-2 gap-2">
            <Toggle label="Uppercase (A-Z)" checked={upper} onChange={setUpper} />
            <Toggle label="Lowercase (a-z)" checked={lower} onChange={setLower} />
            <Toggle label="Numbers (0-9)" checked={numbers} onChange={setNumbers} />
            <Toggle label="Symbols (!@#$)" checked={symbols} onChange={setSymbols} />
          </div>

          <Button className="w-full rounded-xl shadow-sm font-bold h-10" onClick={copy}>
            <Copy className="h-4 w-4" /> Copy Generated Password
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2 rounded-2xl border border-border/70 bg-muted/25 p-3 text-xs font-semibold cursor-pointer transition-all hover:bg-muted/40">
      <span className="text-foreground">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}
