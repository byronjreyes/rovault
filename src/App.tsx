import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Onboarding } from "@/screens/Onboarding";
import { VaultPicker } from "@/screens/VaultPicker";
import { Dashboard } from "@/screens/Dashboard";
import { TitleBar } from "@/components/TitleBar";
import { Lock } from "lucide-react";

import { getCurrentWindow } from "@tauri-apps/api/window";

type Phase = "loading" | "picker" | "onboarding" | "unlocked";

export default function App() {
  const [phase, setPhase] = useState<Phase>("loading");

  async function boot() {
    try {
      const s = await api.sessionInfo();
      if (s.unlocked) {
        setPhase("unlocked");
        return;
      }
      const vaults = await api.listVaults();
      // No vaults at all -> straight into onboarding. Otherwise pick a vault.
      setPhase(vaults.length === 0 ? "onboarding" : "picker");
    } catch {
      setPhase("onboarding");
    }
  }

  useEffect(() => {
    try {
      const appWindow = getCurrentWindow();
      appWindow.center().catch(() => {});
    } catch {}
    boot();
  }, []);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground select-none">
      <TitleBar />
      <div className="flex-1 min-h-0 overflow-hidden relative flex flex-col">
        {phase === "loading" && (
          <div className="flex h-full w-full items-center justify-center bg-background">
            <div className="flex flex-col items-center gap-4 text-muted-foreground animate-fade-in">
              <div className="flex h-14 w-14 animate-pulse items-center justify-center rounded-3xl bg-primary text-primary-foreground shadow-glow-teal">
                <Lock className="h-7 w-7" />
              </div>
              <div className="flex flex-col items-center gap-1">
                <span className="text-base font-bold text-foreground">ROVault</span>
                <span className="text-xs font-medium text-muted-foreground">Initializing secure environment…</span>
              </div>
            </div>
          </div>
        )}

        {phase === "onboarding" && (
          <Onboarding
            onComplete={() => setPhase("unlocked")}
            onCancel={() => setPhase("picker")}
          />
        )}

        {phase === "picker" && (
          <VaultPicker
            onOpened={() => setPhase("unlocked")}
            onCreateNew={() => setPhase("onboarding")}
          />
        )}

        {phase === "unlocked" && <Dashboard onLock={() => boot()} />}
      </div>
    </div>
  );
}
