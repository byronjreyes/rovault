import { cn } from "@/lib/utils";

function Badge({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border border-border/60 bg-secondary/80 px-2.5 py-0.5 text-[11px] font-medium text-secondary-foreground transition-colors",
        className
      )}
      {...props}
    />
  );
}

export { Badge };
