import { useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, Percent, Search, SlidersHorizontal, Star, Tag, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  BRANDS,
  CATEGORIES,
  DISCOUNT_BOUNDS,
  PRICE_BOUNDS,
  PRODUCTS,
  RATING_BOUNDS,
} from "@/data/dataset";
import { useFilters, type StockFilter } from "@/context/FiltersContext";
import { formatCompact, formatCurrency, formatRating } from "@/lib/format";
import { cn } from "@/lib/utils";

const REVIEW_STOPS = [0, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000];

/** Max brand checkboxes rendered at once; real data has thousands of brands. */
const BRAND_LIST_CAP = 50;

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.05em] text-muted-foreground">
        {label}
      </div>
      {children}
    </div>
  );
}

function DualSlider({
  value,
  onChange,
  min,
  max,
  step,
  format,
}: {
  value: [number, number];
  onChange: (v: [number, number]) => void;
  min: number;
  max: number;
  step: number;
  format: (n: number) => string;
}) {
  return (
    <div>
      <Slider
        value={value}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => {
          const [lo, hi] = v;
          if (lo !== undefined && hi !== undefined) onChange([lo, hi]);
        }}
        className="w-full"
      />
      <div className="mt-1.5 flex justify-between text-xs tabular-nums text-muted-foreground">
        <span>{format(value[0])}</span>
        <span>{format(value[1])}</span>
      </div>
    </div>
  );
}

