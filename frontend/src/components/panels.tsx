import type { ReactNode } from "react";
import { SearchX, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFilters } from "@/context/FiltersContext";
import { cn } from "@/lib/utils";

export function KpiTile({
  label,
  title,
  value,
  sub,
  subtitle,
  icon: Icon,
  tone,
  accent,
}: {
  label?: string;
  title?: string;
  value: string;
  sub?: string;
  subtitle?: string;
  icon?: LucideIcon;
  tone?: "positive" | "negative" | "neutral";
  accent?: string;
}) {
  const displayLabel = label || title || "";
  const displaySub = sub || subtitle || "";

  return (
    <div className="group relative flex min-w-0 flex-col justify-between overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2.5 shadow-2xs transition-all duration-150 hover:border-slate-300">
      <div className="flex items-center justify-between gap-1.5">
        <span className="truncate text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {displayLabel}
        </span>
        {Icon && (
          <Icon className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500 shrink-0" strokeWidth={2} />
        )}
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-2">
        <div
          className={cn(
            "text-xl font-bold font-mono tabular-nums tracking-tight text-slate-800 dark:text-slate-100",
            tone === "positive" && "text-sky-700 dark:text-sky-400",
            tone === "negative" && "text-rose-700 dark:text-rose-400",
          )}
        >
          {value}
        </div>
        {displaySub && (
          <div className="truncate text-[11px] font-medium text-slate-500 dark:text-slate-400">
            {displaySub}
          </div>
        )}
      </div>
    </div>
  );
}

/** Executive multi-card KPI grid with clean modern compact spacing. */
export function KpiStrip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5", className)}>
      {children}
    </div>
  );
}

export function ChartPanel({
  title,
  description,
  controls,
  children,
  className,
}: {
  title: string;
  description?: string;
  controls?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "flex flex-col rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs",
        className,
      )}
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 px-5 py-3.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-primary" />
            <h2 className="text-[13px] font-bold tracking-tight text-slate-900 dark:text-slate-100">{title}</h2>
          </div>
          {description && (
            <p className="mt-0.5 pl-4 text-xs font-medium text-slate-500 dark:text-slate-400">{description}</p>
          )}
        </div>
        {controls && <div className="flex flex-wrap items-center gap-2">{controls}</div>}
      </header>
      <div className="flex-1 p-5">{children}</div>
    </section>
  );
}

export function EmptyState({
  title = "No products match the active filters",
  description = "Try loosening a filter or clearing everything to see the full sample dataset.",
}: {
  title?: string;
  description?: string;
}) {
  const { clearFilters, activeCount } = useFilters();
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border/80 bg-card/40 px-6 py-16 text-center backdrop-blur-xs">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/60 text-primary">
        <SearchX className="h-6 w-6" strokeWidth={1.75} />
      </div>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="max-w-sm text-xs text-muted-foreground">{description}</p>
      {activeCount > 0 && (
        <Button
          variant="outline"
          size="sm"
          className="mt-3 h-8 rounded-xl border-primary/30 px-4 text-xs font-medium transition-all hover:bg-primary hover:text-primary-foreground"
          onClick={clearFilters}
        >
          Clear all filters
        </Button>
      )}
    </div>
  );
}
