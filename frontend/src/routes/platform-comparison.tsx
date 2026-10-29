import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  History,
  Layers,
  RefreshCw,
  Search,
  Tag,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import {
  AXIS_LINE,
  AXIS_TICK,
  CHART_ANIMATION,
  ChartGradients,
  GRID_STROKE,
  TooltipShell,
} from "@/components/chart-utils";
import { EmptyState } from "@/components/panels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  fetchProductDynamics,
  fetchProductHistory,
  prefetchProductHistory,
  type ProductDynamicsPayload,
  type ProductHistoryPayload,
  type ProductMovementItem,
} from "@/data/source";
import {
  formatCurrency,
  formatNumber,
} from "@/lib/format";
import { cn } from "@/lib/utils";

type ChangeType = "all" | "price_drop" | "price_hike" | "out_of_stock" | "restocked";

export function ProductDynamicsPage() {
  const [platform, setPlatform] = useState<"amazon" | "flipkart">("amazon");
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedCompareDate, setSelectedCompareDate] = useState<string>("");
  const [changeType, setChangeType] = useState<ChangeType>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [sortBy, setSortBy] = useState("delta_abs");
  const [page, setPage] = useState(1);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const pageSize = 50;

  const [dynamicsData, setDynamicsData] = useState<ProductDynamicsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Inspector modal state
  const [inspectedProduct, setInspectedProduct] = useState<ProductMovementItem | null>(null);
  const [historyData, setHistoryData] = useState<ProductHistoryPayload | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Handle platform change
  const handlePlatformChange = (newPlatform: "amazon" | "flipkart") => {
    if (newPlatform === platform) return;
    setPlatform(newPlatform);
    setSelectedDate("");
    setSelectedCompareDate("");
    setPage(1);
  };

  const handleDateChange = (newDate: string) => {
    setSelectedDate(newDate);
    setSelectedCompareDate("");
    setPage(1);
  };

  const handleCompareDateChange = (newCompareDate: string) => {
    setSelectedCompareDate(newCompareDate);
    setPage(1);
  };

  const handleFilterChange = (newType: ChangeType) => {
    setChangeType(newType);
    setPage(1);
  };

  // Fetch product movements
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchProductDynamics({
      platform,
      snapshot_date: selectedDate || undefined,
      compare_date: selectedCompareDate || undefined,
      change_type: changeType,
      q: debouncedQuery || undefined,
      l1: selectedCategory !== "all" ? selectedCategory : undefined,
      sort: sortBy,
      page,
      page_size: pageSize,
    })
      .then((payload) => {
        if (cancelled) return;
        if (!payload) {
          setError("Failed to fetch product dynamics from the backend.");
          return;
        }
        setDynamicsData(payload);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Network error");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [platform, selectedDate, selectedCompareDate, changeType, debouncedQuery, selectedCategory, sortBy, page, refreshTrigger]);

  // Background prefetch top items so timeline modal opens instantaneously
  useEffect(() => {
    if (!dynamicsData?.items || dynamicsData.items.length === 0) return;
    const timer = setTimeout(() => {
      dynamicsData.items.slice(0, 10).forEach((item) => {
        prefetchProductHistory(item.platform, item.product_id);
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [dynamicsData?.items]);

  // Load product history when inspected
  useEffect(() => {
    if (!inspectedProduct) {
      setHistoryData(null);
      return;
    }
    let cancelled = false;
    setHistoryLoading(true);

    fetchProductHistory(inspectedProduct.platform, inspectedProduct.product_id)
      .then((data) => {
        if (!cancelled) {
          setHistoryData(data);
        }
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [inspectedProduct]);

  const kpis = dynamicsData?.kpis ?? {
    price_drops: 0,
    price_hikes: 0,
    out_of_stock: 0,
    restocked: 0,
    avg_price_drop: 0,
    avg_price_hike: 0,
    total_changes: 0,
  };

  const totalPages = Math.ceil((dynamicsData?.total_items ?? 0) / pageSize);

  const categories = useMemo(() => {
    const set = new Set<string>();
    dynamicsData?.items.forEach((item) => {
      if (item.category) set.add(item.category);
    });
    return Array.from(set).sort();
  }, [dynamicsData?.items]);

  const activeSnapshotDate = selectedDate || dynamicsData?.snapshot_date || "";

  return (
    <div className="space-y-2.5 animate-in fade-in duration-150">
      {/* Precision Analyst Command Deck */}
      <div className="rounded-md border border-slate-200 bg-white shadow-2xs dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
        {/* Tier 1: Platform Scope, Snapshot Selector & Global Status */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-slate-100 bg-slate-50/70 px-3 py-1.5 dark:border-slate-800 dark:bg-slate-800/50">
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Segmented Platform Toggle */}
            <div className="inline-flex rounded border border-slate-200 bg-white p-0.5 text-xs shadow-2xs dark:border-slate-700 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => handlePlatformChange("amazon")}
                className={cn(
                  "flex items-center gap-1.5 rounded px-2.5 py-0.5 text-xs font-semibold transition-all cursor-pointer",
                  platform === "amazon"
                    ? "bg-slate-800 text-white shadow-xs dark:bg-slate-700 dark:text-white"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                )}
              >
                <span>Amazon</span>
                <span className={cn(
                  "rounded px-1 py-0.2 font-mono text-[9px] uppercase tracking-wide",
                  platform === "amazon" ? "bg-slate-700 text-slate-200" : "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400"
                )}>
                  Internal
                </span>
              </button>

              <button
                type="button"
                onClick={() => handlePlatformChange("flipkart")}
                className={cn(
                  "flex items-center gap-1.5 rounded px-2.5 py-0.5 text-xs font-semibold transition-all cursor-pointer",
                  platform === "flipkart"
                    ? "bg-indigo-700 text-white shadow-xs dark:bg-indigo-600 dark:text-white"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                )}
              >
                <span>Flipkart</span>
                <span className={cn(
                  "rounded px-1 py-0.2 font-mono text-[9px] uppercase tracking-wide",
                  platform === "flipkart" ? "bg-indigo-600 text-indigo-100" : "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400"
                )}>
                  Internal
                </span>
              </button>
            </div>

            <div className="h-3.5 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block" />

            {/* Snapshot Day Selector */}
            <div className="flex items-center gap-1.5 text-xs">
              <div className="flex items-center gap-1 font-medium text-slate-600 dark:text-slate-400">
                <Calendar className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                <span className="font-semibold text-slate-700 dark:text-slate-300">Snapshot:</span>
              </div>

              {dynamicsData?.available_dates && dynamicsData.available_dates.length > 0 ? (
                <select
                  value={activeSnapshotDate}
                  onChange={(e) => handleDateChange(e.target.value)}
                  className="h-6.5 rounded border border-slate-200 bg-white px-2 font-mono text-xs font-semibold text-slate-800 shadow-2xs outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 cursor-pointer"
                >
                  {dynamicsData.available_dates.map((d, idx) => (
                    <option key={d} value={d}>
                      {d} {idx === 0 ? "(Latest Scrape)" : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                  {selectedDate || "Loading dates..."}
                </span>
              )}

              {dynamicsData?.available_dates && dynamicsData.available_dates.length > 1 && (
                <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                  <ArrowRight className="h-3 w-3 text-slate-400" />
                  <span className="font-semibold text-slate-600 dark:text-slate-400">vs:</span>
                  <select
                    value={selectedCompareDate || dynamicsData.prev_date || ""}
                    onChange={(e) => handleCompareDateChange(e.target.value)}
                    className="h-6.5 rounded border border-slate-200 bg-white px-2 font-mono text-xs font-semibold text-slate-800 shadow-2xs outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 cursor-pointer"
                    title="Select date to compare against (defaults to prior snapshot day)"
                  >
                    {dynamicsData.available_dates
                      .filter((d) => d !== activeSnapshotDate)
                      .map((d) => {
                        const isDefaultPrev = d === dynamicsData.prev_date;
                        return (
                          <option key={d} value={d}>
                            {d} {isDefaultPrev && !selectedCompareDate ? "(Previous Day)" : ""}
                          </option>
                        );
                      })}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Right: Counter badge & refresh button */}
          <div className="flex items-center gap-2">
            {dynamicsData && (
              <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                {formatNumber(dynamicsData.total_items)} events
              </span>
            )}

            <button
              type="button"
              onClick={() => setRefreshTrigger((prev) => prev + 1)}
              title="Refresh product dynamics"
              className="flex h-6.5 w-6.5 items-center justify-center rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 cursor-pointer transition-colors"
            >
              <RefreshCw className={cn("h-3 w-3", loading && "animate-spin text-indigo-600")} />
            </button>
          </div>
        </div>

        {/* Tier 2: Filter Tabs, Search, Category & Sort */}
        <div className="flex flex-col gap-2 p-2.5 sm:flex-row sm:items-center sm:justify-between">
          {/* Change Type Filter Pills */}
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => handleFilterChange("all")}
              className={cn(
                "rounded px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer border",
                changeType === "all"
                  ? "bg-slate-800 text-white border-slate-800 dark:bg-slate-700 dark:border-slate-700 shadow-2xs"
                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300"
              )}
            >
              All ({formatNumber(kpis.total_changes)})
            </button>

            <button
              type="button"
              onClick={() => handleFilterChange("price_drop")}
              className={cn(
                "flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold transition-all cursor-pointer border",
                changeType === "price_drop"
                  ? "bg-sky-700 text-white border-sky-700 shadow-2xs"
                  : "bg-sky-50 text-sky-800 border-sky-200 hover:bg-sky-100 dark:bg-sky-950 dark:border-sky-800 dark:text-sky-300"
              )}
            >
              <TrendingDown className="h-3 w-3" />
              <span>Price Drops ({formatNumber(kpis.price_drops)})</span>
            </button>

            <button
              type="button"
              onClick={() => handleFilterChange("price_hike")}
              className={cn(
                "flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold transition-all cursor-pointer border",
                changeType === "price_hike"
                  ? "bg-violet-700 text-white border-violet-700 shadow-2xs"
                  : "bg-violet-50 text-violet-800 border-violet-200 hover:bg-violet-100 dark:bg-violet-950 dark:border-violet-800 dark:text-violet-300"
              )}
            >
              <TrendingUp className="h-3 w-3" />
              <span>Price Hikes ({formatNumber(kpis.price_hikes)})</span>
            </button>

            <button
              type="button"
              onClick={() => handleFilterChange("out_of_stock")}
              className={cn(
                "flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold transition-all cursor-pointer border",
                changeType === "out_of_stock"
                  ? "bg-rose-700 text-white border-rose-700 shadow-2xs"
                  : "bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100 dark:bg-rose-950 dark:border-rose-800 dark:text-rose-300"
              )}
            >
              <AlertTriangle className="h-3 w-3" />
              <span>Out of Stock ({formatNumber(kpis.out_of_stock)})</span>
            </button>

            <button
              type="button"
              onClick={() => handleFilterChange("restocked")}
              className={cn(
                "flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold transition-all cursor-pointer border",
                changeType === "restocked"
                  ? "bg-teal-700 text-white border-teal-700 shadow-2xs"
                  : "bg-teal-50 text-teal-800 border-teal-200 hover:bg-teal-100 dark:bg-teal-950 dark:border-teal-800 dark:text-teal-300"
              )}
            >
              <CheckCircle2 className="h-3 w-3" />
              <span>Restocked ({formatNumber(kpis.restocked)})</span>
            </button>
          </div>

          {/* Right: Search, Category, Sort */}
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="relative min-w-[190px] sm:min-w-[220px]">
              <Search className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
              <Input
                placeholder="Filter product name or brand..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-7 rounded border-slate-200 bg-slate-50/70 pl-7 pr-6 text-xs text-slate-900 transition-all focus:border-indigo-600 focus:bg-white focus:ring-1 focus:ring-indigo-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                  aria-label="Clear search"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {categories.length > 0 && (
              <select
                value={selectedCategory}
                onChange={(e) => {
                  setSelectedCategory(e.target.value);
                  setPage(1);
                }}
                className="h-7 rounded border border-slate-200 bg-white px-2 text-xs font-medium text-slate-800 shadow-2xs outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
              >
                <option value="all">All Categories</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            )}

            <div className="flex items-center gap-1 text-xs">
              <span className="text-slate-500 dark:text-slate-400">Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="h-7 rounded border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-800 shadow-2xs outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
              >
                <option value="delta_abs">Largest Change (₹)</option>
                <option value="delta_pct">Largest Change (%)</option>
                <option value="price">Current Price</option>
                <option value="product_name">Product Name</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Ultra-Sleek Precision KPI Strip (High density, no bulky margins) */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {/* KPI 1: Price Drops */}
        <div className="rounded-md border border-slate-200 bg-white px-3 py-2 shadow-2xs dark:border-slate-800 dark:bg-slate-900 transition-colors">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            <span>Price Drops</span>
            <TrendingDown className="h-3.5 w-3.5 text-sky-600" />
          </div>
          <div className="mt-0.5 flex items-baseline justify-between gap-1">
            <span className="font-mono text-lg font-bold text-sky-700 dark:text-sky-400">
              {formatNumber(kpis.price_drops)}
            </span>
            <span className="truncate text-[10px] font-medium text-slate-500 dark:text-slate-400">
              {kpis.avg_price_drop > 0 ? `Avg: ${formatCurrency(kpis.avg_price_drop)}` : "Rate cuts"}
            </span>
          </div>
        </div>

        {/* KPI 2: Price Hikes */}
        <div className="rounded-md border border-slate-200 bg-white px-3 py-2 shadow-2xs dark:border-slate-800 dark:bg-slate-900 transition-colors">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            <span>Price Hikes</span>
            <TrendingUp className="h-3.5 w-3.5 text-violet-600" />
          </div>
          <div className="mt-0.5 flex items-baseline justify-between gap-1">
            <span className="font-mono text-lg font-bold text-violet-700 dark:text-violet-400">
              {formatNumber(kpis.price_hikes)}
            </span>
            <span className="truncate text-[10px] font-medium text-slate-500 dark:text-slate-400">
              {kpis.avg_price_hike > 0 ? `Avg: +${formatCurrency(kpis.avg_price_hike)}` : "Rate increases"}
            </span>
          </div>
        </div>

        {/* KPI 3: Out of Stock */}
        <div className="rounded-md border border-slate-200 bg-white px-3 py-2 shadow-2xs dark:border-slate-800 dark:bg-slate-900 transition-colors">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            <span>Went Out of Stock</span>
            <AlertTriangle className="h-3.5 w-3.5 text-rose-600" />
          </div>
          <div className="mt-0.5 flex items-baseline justify-between gap-1">
            <span className="font-mono text-lg font-bold text-rose-700 dark:text-rose-400">
              {formatNumber(kpis.out_of_stock)}
            </span>
            <span className="truncate text-[10px] font-medium text-slate-500 dark:text-slate-400">
              Depleted today
            </span>
          </div>
        </div>

        {/* KPI 4: Restocked */}
        <div className="rounded-md border border-slate-200 bg-white px-3 py-2 shadow-2xs dark:border-slate-800 dark:bg-slate-900 transition-colors">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            <span>Restocked</span>
            <CheckCircle2 className="h-3.5 w-3.5 text-teal-600" />
          </div>
          <div className="mt-0.5 flex items-baseline justify-between gap-1">
            <span className="font-mono text-lg font-bold text-teal-700 dark:text-teal-400">
              {formatNumber(kpis.restocked)}
            </span>
            <span className="truncate text-[10px] font-medium text-slate-500 dark:text-slate-400">
              Returned to stock
            </span>
          </div>
        </div>

        {/* KPI 5: Total Daily Shifts */}
        <div className="rounded-md border border-slate-200 bg-white px-3 py-2 shadow-2xs dark:border-slate-800 dark:bg-slate-900 transition-colors">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            <span>Total Daily Shifts</span>
            <Layers className="h-3.5 w-3.5 text-slate-500" />
          </div>
          <div className="mt-0.5 flex items-baseline justify-between gap-1">
            <span className="font-mono text-lg font-bold text-slate-900 dark:text-slate-100">
              {formatNumber(kpis.total_changes)}
            </span>
            <span className="truncate text-[10px] font-medium text-slate-500 dark:text-slate-400">
              Tracked events
            </span>
          </div>
        </div>
      </div>

      {/* Main Product Dynamics Table Card */}
      <div className="rounded-md border border-slate-200 bg-white shadow-2xs dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
        {/* Table Toolbar Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/70 px-3 py-2 dark:border-slate-800 dark:bg-slate-800/40">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-600 dark:bg-indigo-400" />
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
              Product Day-to-Day Rate & Stock Movements
            </h2>
            <span className="text-slate-300 dark:text-slate-700">•</span>
            <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
              {platform.toUpperCase()} ({dynamicsData?.snapshot_date ?? "today"} vs {dynamicsData?.prev_date ?? "yesterday"})
            </span>
          </div>

          {dynamicsData && dynamicsData.total_items > 0 && (
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Showing{" "}
              <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                {(page - 1) * pageSize + 1}
              </span>
              -
              <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                {Math.min(page * pageSize, dynamicsData.total_items)}
              </span>{" "}
              of{" "}
              <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                {formatNumber(dynamicsData.total_items)}
              </span>
            </div>
          )}
        </div>

        {/* Content Area */}
        {loading ? (
          <div className="flex h-56 flex-col items-center justify-center gap-2">
            <RefreshCw className="h-5 w-5 animate-spin text-indigo-600 dark:text-indigo-400" />
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Calculating rate & stock shifts from warehouse...</p>
          </div>
        ) : error ? (
          <div className="p-8">
            <EmptyState
              title="Unable to load product movements"
              description={error}
            />
          </div>
        ) : !dynamicsData?.items || dynamicsData.items.length === 0 ? (
          <div className="p-8">
            <EmptyState
              title="No product shifts match your filters"
              description="Try switching the change filter pill or searching for another keyword."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-200 bg-slate-50/80 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-800/60">
                  <TableHead className="w-[42%] text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 py-2">
                    Product & Brand
                  </TableHead>
                  <TableHead className="w-[12%] text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 py-2">
                    Dates
                  </TableHead>
                  <TableHead className="w-[20%] text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 py-2">
                    Price Movement
                  </TableHead>
                  <TableHead className="w-[16%] text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 py-2">
                    Stock Status
                  </TableHead>
                  <TableHead className="w-[10%] text-right text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 py-2">
                    Timeline
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dynamicsData.items.map((item) => {
                  const isDrop = (item.price_delta ?? 0) < 0;
                  const wentOut = item.prev_sold_out === false && item.sold_out === true;
                  const becameRestocked = item.prev_sold_out === true && item.sold_out === false;

                  return (
                    <TableRow
                      key={`${item.product_id}-${item.snapshot_date}`}
                      className="border-slate-100 hover:bg-slate-50/70 transition-colors dark:border-slate-800 dark:hover:bg-slate-800/40"
                    >
                      {/* Product details */}
                      <TableCell className="align-middle py-2">
                        <div className="flex items-center gap-2">
                          {item.image_url ? (
                            <img
                              src={item.image_url}
                              alt={item.product_name}
                              className="h-8 w-8 shrink-0 rounded border border-slate-200 object-contain p-0.5 bg-white dark:border-slate-700"
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = "none";
                              }}
                            />
                          ) : (
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-700 dark:bg-slate-800">
                              <Tag className="h-3 w-3" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p
                              className="line-clamp-1 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer"
                              title={item.product_name}
                              onClick={() => setInspectedProduct(item)}
                            >
                              {item.product_name}
                            </p>
                            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
                              {item.brand && (
                                <span className="font-semibold text-slate-700 dark:text-slate-300">
                                  {item.brand}
                                </span>
                              )}
                              {item.category && (
                                <Badge
                                  variant="outline"
                                  className="h-3.5 border-slate-200 px-1 text-[9px] text-slate-600 dark:border-slate-700 dark:text-slate-300 font-normal"
                                >
                                  {item.category}
                                </Badge>
                              )}
                              <span className="font-mono text-slate-400">
                                ID: {item.product_id}
                              </span>
                            </div>
                          </div>
                        </div>
                      </TableCell>

                      {/* Dates */}
                      <TableCell className="align-middle text-xs text-slate-600 dark:text-slate-400 font-mono py-2">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[10px] text-slate-400 line-through">
                            {item.prev_date ?? "Prior"}
                          </span>
                          <span className="text-[11px] font-semibold text-slate-800 dark:text-slate-200">
                            {item.snapshot_date}
                          </span>
                        </div>
                      </TableCell>

                      {/* Price Movement */}
                      <TableCell className="align-middle py-2">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1.5 text-xs font-mono">
                            {item.prev_price !== null && (
                              <span className="text-slate-400 line-through text-[11px]">
                                {formatCurrency(item.prev_price)}
                              </span>
                            )}
                            <ArrowRight className="h-2.5 w-2.5 text-slate-400" />
                            <span className="font-bold text-slate-900 dark:text-slate-50">
                              {item.price !== null ? formatCurrency(item.price) : "N/A"}
                            </span>
                          </div>

                          {/* Delta Badge */}
                          {item.price_delta !== null && item.price_delta !== 0 && (
                            <div className="flex items-center gap-1">
                              <span
                                className={cn(
                                  "inline-flex items-center gap-0.5 rounded px-1.5 py-0.2 font-mono text-[10px] font-bold border",
                                  isDrop
                                    ? "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-300"
                                    : "border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-300"
                                )}
                              >
                                {isDrop ? (
                                  <TrendingDown className="h-2.5 w-2.5 text-sky-600" />
                                ) : (
                                  <TrendingUp className="h-2.5 w-2.5 text-violet-600" />
                                )}
                                <span>
                                  {isDrop ? "" : "+"}
                                  {formatCurrency(item.price_delta)}
                                </span>
                                {item.price_delta_pct !== null && (
                                  <span>
                                    ({isDrop ? "" : "+"}
                                    {item.price_delta_pct.toFixed(1)}%)
                                  </span>
                                )}
                              </span>

                              {item.discount_pct !== null && (
                                <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
                                  {item.discount_pct}% off
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </TableCell>

                      {/* Stock Status Shift */}
                      <TableCell className="align-middle py-2">
                        {wentOut ? (
                          <span className="inline-flex items-center gap-1 rounded border border-rose-300 bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300">
                            <AlertTriangle className="h-2.5 w-2.5 text-rose-600" />
                            In Stock ➔ Out of Stock
                          </span>
                        ) : becameRestocked ? (
                          <span className="inline-flex items-center gap-1 rounded border border-teal-300 bg-teal-50 px-1.5 py-0.5 text-[10px] font-bold text-teal-800 dark:border-teal-800 dark:bg-teal-950 dark:text-teal-300">
                            <CheckCircle2 className="h-2.5 w-2.5 text-teal-600" />
                            Out of Stock ➔ In Stock
                          </span>
                        ) : item.sold_out ? (
                          <span className="inline-flex rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            Sold Out
                          </span>
                        ) : (
                          <span className="inline-flex rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            In Stock
                          </span>
                        )}
                      </TableCell>

                      {/* Timeline action */}
                      <TableCell className="align-middle text-right py-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onMouseEnter={() => prefetchProductHistory(item.platform, item.product_id)}
                          onClick={() => setInspectedProduct(item)}
                          className="h-6 gap-1 border-slate-200 px-2 text-[10px] font-semibold text-slate-700 hover:border-indigo-600 hover:bg-indigo-50 hover:text-indigo-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          <History className="h-3 w-3 text-indigo-600 dark:text-indigo-400" />
                          <span>Timeline</span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Compact Table Pagination Footer */}
        {dynamicsData && dynamicsData.total_items > pageSize && (
          <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-3 py-1.5 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-800/30 dark:text-slate-400">
            <div>
              Page{" "}
              <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                {page}
              </span>{" "}
              of{" "}
              <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                {totalPages}
              </span>{" "}
              ({formatNumber(dynamicsData.total_items)} shifts)
            </div>

            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="h-6 w-6 p-0 border-slate-200 dark:border-slate-700"
              >
                <ChevronLeft className="h-3 w-3" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="h-6 w-6 p-0 border-slate-200 dark:border-slate-700"
              >
                <ChevronRight className="h-3 w-3" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Product Timeline Inspector Dialog */}
      <Dialog
        open={Boolean(inspectedProduct)}
        onOpenChange={(open) => {
          if (!open) setInspectedProduct(null);
        }}
      >
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto border border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 p-5 shadow-2xl rounded-lg z-50">
          <DialogHeader className="border-b border-slate-100 dark:border-slate-800 pb-3 pr-8">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                {inspectedProduct?.image_url && (
                  <img
                    src={inspectedProduct.image_url}
                    alt={inspectedProduct.product_name}
                    className="h-10 w-10 rounded border border-slate-200 object-contain p-0.5 bg-white dark:border-slate-700"
                  />
                )}
                <div>
                  <DialogTitle className="text-sm font-bold text-slate-900 dark:text-slate-100 line-clamp-2">
                    {inspectedProduct?.product_name}
                  </DialogTitle>
                  <DialogDescription className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                    {inspectedProduct?.brand && (
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        Brand: {inspectedProduct.brand}
                      </span>
                    )}
                    {inspectedProduct?.category && (
                      <span>Category: {inspectedProduct.category}</span>
                    )}
                    <span className="font-mono text-slate-400">ID: {inspectedProduct?.product_id}</span>
                  </DialogDescription>
                </div>
              </div>

              {inspectedProduct?.product_url && (
                <a
                  href={inspectedProduct.product_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex shrink-0 items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer transition-colors"
                >
                  <span className="capitalize">Open on {inspectedProduct.platform}</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </DialogHeader>

          {/* Dialog Body */}
          <div className="mt-3 space-y-3">
            {historyLoading ? (
              <div className="flex h-44 flex-col items-center justify-center gap-2">
                <RefreshCw className="h-5 w-5 animate-spin text-indigo-600 dark:text-indigo-400" />
                <p className="text-xs text-slate-500 dark:text-slate-400">Loading historical price timeline...</p>
              </div>
            ) : historyData && historyData.history.length > 0 ? (
              <>
                {/* Historical Area Chart */}
                <div className="rounded border border-slate-200 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-800/40">
                  <div className="mb-2 flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      Price Trajectory ({historyData.history.length} snapshots)
                    </span>
                    <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">
                      Current: {formatCurrency(inspectedProduct?.price ?? 0)}
                    </span>
                  </div>

                  <div className="h-48 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={historyData.history.filter((h) => h.price !== null)}
                        margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                      >
                        <ChartGradients />
                        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                        <XAxis
                          dataKey="snapshot_date"
                          tick={AXIS_TICK}
                          axisLine={{ stroke: AXIS_LINE }}
                          tickFormatter={(d: string) => d.slice(5)}
                        />
                        <YAxis
                          tick={AXIS_TICK}
                          axisLine={{ stroke: AXIS_LINE }}
                          tickFormatter={(v: number) => `₹${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
                        />
                        <Tooltip
                          content={({ active, payload }) => {
                            if (!active || !payload || !payload.length || !payload[0]) return null;
                            const d = payload[0].payload as {
                              snapshot_date: string;
                              price: number;
                              mrp: number | null;
                              discount_pct: number | null;
                              sold_out: boolean;
                            };
                            return (
                              <TooltipShell title={d.snapshot_date}>
                                <div className="space-y-1 text-xs">
                                  <div className="flex justify-between gap-3">
                                    <span className="text-slate-500">Price:</span>
                                    <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                                      {formatCurrency(d.price)}
                                    </span>
                                  </div>
                                  {d.mrp && (
                                    <div className="flex justify-between gap-3">
                                      <span className="text-slate-500">MRP:</span>
                                      <span className="font-mono text-slate-400 line-through">
                                        {formatCurrency(d.mrp)}
                                      </span>
                                    </div>
                                  )}
                                  {d.discount_pct !== null && (
                                    <div className="flex justify-between gap-3">
                                      <span className="text-slate-500">Discount:</span>
                                      <span className="font-mono font-bold text-sky-700">
                                        {d.discount_pct}% off
                                      </span>
                                    </div>
                                  )}
                                  <div className="flex justify-between gap-3">
                                    <span className="text-slate-500">Status:</span>
                                    <span
                                      className={cn(
                                        "font-bold",
                                        d.sold_out ? "text-rose-600" : "text-emerald-600"
                                      )}
                                    >
                                      {d.sold_out ? "Out of Stock" : "In Stock"}
                                    </span>
                                  </div>
                                </div>
                              </TooltipShell>
                            );
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="price"
                          name="Price"
                          stroke="#4338CA"
                          strokeWidth={2}
                          fill="url(#irisAreaFill)"
                          {...CHART_ANIMATION}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Scrape History Table */}
                <div className="max-h-48 overflow-y-auto rounded border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                  <Table>
                    <TableHeader className="bg-slate-50 sticky top-0 dark:bg-slate-800">
                      <TableRow className="border-slate-200 dark:border-slate-700">
                        <TableHead className="font-bold text-slate-700 dark:text-slate-200 text-xs py-1.5">Date</TableHead>
                        <TableHead className="font-bold text-slate-700 dark:text-slate-200 text-xs py-1.5">Price</TableHead>
                        <TableHead className="font-bold text-slate-700 dark:text-slate-200 text-xs py-1.5">MRP</TableHead>
                        <TableHead className="font-bold text-slate-700 dark:text-slate-200 text-xs py-1.5">Discount</TableHead>
                        <TableHead className="font-bold text-slate-700 dark:text-slate-200 text-xs py-1.5">Stock</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {historyData.history.map((row) => (
                        <TableRow key={row.snapshot_date} className="border-slate-100 dark:border-slate-800 text-xs">
                          <TableCell className="font-mono font-semibold text-slate-800 dark:text-slate-200 py-1.5">
                            {row.snapshot_date}
                          </TableCell>
                          <TableCell className="font-mono font-bold text-slate-900 dark:text-slate-100 py-1.5">
                            {row.price !== null ? formatCurrency(row.price) : "—"}
                          </TableCell>
                          <TableCell className="font-mono text-slate-400 py-1.5">
                            {row.mrp !== null ? formatCurrency(row.mrp) : "—"}
                          </TableCell>
                          <TableCell className="py-1.5">
                            {row.discount_pct !== null ? (
                              <span className="font-semibold text-sky-700 dark:text-sky-400">
                                {row.discount_pct}% off
                              </span>
                            ) : (
                              "—"
                            )}
                          </TableCell>
                          <TableCell className="py-1.5">
                            {row.sold_out ? (
                              <span className="inline-flex rounded border border-rose-200 bg-rose-50 px-1.5 py-0.2 text-[10px] font-bold text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300">
                                Sold Out
                              </span>
                            ) : (
                              <span className="inline-flex rounded border border-slate-200 bg-slate-50 px-1.5 py-0.2 text-[10px] font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                In Stock
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            ) : (
              <EmptyState
                title="No historical snapshots found"
                description="This product only has a single scrape record."
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
