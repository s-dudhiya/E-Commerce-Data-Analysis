import { useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  BarChart3,
  Boxes,
  Building2,
  CalendarDays,
  Database,
  GitCompareArrows,
  IndianRupee,
  LayoutDashboard,
  RotateCcw,
  Search,
  Star,
  Table2,
  X,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { COLLECTION_DATE, DATASET_TOTAL_ROWS, PRODUCTS } from "@/data/dataset";
import { useFilters } from "@/context/FiltersContext";
import { cn } from "@/lib/utils";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  badge?: string;
}

const NAV: NavItem[] = [
  { to: "/platform-comparison", label: "Product Dynamics", icon: CalendarDays },
  { to: "/", label: "Marketplace Overview", icon: LayoutDashboard },
  { to: "/explorer", label: "Catalog Explorer & Export", icon: Table2 },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { filters, setFilters, clearFilters, activeCount, filteredProducts } = useFilters();

  return (
    <div className="min-h-screen bg-[#f8f9fb] text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-50">
      {/* Top Navigation — 44px fixed bar */}
      <header className="sticky top-0 z-30 h-11 border-b border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex h-full max-w-[1440px] items-center justify-between px-4">
          {/* Left: Logo + Nav */}
          <div className="flex items-center gap-5">
            <Link to="/platform-comparison" className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-indigo-600 text-white">
                <BarChart3 className="h-3.5 w-3.5" strokeWidth={2.5} />
              </div>
              <span className="text-[13px] font-semibold tracking-tight text-slate-900 dark:text-white">MarketLens</span>
            </Link>

            <div className="h-4 w-px bg-slate-200 dark:bg-slate-700" />

            <nav className="flex items-center gap-0.5">
              {NAV.map((item) => {
                const active = pathname === item.to;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors",
                      active
                        ? "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white"
                        : "text-slate-500 hover:text-slate-800 hover:bg-slate-50 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800/60",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Right: Status + Tools */}
          <div className="flex items-center gap-3">
            {/* Warehouse indicator */}
            <div className="hidden items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 md:flex">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </span>
              <span className="font-mono font-medium">{COLLECTION_DATE || "Live"}</span>
              <span className="text-slate-300 dark:text-slate-600">|</span>
              <span className="font-mono">{DATASET_TOTAL_ROWS ? `${(DATASET_TOTAL_ROWS / 100000).toFixed(1)}L` : ""}</span>
            </div>

            {/* Platform filter for overview/explorer */}
            {pathname !== "/platform-comparison" && (
              <div className="flex items-center gap-2">
                <div className="relative w-40">
                  <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={filters.search}
                    onChange={(e) => setFilters({ search: e.target.value })}
                    placeholder="Quick search..."
                    className="h-7 rounded-md border-slate-200 bg-slate-50 pl-7 pr-6 text-[11px] text-slate-800 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  />
                  {filters.search && (
                    <button
                      onClick={() => setFilters({ search: "" })}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>

                {/* Amazon vs Flipkart Toggle (Without 'All' option) */}
                <div className="flex rounded-md border border-slate-200 bg-slate-50 p-px text-[11px] dark:border-slate-700 dark:bg-slate-800">
                  {(
                    [
                      { id: "Amazon", label: "Amazon" },
                      { id: "Flipkart", label: "Flipkart" },
                    ] as const
                  ).map((p) => {
                    const active = (filters.platform || "Amazon") === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setFilters({ platform: p.id })}
                        className={cn(
                          "rounded-[5px] px-2.5 py-0.5 font-medium transition-colors cursor-pointer",
                          active
                            ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white font-semibold"
                            : "text-slate-500 hover:text-slate-700 dark:text-slate-400",
                        )}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-[1440px] px-4 py-3">
        {children}
      </main>
    </div>
  );
}