export function FilterBar() {
  const { filters, setFilters, activeChips, clearChip, activeCount, filteredProducts } =
    useFilters();
  const [open, setOpen] = useState(false);
  const [brandsOpen, setBrandsOpen] = useState(false);
  const [brandQuery, setBrandQuery] = useState("");

  // Searchable, capped brand list
  const brandMatches = useMemo(() => {
    const q = brandQuery.trim().toLowerCase();
    const pool = q ? BRANDS.filter((b) => b.toLowerCase().includes(q)) : BRANDS;
    return pool.slice(0, BRAND_LIST_CAP);
  }, [brandQuery]);

  const toggleBrand = (brand: string, checked: boolean) =>
    setFilters({
      brands: checked ? [...filters.brands, brand] : filters.brands.filter((b) => b !== brand),
    });

  // Quick Preset Actions
  const isUnder500 = filters.priceRange[1] <= 500 && filters.priceRange[0] === PRICE_BOUNDS.min;
  const isHighDiscount = filters.discountRange[0] >= 30;
  const isTopRated = filters.ratingRange[0] >= 4.0;
  const isInStockOnly = filters.stock === "in_stock";

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-2xs dark:border-slate-800 dark:bg-slate-900 transition-all duration-200 overflow-hidden">
      {/* Top Linewise Filter Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 px-3.5 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={open ? "default" : "outline"}
            size="sm"
            className={cn(
              "h-7.5 gap-2 rounded-md text-xs font-semibold transition-all duration-200",
              open
                ? "bg-indigo-700 text-white shadow-2xs dark:bg-indigo-600"
                : "border-slate-200 text-slate-700 hover:border-indigo-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800",
            )}
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={2} />
            <span>Filter Studio</span>
            {activeCount > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-indigo-600 px-1 text-[10px] font-bold text-white">
                {activeCount}
              </span>
            )}
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", open && "rotate-180")} />
          </Button>

          {/* Quick Preset Linewise Pills */}
          <div className="hidden items-center gap-1.5 sm:flex">
            <button
              onClick={() =>
                setFilters({
                  priceRange: isUnder500
                    ? [PRICE_BOUNDS.min, PRICE_BOUNDS.max]
                    : [PRICE_BOUNDS.min, 500],
                })
              }
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-medium transition-all duration-200 cursor-pointer",
                isUnder500
                  ? "border-indigo-600 bg-indigo-50 font-semibold text-indigo-700 dark:bg-indigo-950 dark:border-indigo-800 dark:text-indigo-300"
                  : "border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:text-slate-400 dark:hover:text-slate-200",
              )}
            >
              <Tag className="h-3 w-3 stroke-[2]" />
              <span>Under ₹500</span>
            </button>

            <button
              onClick={() =>
                setFilters({
                  discountRange: isHighDiscount
                    ? [DISCOUNT_BOUNDS.min, DISCOUNT_BOUNDS.max]
                    : [30, DISCOUNT_BOUNDS.max],
                })
              }
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-medium transition-all duration-200 cursor-pointer",
                isHighDiscount
                  ? "border-sky-600 bg-sky-50 font-semibold text-sky-700 dark:bg-sky-950 dark:border-sky-800 dark:text-sky-300"
                  : "border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:text-slate-400 dark:hover:text-slate-200",
              )}
            >
              <Percent className="h-3 w-3 stroke-[2]" />
              <span>≥ 30% Off</span>
            </button>

            <button
              onClick={() =>
                setFilters({
                  ratingRange: isTopRated
                    ? [RATING_BOUNDS.min, RATING_BOUNDS.max]
                    : [4.0, RATING_BOUNDS.max],
                })
              }
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-medium transition-all duration-200 cursor-pointer",
                isTopRated
                  ? "border-violet-600 bg-violet-50 font-semibold text-violet-700 dark:bg-violet-950 dark:border-violet-800 dark:text-violet-300"
                  : "border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:text-slate-400 dark:hover:text-slate-200",
              )}
            >
              <Star className="h-3 w-3 stroke-[2]" />
              <span>4.0+ Rated</span>
            </button>

            <button
              onClick={() =>
                setFilters({
                  stock: isInStockOnly ? "all" : "in_stock",
                })
              }
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-medium transition-all duration-200 cursor-pointer",
                isInStockOnly
                  ? "border-indigo-600 bg-indigo-50 font-semibold text-indigo-700 dark:bg-indigo-950 dark:border-indigo-800 dark:text-indigo-300"
                  : "border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:text-slate-400 dark:hover:text-slate-200",
              )}
            >
              <CheckCircle2 className="h-3 w-3 stroke-[2]" />
              <span>In Stock</span>
            </button>
          </div>
        </div>

        {/* Active Chips & Match Status */}
        <div className="flex flex-wrap items-center gap-1.5">
          {activeChips.length === 0 ? (
            <span className="text-xs font-medium text-muted-foreground/70">
              Showing all {filteredProducts.length.toLocaleString("en-IN")} listings
            </span>
          ) : (
            activeChips.map((chip) => (
              <button
                key={chip.label}
                onClick={() => clearChip(chip)}
                className="group inline-flex items-center gap-1.5 rounded-lg border border-border/80 bg-accent/40 px-2.5 py-1 text-[11px] font-medium text-foreground transition-all duration-200 hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                title="Remove filter"
              >
                <span>{chip.label}</span>
                <X className="h-3 w-3 opacity-60 group-hover:opacity-100" />
              </button>
            ))
          )}
        </div>
      </div>

      {/* Expanded Studio Filter Sliders & Checkboxes */}
      {open && (
        <div className="grid gap-x-8 gap-y-6 border-t border-border/70 p-5 md:grid-cols-2 xl:grid-cols-3">
          <FilterGroup label="Categories">
            <div className="flex max-h-36 flex-wrap gap-x-3 gap-y-2 overflow-y-auto pr-1">
              {CATEGORIES.map((cat) => {
                const checked = filters.categories.includes(cat);
                return (
                  <button
                    key={cat}
                    onClick={() =>
                      setFilters({
                        categories: checked
                          ? filters.categories.filter((c) => c !== cat)
                          : [...filters.categories, cat],
                      })
                    }
                    className={cn(
                      "rounded-lg border px-2.5 py-1 text-xs font-medium transition-all",
                      checked
                        ? "border-primary bg-primary text-primary-foreground shadow-xs"
                        : "border-border/80 bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
                    )}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
          </FilterGroup>

          <FilterGroup label="Brands">
            <Popover open={brandsOpen} onOpenChange={setBrandsOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8.5 w-full justify-start rounded-xl border-border/80 text-xs font-medium"
                >
                  {filters.brands.length
                    ? `${filters.brands.length} brand${filters.brands.length > 1 ? "s" : ""} selected`
                    : "Select brands…"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-68 rounded-2xl border-border/80 p-3 shadow-xl" align="start">
                <div className="relative mb-2">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={brandQuery}
                    onChange={(e) => setBrandQuery(e.target.value)}
                    placeholder="Search brands…"
                    className="h-7.5 rounded-lg pl-8 text-xs"
                  />
                </div>
                <div className="max-h-60 overflow-y-auto pr-1">
                  {brandMatches.map((brand) => (
                    <Label
                      key={brand}
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
                    >
                      <Checkbox
                        checked={filters.brands.includes(brand)}
                        onCheckedChange={(checked) => toggleBrand(brand, !!checked)}
                      />
                      <span className="truncate">{brand}</span>
                    </Label>
                  ))}
                  {brandMatches.length === 0 && (
                    <p className="px-2 py-2 text-xs text-muted-foreground">
                      No brands match “{brandQuery.trim()}”.
                    </p>
                  )}
                </div>
                <div className="mt-2 flex items-center justify-between border-t border-border/60 pt-2 text-[10px] text-muted-foreground">
                  <span>
                    {brandMatches.length} of {BRANDS.length} brands
                  </span>
                  {filters.brands.length > 0 && (
                    <button
                      onClick={() => setFilters({ brands: [] })}
                      className="font-semibold text-primary hover:underline"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </FilterGroup>

          <FilterGroup
            label={`Price range · ${formatCurrency(filters.priceRange[0])} – ${formatCurrency(filters.priceRange[1])}`}
          >
            <DualSlider
              value={filters.priceRange}
              onChange={(v) => setFilters({ priceRange: v })}
              min={PRICE_BOUNDS.min}
              max={PRICE_BOUNDS.max}
              step={100}
              format={formatCurrency}
            />
          </FilterGroup>

          <FilterGroup label="Discount Depth">
            <DualSlider
              value={filters.discountRange}
              onChange={(v) => setFilters({ discountRange: v })}
              min={DISCOUNT_BOUNDS.min}
              max={DISCOUNT_BOUNDS.max}
              step={1}
              format={(n) => `${n}%`}
            />
            <div className="mt-2.5 flex items-center gap-2">
              <Switch
                checked={filters.discountedOnly}
                onCheckedChange={(checked) => setFilters({ discountedOnly: checked })}
                id="discounted-only"
              />
              <Label htmlFor="discounted-only" className="cursor-pointer text-xs font-medium text-foreground">
                Discounted products only
              </Label>
            </div>
          </FilterGroup>

          <FilterGroup
            label={`Customer Rating · ${formatRating(filters.ratingRange[0])} – ${formatRating(filters.ratingRange[1])}★`}
          >
            <DualSlider
              value={filters.ratingRange}
              onChange={(v) => setFilters({ ratingRange: v })}
              min={RATING_BOUNDS.min}
              max={RATING_BOUNDS.max}
              step={0.5}
              format={(n) => `${n}★`}
            />
          </FilterGroup>

          <FilterGroup label="Stock Status">
            <ToggleGroup
              type="single"
              value={filters.stock}
              onValueChange={(v) => v && setFilters({ stock: v as StockFilter })}
              className="justify-start gap-1"
            >
              <ToggleGroupItem value="all" className="h-8 rounded-xl px-3 text-xs font-medium">
                All Listings
              </ToggleGroupItem>
              <ToggleGroupItem value="in_stock" className="h-8 rounded-xl px-3 text-xs font-medium text-positive">
                In stock
              </ToggleGroupItem>
              <ToggleGroupItem value="out_of_stock" className="h-8 rounded-xl px-3 text-xs font-medium text-negative">
                Out of stock
              </ToggleGroupItem>
            </ToggleGroup>
          </FilterGroup>
        </div>
      )}
    </div>
  );
}

function closestStop(v: number): number {
  return REVIEW_STOPS.reduce(
    (best, s) => (Math.abs(s - v) < Math.abs(best - v) ? s : best),
    REVIEW_STOPS[0] ?? v,
  );
}
