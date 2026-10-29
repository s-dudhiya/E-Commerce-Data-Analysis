import {
  createContext,
  useCallback,
  useContext,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DISCOUNT_BOUNDS,
  PRICE_BOUNDS,
  PRODUCTS,
  RATING_BOUNDS,
  type Platform,
  type Product,
} from "@/data/dataset";
import { ensureRealDataset } from "@/data/source";

export type PlatformFilter = "all" | Platform;
export type StockFilter = "all" | "in_stock" | "out_of_stock" | "unknown";

export interface Filters {
  search: string;
  platform: PlatformFilter;
  categories: string[];
  brands: string[];
  priceRange: [number, number];
  discountRange: [number, number];
  discountedOnly: boolean;
  ratingRange: [number, number];
  minReviews: number;
  stock: StockFilter;
}

/**
 * Defaults built from the CURRENT dataset bounds — called after the real
 * warehouse sample has been applied, so sliders start at actual data bounds.
 */
function defaultFilters(): Filters {
  return {
    search: "",
    platform: "Amazon",
    categories: [],
    brands: [],
    priceRange: [PRICE_BOUNDS.min, PRICE_BOUNDS.max],
    discountRange: [DISCOUNT_BOUNDS.min, DISCOUNT_BOUNDS.max],
    discountedOnly: false,
    ratingRange: [RATING_BOUNDS.min, RATING_BOUNDS.max],
    minReviews: 0,
    stock: "all",
  };
}

export interface ActiveChip {
  label: string;
  clear: (f: Filters) => Filters;
}

export interface FiltersContextValue {
  filters: Filters;
  setFilters: (patch: Partial<Filters>) => void;
  clearFilters: () => void;
  clearChip: (chip: ActiveChip) => void;
  activeChips: ActiveChip[];
  activeCount: number;
  filteredProducts: Product[];
}

const FiltersContext = createContext<FiltersContextValue | null>(null);

function buildChips(f: Filters): ActiveChip[] {
  const chips: ActiveChip[] = [];
  const push = (label: string, clear: (draft: Filters) => Filters) => chips.push({ label, clear });

  if (f.search.trim()) push(`Search: “${f.search.trim()}”`, (d) => ({ ...d, search: "" }));
  if (f.platform !== "all") push(`Platform: ${f.platform}`, (d) => ({ ...d, platform: "all" }));
  for (const c of f.categories)
    push(`Category: ${c}`, (d) => ({ ...d, categories: d.categories.filter((x) => x !== c) }));
  for (const b of f.brands)
    push(`Brand: ${b}`, (d) => ({ ...d, brands: d.brands.filter((x) => x !== b) }));
  if (f.priceRange[0] > PRICE_BOUNDS.min || f.priceRange[1] < PRICE_BOUNDS.max)
    push(
      `Price: ₹${f.priceRange[0].toLocaleString("en-IN")}–₹${f.priceRange[1].toLocaleString("en-IN")}`,
      (d) => ({ ...d, priceRange: defaultFilters().priceRange }),
    );
  if (f.discountRange[0] > DISCOUNT_BOUNDS.min || f.discountRange[1] < DISCOUNT_BOUNDS.max)
    push(`Discount: ${f.discountRange[0]}–${f.discountRange[1]}%`, (d) => ({
      ...d,
      discountRange: defaultFilters().discountRange,
    }));
  if (f.discountedOnly) push("Discounted only", (d) => ({ ...d, discountedOnly: false }));
  if (f.ratingRange[0] > RATING_BOUNDS.min || f.ratingRange[1] < RATING_BOUNDS.max)
    push(`Rating: ${f.ratingRange[0]}–${f.ratingRange[1]}★`, (d) => ({
      ...d,
      ratingRange: defaultFilters().ratingRange,
    }));
  if (f.minReviews > 0)
    push(`Reviews ≥ ${f.minReviews.toLocaleString("en-IN")}`, (d) => ({ ...d, minReviews: 0 }));
  if (f.stock !== "all")
    push(
      f.stock === "in_stock"
        ? "Stock: In stock"
        : f.stock === "out_of_stock"
          ? "Stock: Out of stock"
          : "Stock: Unknown",
      (d) => ({ ...d, stock: "all" }),
    );
  return chips;
}

