import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  CheckCircle2,
  IndianRupee,
  MessageSquare,
  Package,
  Percent,
  Star,
  Tag,
  XCircle,
} from "lucide-react";
import {
  AXIS_LINE,
  AXIS_TICK,
  CHART_ANIMATION,
  ChartGradients,
  ChartLegend,
  GRID_STROKE,
  MiniSelect,
  TooltipShell,
} from "@/components/chart-utils";
import { FilterBar } from "@/components/filters/FilterBar";
import { ChartPanel, EmptyState, KpiStrip, KpiTile } from "@/components/panels";
import { DISCOUNT_BOUNDS, PRICE_BOUNDS, PLATFORMS, type Product } from "@/data/dataset";
import { CHART, PLATFORM_COLORS } from "@/data/palette";
import { useFilters } from "@/context/FiltersContext";
import {
  formatCompact,
  formatCurrency,
  formatNumber,
  formatPercent,
  formatRating,
} from "@/lib/format";
import { groupBy, histogram, mean, median } from "@/lib/stats";



const PRICE_BIN_COUNT = 12;

const RATING_BANDS = [
  { label: "< 3★", lo: 0, hi: 3 },
  { label: "3–3.5★", lo: 3, hi: 3.5 },
  { label: "3.5–4★", lo: 3.5, hi: 4 },
  { label: "4–4.5★", lo: 4, hi: 4.5 },
  { label: "4.5–5★", lo: 4.5, hi: 5.01 },
];

const STOCK_KEYS = [
  { key: "in_stock", label: "In stock", color: CHART.primary },
  { key: "out_of_stock", label: "Out of stock", color: CHART.negative },
] as const;

function avgPrice(products: Product[]) {
  return mean(products.map((p) => p.price));
}

const truncate14 = (value: string) => (value.length > 14 ? `${value.slice(0, 13)}…` : value);

