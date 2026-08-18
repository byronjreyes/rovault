import { useEffect, useState, useRef } from "react";
import { api } from "@/lib/api";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Copy, ShieldCheck } from "lucide-react";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/utils";

/** Live TOTP 6-digit code with countdown ring, refreshing every second. */
export function TotpDisplay({ secret }: { secret: string }) {
  const toast = useToast();
  const [code, setCode] = useState("------");
  const [remaining, setRemaining] = useState(30);
  const [valid, setValid] = useState(true);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      try {
        const r = await api.totpCode(secret);
        if (!cancelled) {
          setCode(r.code);
          setRemaining(r.seconds_remaining);
          setValid(true);
        }
      } catch {
        if (!cancelled) setValid(false);
      }
    }
    tick();
    timer.current = setInterval(tick, 1000);
    return () => {
      cancelled = true;
      if (timer.current) clearInterval(timer.current);
    };
  }, [secret]);

  if (!valid) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
        <ShieldCheck className="h-4 w-4" /> Invalid 2FA secret
      </div>
    );
  }

  const pct = (remaining / 30) * 100;
  const isUrgent = remaining <= 5;

  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-border/70 bg-muted/40 px-3 py-2 transition-all">
      <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          2FA / TOTP
        </div>
        <div className="font-mono text-sm font-bold tracking-widest text-foreground">
          {code.slice(0, 3)} {code.slice(3)}
        </div>
      </div>
      <div
        className="relative h-6 w-6 shrink-0"
        title={`${remaining}s remaining`}
        aria-label={`${remaining} seconds remaining`}
      >
        <svg viewBox="0 0 36 36" className="h-6 w-6 -rotate-90">
          <circle
            cx="18"
            cy="18"
            r="15"
            fill="none"
            stroke="hsl(var(--border))"
            strokeWidth="3.5"
          />
          <circle
            cx="18"
            cy="18"
            r="15"
            fill="none"
            stroke={isUrgent ? "hsl(var(--destructive))" : "hsl(var(--primary))"}
            strokeWidth="3.5"
            strokeDasharray={`${(pct / 100) * 94.2} 94.2`}
            className="transition-all duration-500 ease-linear"
          />
        </svg>
        <span
          className={cn(
            "absolute inset-0 flex items-center justify-center font-mono text-[9px] font-bold",
            isUrgent ? "text-destructive" : "text-foreground"
          )}
        >
          {remaining}
        </span>
      </div>
      <button
        onClick={async () => {
          await writeText(code);
          toast("2FA code copied", "success");
        }}
        className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-95"
        aria-label="Copy 2FA code"
      >
        <Copy className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