export function matchesFilters(p: Product, f: Filters): boolean {
  if (f.platform !== "all" && p.platform !== f.platform) return false;

  if (f.search.trim()) {
    const q = f.search.trim().toLowerCase();
    const haystack = `${p.product_name} ${p.brand} ${p.category} ${p.product_id}`.toLowerCase();
    if (!haystack.includes(q)) return false;
  }

  if (f.categories.length && !f.categories.includes(p.category)) return false;
  if (f.brands.length && !f.brands.includes(p.brand)) return false;

  if (f.priceRange[0] > PRICE_BOUNDS.min || f.priceRange[1] < PRICE_BOUNDS.max) {
    if (p.price < f.priceRange[0] || p.price > f.priceRange[1]) return false;
  }

  if (f.discountedOnly && (p.discount_percentage === null || p.discount_percentage <= 0))
    return false;
  const discountActive =
    f.discountRange[0] > DISCOUNT_BOUNDS.min || f.discountRange[1] < DISCOUNT_BOUNDS.max;
  if (discountActive) {
    if (p.discount_percentage === null) return false;
    if (p.discount_percentage < f.discountRange[0] || p.discount_percentage > f.discountRange[1])
      return false;
  }

  const ratingActive = f.ratingRange[0] > RATING_BOUNDS.min || f.ratingRange[1] < RATING_BOUNDS.max;
  if (ratingActive) {
    if (p.rating === null) return false;
    if (p.rating < f.ratingRange[0] || p.rating > f.ratingRange[1]) return false;
  }

  if (f.minReviews > 0) {
    if (p.review_count === null || p.review_count < f.minReviews) return false;
  }

  if (f.stock !== "all" && p.stock_status !== f.stock) return false;

  return true;
}

export function FiltersProvider({ children }: { children: ReactNode }) {
  const [filters, setFiltersState] = useState<Filters | null>(() =>
    PRODUCTS.length > 0 ? defaultFilters() : null,
  );
  const [datasetState, setDatasetState] = useState<"loading" | "ready" | "unreachable">(() =>
    PRODUCTS.length > 0 ? "ready" : "loading",
  );
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    if (PRODUCTS.length > 0) {
      setDatasetState("ready");
      setFiltersState((prev) => prev ?? defaultFilters());
      return;
    }
    setDatasetState("loading");
    void ensureRealDataset().then((source) => {
      if (!alive) return;
      if (source === "backend") setFiltersState(defaultFilters());
      setDatasetState(source === "backend" ? "ready" : "unreachable");
    });
    return () => {
      alive = false;
    };
  }, [attempt]);

  const setFilters = useCallback((patch: Partial<Filters>) => {
    setFiltersState((prev) => (prev === null ? prev : { ...prev, ...patch }));
  }, []);

  const clearFilters = useCallback(() => setFiltersState(defaultFilters()), []);

  const clearChip = useCallback((chip: ActiveChip) => {
    setFiltersState((prev) => (prev === null ? prev : chip.clear(prev)));
  }, []);

  const resolved = filters ?? defaultFilters();

  const activeChips = useMemo(() => buildChips(resolved), [resolved]);
  const rawFiltered = useMemo(
    () => PRODUCTS.filter((p) => matchesFilters(p, resolved)),
    [resolved],
  );
  // Heavy full-filter re-computation runs at low priority so fast filter
  // changes (e.g. dragging sliders, typing) never block the UI.
  const filteredProducts = useDeferredValue(rawFiltered);

  const value = useMemo<FiltersContextValue>(
    () => ({
      filters: resolved,
      setFilters,
      clearFilters,
      clearChip,
      activeChips,
      activeCount: activeChips.length,
      filteredProducts,
    }),
    [resolved, setFilters, clearFilters, clearChip, activeChips, filteredProducts],
  );

  if (datasetState === "loading") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50 text-slate-800 dark:bg-slate-950 dark:text-slate-100">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
          Connecting to MarketLens Warehouse...
        </div>
        <div className="text-[11px] text-slate-500 dark:text-slate-400">
          Syncing DuckDB catalog metrics
        </div>
      </div>
    );
  }

  if (datasetState === "unreachable") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-foreground">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold tracking-tight">
            Can’t reach the MarketLens backend
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            The dashboard only shows live warehouse data — there is no offline sample. Start the
            backend, then retry:
          </p>
          <code className="mt-2 block rounded-md bg-muted px-3 py-2 text-xs">
            python -m uvicorn app.main:app --port 8000
          </code>
        </div>
        <button
          onClick={() => setAttempt((a) => a + 1)}
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Retry
        </button>
      </div>
    );
  }

  return <FiltersContext.Provider value={value}>{children}</FiltersContext.Provider>;
}

export function useFilters(): FiltersContextValue {
  const ctx = useContext(FiltersContext);
  if (!ctx) throw new Error("useFilters must be used within FiltersProvider");
  return ctx;
}
