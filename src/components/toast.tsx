import { createContext, useCallback, useContext, useState } from "react";
import { cn } from "@/lib/utils";
import { CheckCircle2, XCircle, Info } from "lucide-react";

type ToastKind = "success" | "error" | "info";
interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
}

const ToastContext = createContext<(m: string, k?: ToastKind) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((message: string, kind: ToastKind = "info") => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev, { id, message, kind }]);
    setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cn(
              "flex items-center gap-2 rounded-md border bg-card px-4 py-3 text-sm shadow-lg animate-fade-in",
              t.kind === "error" && "border-destructive/50 text-destructive",
              t.kind === "success" && "border-green-500/40"
            )}
          >
            {t.kind === "success" && (
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            )}
            {t.kind === "error" && <XCircle className="h-4 w-4" />}
            {t.kind === "info" && (
              <Info className="h-4 w-4 text-muted-foreground" />
            )}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