export function OverviewPage() {
  const { filteredProducts: ps, filters, setFilters } = useFilters();
  const [categoryMetric, setCategoryMetric] = useState("count");
  const [brandTopN, setBrandTopN] = useState("8");

  // Click a category bar to filter the entire dashboard by it.
  const toggleCategoryFilter = (category: string) =>
    setFilters({
      categories: filters.categories.includes(category)
        ? filters.categories.filter((c) => c !== category)
        : [...filters.categories, category],
    });

  const kpis = useMemo(() => {
    const prices = ps.map((p) => p.price);
    const discounts = ps.flatMap((p) =>
      p.discount_percentage !== null ? [p.discount_percentage] : [],
    );
    const ratings = ps.flatMap((p) => (p.rating !== null ? [p.rating] : []));
    const totalReviews = ps.reduce((a, p) => a + (p.review_count ?? 0), 0);
    const inStock = ps.filter((p) => p.stock_status === "in_stock").length;
    const outStock = ps.filter((p) => p.stock_status === "out_of_stock").length;
    const discounted = discounts.length;
    return {
      total: ps.length,
      avgPrice: mean(prices),
      medianPrice: median(prices),
      avgDiscount: mean(discounts),
      avgRating: mean(ratings),
      ratedCount: ratings.length,
      totalReviews,
      inStock,
      outStock,
      discounted,
      inStockPct: ps.length ? (inStock / ps.length) * 100 : null,
    };
  }, [ps]);

  const priceBins = useMemo(() => {
    const PRICE_TIERS = [
      { label: "< ₹500", min: 0, max: 500, range: "Under ₹500" },
      { label: "₹500–1K", min: 500, max: 1000, range: "₹500 – ₹1,000" },
      { label: "₹1K–2.5K", min: 1000, max: 2500, range: "₹1,000 – ₹2,500" },
      { label: "₹2.5K–5K", min: 2500, max: 5000, range: "₹2,500 – ₹5,000" },
      { label: "₹5K–10K", min: 5000, max: 10000, range: "₹5,000 – ₹10,000" },
      { label: "₹10K–25K", min: 10000, max: 25000, range: "₹10,000 – ₹25,000" },
      { label: "₹25K+", min: 25000, max: Infinity, range: "₹25,000 and above" },
    ];

    const total = ps.length || 1;
    return PRICE_TIERS.map((tier) => {
      const count = ps.filter(
        (p) => p.price >= tier.min && (tier.max === Infinity ? true : p.price < tier.max)
      ).length;
      const pct = ((count / total) * 100).toFixed(1);
      return {
        label: tier.label,
        range: tier.range,
        count,
        pct: `${pct}%`,
      };
    });
  }, [ps]);

  // Stacked per-platform volume by category. NOTE: Amazon and Flipkart use
  // different category taxonomies in the raw dumps, so cross-platform category
  // PRICE comparisons would be misleading — compare brands instead (Brand
  // Comparison page), show honest volumes here.
  const topCategories = useMemo(() => {
    return Array.from(groupBy(ps, (p) => p.category).entries())
      .map(([category, items]) => ({
        category,
        amazon: items.filter((p) => p.platform === "Amazon").length,
        flipkart: items.filter((p) => p.platform === "Flipkart").length,
      }))
      .sort((a, b) => b.amazon + b.flipkart - (a.amazon + a.flipkart))
      .slice(0, 8);
  }, [ps]);

  const ratingBands = useMemo(() => {
    const ratings = ps.flatMap((p) => (p.rating !== null ? [p.rating] : []));
    return RATING_BANDS.map((band) => ({
      label: band.label,
      count: ratings.filter((r) => r >= band.lo && r < band.hi).length,
    }));
  }, [ps]);

  const stockByPlatform = useMemo(() => {
    return PLATFORMS.map((platform) => {
      const items = ps.filter((p) => p.platform === platform);
      return {
        platform,
        in_stock: items.filter((p) => p.stock_status === "in_stock").length,
        out_of_stock: items.filter((p) => p.stock_status === "out_of_stock").length,
      };
    });
  }, [ps]);

  const categoryData = useMemo(() => {
    return Array.from(groupBy(ps, (p) => p.category).entries())
      .map(([category, items]) => ({
        category,
        count: items.length,
        avgPrice: avgPrice(items),
        avgRating: mean(items.flatMap((p) => (p.rating !== null ? [p.rating] : []))),
        avgDiscount: mean(
          items.flatMap((p) => (p.discount_percentage !== null ? [p.discount_percentage] : [])),
        ),
      }))
      .sort((a, b) => b.count - a.count);
  }, [ps]);

  const brandData = useMemo(() => {
    const n = Number(brandTopN);
    return Array.from(groupBy(ps, (p) => p.brand).entries())
      .map(([brand, items]) => ({
        brand,
        count: items.length,
        avgPrice: avgPrice(items),
        avgRating: mean(items.flatMap((p) => (p.rating !== null ? [p.rating] : []))),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, n);
  }, [ps, brandTopN]);

  if (ps.length === 0) {
    return (
      <div className="space-y-4">
        <FilterBar />
        <EmptyState />
      </div>
    );
  }

  return (
    <div className="space-y-3.5">
      <FilterBar />

      <KpiStrip className="sm:grid-cols-4 lg:grid-cols-4 xl:grid-cols-8">
        <KpiTile label="Total Products" value={formatNumber(kpis.total)} icon={Package} />
        <KpiTile
          label="Average Price"
          value={formatCurrency(kpis.avgPrice)}
          sub={`Median ${formatCurrency(kpis.medianPrice)}`}
          icon={IndianRupee}
        />
        <KpiTile
          label="Average Discount"
          value={formatPercent(kpis.avgDiscount)}
          sub={`Across ${formatNumber(kpis.discounted)} discounted listings`}
          icon={Percent}
        />
        <KpiTile
          label="Average Rating"
          value={formatRating(kpis.avgRating)}
          sub={`${formatNumber(kpis.ratedCount)} rated listings`}
          icon={Star}
        />
        <KpiTile
          label="Total Reviews"
          value={formatCompact(kpis.totalReviews)}
          icon={MessageSquare}
        />
        <KpiTile
          label="In-Stock Products"
          value={formatNumber(kpis.inStock)}
          sub={formatPercent(kpis.inStockPct) + " of listings"}
          icon={CheckCircle2}
          tone="positive"
        />
        <KpiTile
          label="Out-of-Stock Products"
          value={formatNumber(kpis.outStock)}
          icon={XCircle}
          tone="negative"
        />
        <KpiTile
          label="Products with Discounts"
          value={formatNumber(kpis.discounted)}
          sub={
            formatPercent(ps.length ? (kpis.discounted / ps.length) * 100 : null) + " of listings"
          }
          icon={Tag}
        />
      </KpiStrip>

      <div className="grid gap-5 xl:grid-cols-2">
        <ChartPanel
          title="Price Distribution Curve"
          description="Products grouped into price brackets with animated frequency density"
        >
          <ResponsiveContainer width="100%" height={260}>
            <BarChart key={`price-${ps.length}`} data={priceBins} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="label"
                tick={AXIS_TICK}
                axisLine={{ stroke: AXIS_LINE }}
                tickLine={false}
                interval={0}
              />
              <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={38} />
              <Tooltip
                cursor={{ fill: "rgba(67, 56, 202, 0.06)" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0]?.payload as (typeof priceBins)[number] & { pct: string };
                  return (
                    <TooltipShell>
                      <div className="font-bold text-foreground">{d.range}</div>
                      <div className="mt-1 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-primary" />
                          <span>Count</span>
                        </span>
                        <span className="font-semibold text-foreground">
                          {formatNumber(d.count)} products ({d.pct})
                        </span>
                      </div>
                    </TooltipShell>
                  );
                }}
              />
              <Bar
                dataKey="count"
                fill={CHART.primary}
                radius={[4, 4, 0, 0]}
                maxBarSize={44}
                isAnimationActive={true}
                animationDuration={800}
                animationEasing="ease-out"
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>

        <ChartPanel
          title="Customer Rating Distribution"
          description="Products categorized by rating brackets (unrated items excluded)"
        >
          <ResponsiveContainer width="100%" height={260}>
            <BarChart key={`rating-${ps.length}`} data={ratingBands} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="label"
                tick={AXIS_TICK}
                axisLine={{ stroke: AXIS_LINE }}
                tickLine={false}
              />
              <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={38} />
              <Tooltip
                cursor={{ fill: "rgba(67, 56, 202, 0.06)" }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <TooltipShell>
                      <div className="font-bold text-foreground">{String(label)}</div>
                      <div className="mt-1 flex items-center gap-1.5 text-muted-foreground">
                        <span className="h-2 w-2 rounded-full bg-primary" />
                        <span>{formatNumber(payload[0]?.value as number)} products</span>
                      </div>
                    </TooltipShell>
                  );
                }}
              />
              <Bar
                dataKey="count"
                fill={CHART.secondary}
                radius={[4, 4, 0, 0]}
                maxBarSize={48}
                isAnimationActive={true}
                animationDuration={800}
                animationEasing="ease-out"
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>

        <div className="xl:col-span-2">
          <ChartPanel
            title="Leading Brands Share"
            description="Dominant brands by listing volume across active parameters"
            controls={
              <MiniSelect
                label="Show"
                value={brandTopN}
                onChange={setBrandTopN}
                options={[
                  { value: "5", label: "Top 5" },
                  { value: "8", label: "Top 8" },
                  { value: "12", label: "Top 12" },
                ]}
              />
            }
          >
            <ResponsiveContainer width="100%" height={Math.max(220, brandData.length * 36)}>
              <BarChart
                key={`brand-${ps.length}-${brandTopN}`}
                data={brandData}
                layout="vertical"
                margin={{ top: 8, right: 28, left: 0, bottom: 0 }}
              >
                <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" horizontal={false} />
                <XAxis
                  type="number"
                  tick={AXIS_TICK}
                  axisLine={{ stroke: AXIS_LINE }}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="brand"
                  tick={AXIS_TICK}
                  axisLine={false}
                  tickLine={false}
                  width={105}
                />
                <Tooltip
                  cursor={{ fill: "rgba(67, 56, 202, 0.06)" }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0]?.payload as (typeof brandData)[number];
                    return (
                      <TooltipShell>
                        <div className="font-bold text-foreground">{d.brand}</div>
                        <div className="mt-1 font-semibold text-primary">{formatNumber(d.count)} listings</div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          Avg price {formatCurrency(d.avgPrice)} · Avg rating{" "}
                          {formatRating(d.avgRating)}
                        </div>
                      </TooltipShell>
                    );
                  }}
                />
                <Bar
                  dataKey="count"
                  fill={CHART.primary}
                  radius={[0, 4, 4, 0]}
                  maxBarSize={18}
                  isAnimationActive={true}
                  animationDuration={800}
                  animationEasing="ease-out"
                />
              </BarChart>
            </ResponsiveContainer>
          </ChartPanel>
        </div>
      </div>

      <p className="pb-2 text-[11px] text-muted-foreground">
        All metrics and charts are calculated live from the sample dataset (
        {formatNumber(ps.length)} listings after filters). No live marketplace data is used.
        Discount range in the dataset runs {DISCOUNT_BOUNDS.min}–{DISCOUNT_BOUNDS.max}%.
      </p>
    </div>
  );
}
