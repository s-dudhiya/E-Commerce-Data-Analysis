import type { ReactNode } from "react";
import { CHART } from "@/data/palette";

/** Shared chart styling constants (hex mirrors of the warm design tokens). */
export const AXIS_TICK = { fontSize: 11, fill: "#64748B" } as const;
export const GRID_STROKE = "#E2E8F0";
export const AXIS_LINE = "#CBD5E1";

/** Standard animation properties for Recharts charts to ensure silky smooth transformations. */
export const CHART_ANIMATION = {
  isAnimationActive: true,
  animationDuration: 600,
  animationEasing: "ease-out",
} as const;

/** Reusable SVG defs providing clean, solid single-color fills for Recharts elements (no tacky multi-color gradients). */
export function ChartGradients() {
  return (
    <defs>
      {/* Primary Royal Iris Gradient & Aliases */}
      <linearGradient id="irisPrimaryGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#4338CA" stopOpacity={0.95} />
        <stop offset="100%" stopColor="#3730A3" stopOpacity={0.90} />
      </linearGradient>
      <linearGradient id="warmPrimaryGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#4338CA" stopOpacity={0.95} />
        <stop offset="100%" stopColor="#3730A3" stopOpacity={0.90} />
      </linearGradient>

      {/* Amazon Prussian Slate Gradient & Aliases */}
      <linearGradient id="amazonGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#1E293B" stopOpacity={0.95} />
        <stop offset="100%" stopColor="#0F172A" stopOpacity={0.90} />
      </linearGradient>
      <linearGradient id="warmAmazonGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#1E293B" stopOpacity={0.95} />
        <stop offset="100%" stopColor="#0F172A" stopOpacity={0.90} />
      </linearGradient>

      {/* Flipkart / Secondary Royal Iris & Amethyst Gradient & Aliases */}
      <linearGradient id="flipkartGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#4338CA" stopOpacity={0.95} />
        <stop offset="100%" stopColor="#4F46E5" stopOpacity={0.90} />
      </linearGradient>
      <linearGradient id="warmAmberGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#4338CA" stopOpacity={0.95} />
        <stop offset="100%" stopColor="#4F46E5" stopOpacity={0.90} />
      </linearGradient>
      <linearGradient id="amethystGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#7C3AED" stopOpacity={0.95} />
        <stop offset="100%" stopColor="#6D28D9" stopOpacity={0.90} />
      </linearGradient>

      {/* Sky Cobalt (Positive / Savings / Drops) */}
      <linearGradient id="cobaltGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#0284C7" stopOpacity={0.95} />
        <stop offset="100%" stopColor="#0369A1" stopOpacity={0.90} />
      </linearGradient>
      <linearGradient id="warmPositiveGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#0284C7" stopOpacity={0.95} />
        <stop offset="100%" stopColor="#0369A1" stopOpacity={0.90} />
      </linearGradient>

      {/* Berry Rose (Negative / Out of Stock / Cuts) */}
      <linearGradient id="roseGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#BE123C" stopOpacity={0.95} />
        <stop offset="100%" stopColor="#9F1239" stopOpacity={0.90} />
      </linearGradient>
      <linearGradient id="warmNegativeGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#BE123C" stopOpacity={0.95} />
        <stop offset="100%" stopColor="#9F1239" stopOpacity={0.90} />
      </linearGradient>

      {/* Area Fills for Time-series & Trajectory */}
      <linearGradient id="irisAreaFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#4338CA" stopOpacity={0.22} />
        <stop offset="100%" stopColor="#4338CA" stopOpacity={0.01} />
      </linearGradient>
      <linearGradient id="primaryAreaFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#4338CA" stopOpacity={0.22} />
        <stop offset="100%" stopColor="#4338CA" stopOpacity={0.01} />
      </linearGradient>
    </defs>
  );
}

export function TooltipShell({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white dark:bg-slate-900 p-3 text-xs shadow-xl transition-all duration-150 text-slate-900 dark:text-slate-100">
      {title && <div className="mb-2 font-semibold text-slate-900 dark:text-slate-100 border-b border-slate-100 dark:border-slate-800 pb-1">{title}</div>}
      {children}
    </div>
  );
}


export function ChartLegend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
      {items.map((i) => (
        <span
          key={i.label}
          className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <span
            className="h-2.5 w-2.5 rounded-full shadow-xs"
            style={{ backgroundColor: i.color }}
          />
          {i.label}
        </span>
      ))}
    </div>
  );
}

/** Small in-panel select used for chart-level controls with warm styling. */
export function MiniSelect({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  label?: string;
}) {
  return (
    <label className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 cursor-pointer rounded-lg border border-border bg-card px-2 text-[11px] font-medium text-foreground shadow-xs outline-none transition-colors hover:border-primary/50 focus:border-primary focus:ring-1 focus:ring-primary/40"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
