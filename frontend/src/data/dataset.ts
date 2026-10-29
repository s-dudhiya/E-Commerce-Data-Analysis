/**
 * Product model for the MarketLens dashboard.
 *
 * Every listing shown here is real: this module starts empty and is filled at
 * boot with a uniform random sample pulled from the Parquet warehouse via the
 * MarketLens API (`src/data/source.ts`). There is no seeded or generated data.
 * Rows are validated on arrival (see `toProduct`).
 *
 * Mutable state lives in THIS module because ES module imports are read-only
 * at call sites; re-assignment of `PRODUCTS` etc. must happen here.
 */

export type Platform = "Amazon" | "Flipkart";
export type StockStatus = "in_stock" | "out_of_stock" | "unknown";

export interface Product {
  product_id: string;
  product_name: string;
  platform: Platform;
  brand: string;
  category: string;
  price: number;
  original_price: number | null;
  discount_percentage: number | null;
  rating: number | null;
  review_count: number | null;
  stock_status: StockStatus;
  product_url: string | null;
  image_url: string | null;
  scraped_at: string;
}

/** Raw listing row as delivered by `GET /api/sample`. */
export interface ApiProductRow {
  product_id: string;
  product_name: string;
  platform: string; // 'amazon' | 'flipkart'
  brand: string | null;
  l1: string | null;
  price: number | null;
  mrp: number | null;
  discount_pct: number | null;
  rating: number | null;
  rating_count: number | null;
  sold_out: boolean;
  product_url: string | null;
  image_url: string | null;
  snapshot_date: string | null;
}

/* ------------------------------------------------------------------ */
/* Live dataset state — filled by `applyRealDataset` at boot.          */
/* ------------------------------------------------------------------ */

export let PRODUCTS: Product[] = [];

export let BRANDS: string[] = [];

/** Top-level categories, derived from the data. */
export let CATEGORIES: string[] = [];

/** Latest Amazon snapshot date in the warehouse ("YYYY-MM-DD"). */
export let COLLECTION_DATE = "";

/** Total rows in the warehouse (whole history, all snapshots), or null if unknown. */
export let DATASET_TOTAL_ROWS: number | null = null;

/** Sample rows dropped because they had no usable price (null or <= 0). */
export let DATASET_DROPPED_NO_PRICE = 0;

export const PLATFORMS: Platform[] = ["Amazon", "Flipkart"];

/**
 * Slider bounds. Neutral placeholders until real data is applied — the filters
 * provider only builds its defaults AFTER `applyRealDataset` has run, so users
 * always start from actual data bounds.
 */
export const PRICE_BOUNDS = { min: 0, max: 100_000 };

export const RATING_BOUNDS = { min: 1, max: 5 };

export const DISCOUNT_BOUNDS = { min: 0, max: 100 };

export const REVIEW_BOUNDS = { min: 0, max: 10_000 };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Map + validate one API row.
 * Validation rules (real dumps have noisy fields):
 *   - rows with no usable price are dropped, not faked with 0
 *   - rating is kept only within 0–5
 *   - discount is clamped to 0–100
 * Returns null for rows that must be rejected.
 */
function toProduct(row: ApiProductRow): Product | null {
  const price = row.price ?? 0;
  if (!(price > 0)) return null;

  const rating =
    row.rating !== null && row.rating >= 0 && row.rating <= 5 ? row.rating : null;
  const discountPercentage =
    row.discount_pct === null ? null : clamp(Math.round(row.discount_pct), 0, 100);

  return {
    product_id: row.product_id,
    product_name: row.product_name,
    platform: row.platform === "flipkart" ? "Flipkart" : "Amazon",
    brand: row.brand ?? "Unknown",
    category: row.l1 ?? "Other",
    price,
    original_price: row.mrp !== null && row.mrp > 0 ? row.mrp : null,
    discount_percentage: discountPercentage,
    rating,
    review_count: row.rating_count !== null && row.rating_count >= 0 ? row.rating_count : null,
    stock_status: row.sold_out ? "out_of_stock" : "in_stock",
    product_url: row.product_url,
    image_url: row.image_url,
    scraped_at: row.snapshot_date ?? "",
  };
}

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.min(
    sortedAsc.length - 1,
    Math.max(0, Math.floor((p / 100) * (sortedAsc.length - 1))),
  );
  return sortedAsc[idx] ?? 0;
}

/** Swap the dashboard onto a real warehouse sample and re-derive all facets. */
export function applyRealDataset(
  rows: ApiProductRow[],
  totalRows: number | null,
  collectionDate: string | null,
): void {
  const mapped: Product[] = [];
  for (const row of rows) {
    const product = toProduct(row);
    if (product) mapped.push(product);
  }
  DATASET_DROPPED_NO_PRICE = rows.length - mapped.length;
  if (mapped.length === 0) return;

  PRODUCTS = mapped;
  if (collectionDate) COLLECTION_DATE = collectionDate;
  DATASET_TOTAL_ROWS = totalRows;

  BRANDS = Array.from(new Set(PRODUCTS.map((p) => p.brand))).sort();

  const categoryCounts = new Map<string, number>();
  for (const p of PRODUCTS) {
    categoryCounts.set(p.category, (categoryCounts.get(p.category) ?? 0) + 1);
  }
  CATEGORIES = Array.from(categoryCounts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 12)
    .map(([name]) => name)
    .sort();

  const prices = mapped.map((p) => p.price).sort((a, b) => a - b);
  PRICE_BOUNDS.min = Math.floor(prices[0] ?? 0);
  PRICE_BOUNDS.max = Math.ceil(percentile(prices, 99.5));

  const discounts = mapped.map((p) => p.discount_percentage ?? 0).sort((a, b) => a - b);
  DISCOUNT_BOUNDS.min = discounts[0] ?? 0;
  DISCOUNT_BOUNDS.max = Math.ceil(percentile(discounts, 99.5));

  const reviews = mapped.map((p) => p.review_count ?? 0).sort((a, b) => a - b);
  REVIEW_BOUNDS.max = Math.max(percentile(reviews, 99.5), 1);
}

/* ------------------------------------------------------------------ */
/* Cross-marketplace matching                                          */
/* ------------------------------------------------------------------ */

export interface MatchedPair {
  key: string;
  brand: string;
  category: string;
  product_name: string;
  amazon: Product | null;
  flipkart: Product | null;
}

/** Normalized key used to match the same product across the two marketplaces. */
function matchKey(p: Pick<Product, "brand" | "category" | "product_name">) {
  const name = p.product_name
    .replace(/\s*\((?:[^)]*)\)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return `${p.category}|${p.brand.toLowerCase()}|${name}`;
}

/** Products that appear on both marketplaces under the same normalized identity. */
export function buildMatchedPairs(products: Product[]): MatchedPair[] {
  const byKey = new Map<string, MatchedPair>();
  for (const p of products) {
    const key = matchKey(p);
    let entry = byKey.get(key);
    if (!entry) {
      entry = {
        key,
        brand: p.brand,
        category: p.category,
        product_name: p.product_name,
        amazon: null,
        flipkart: null,
      };
      byKey.set(key, entry);
    }
    if (p.platform === "Amazon" && !entry.amazon) entry.amazon = p;
    if (p.platform === "Flipkart" && !entry.flipkart) entry.flipkart = p;
  }
  return Array.from(byKey.values());
}
