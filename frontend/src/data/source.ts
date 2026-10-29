/**
 * Live-data bootstrap: fills the dashboard with a uniform random sample of the
 * real Parquet warehouse served by the MarketLens FastAPI backend.
 *
 * There is no local fallback dataset — if the backend is unreachable the
 * caller (FiltersContext) shows an error state with a retry button.
 */
import { applyRealDataset, PRODUCTS, type ApiProductRow } from "@/data/dataset";

const API_BASE: string =
  (import.meta.env["VITE_API_BASE"] as string | undefined) ?? "http://127.0.0.1:8000";

export type DatasetSource = "backend" | "unreachable";

function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

interface SamplePayload {
  items: ApiProductRow[];
  total_rows: number;
  total_matched: number;
  latest_dates: Record<string, string | null>;
}

let inFlightPromise: Promise<DatasetSource> | null = null;

/** Boot the dashboard with real warehouse data. Never throws. */
export async function ensureRealDataset(): Promise<DatasetSource> {
  if (PRODUCTS.length > 0) {
    return "backend";
  }

  if (inFlightPromise) {
    return inFlightPromise;
  }

  inFlightPromise = (async () => {
    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/sample?size=4000`, 30_000);
      if (!res.ok) throw new Error(`MarketLens API responded ${res.status}`);
      const payload = (await res.json()) as SamplePayload;
      if (!payload.items || payload.items.length === 0) throw new Error("empty sample");
      applyRealDataset(
        payload.items,
        payload.total_rows ?? null,
        payload.latest_dates?.["amazon"] ?? payload.latest_dates?.["flipkart"] ?? null,
      );
      return "backend";
    } catch (err) {
      console.warn("[MarketLens] Backend not reachable at", API_BASE, err);
      return "unreachable";
    } finally {
      inFlightPromise = null;
    }
  })();

  return inFlightPromise;
}

export interface TrendDay {
  platform: "amazon" | "flipkart";
  snapshot_date: string;
  listings: number;
  median_price: number;
  avg_discount: number;
  avg_rating: number;
  in_stock_pct: number;
}

export interface TrendsPayload {
  series: {
    amazon?: TrendDay[];
    flipkart?: TrendDay[];
  };
  rows: TrendDay[];
}

let cachedTrends: TrendsPayload | null = null;

export async function fetchPlatformTrends(): Promise<TrendsPayload> {
  if (cachedTrends) return cachedTrends;
  try {
    const res = await fetchWithTimeout(`${API_BASE}/api/trends`, 30_000);
    if (!res.ok) throw new Error(`Trends API returned ${res.status}`);
    const data = (await res.json()) as TrendsPayload;
    cachedTrends = data;
    return data;
  } catch (err) {
    console.warn("[MarketLens] Trends API failed, returning empty series", err);
    return { series: {}, rows: [] };
  }
}

export interface ProductMovementItem {
  product_id: string;
  product_name: string;
  platform: "amazon" | "flipkart";
  brand: string | null;
  category: string | null;
  prev_date: string | null;
  snapshot_date: string;
  prev_price: number | null;
  price: number | null;
  mrp: number | null;
  discount_pct: number | null;
  price_delta: number | null;
  price_delta_pct: number | null;
  prev_sold_out: boolean | null;
  sold_out: boolean;
  change_kind: "price_drop" | "price_hike" | "out_of_stock" | "restocked" | "price_change";
  image_url: string | null;
  product_url: string | null;
}

export interface ProductDynamicsKPIs {
  price_drops: number;
  price_hikes: number;
  out_of_stock: number;
  restocked: number;
  avg_price_drop: number;
  avg_price_hike: number;
  total_changes: number;
}

export interface ProductDynamicsPayload {
  platform: "amazon" | "flipkart";
  snapshot_date: string | null;
  prev_date: string | null;
  available_dates: string[];
  kpis: ProductDynamicsKPIs;
  items: ProductMovementItem[];
  total_items: number;
  page: number;
  page_size: number;
}

export interface ProductHistoryPoint {
  snapshot_date: string;
  price: number | null;
  mrp: number | null;
  discount_pct: number | null;
  sold_out: boolean;
  rating: number | null;
  rating_count: number | null;
}

export interface ProductHistoryPayload {
  platform: string;
  product_id: string;
  product_name: string | null;
  brand: string | null;
  category: string | null;
  image_url: string | null;
  product_url: string | null;
  history: ProductHistoryPoint[];
}

export async function fetchProductDynamics(params: {
  platform?: string | undefined;
  snapshot_date?: string | undefined;
  compare_date?: string | undefined;
  change_type?: string | undefined;
  q?: string | undefined;
  l1?: string | undefined;
  brand?: string | undefined;
  sort?: string | undefined;
  order?: string | undefined;
  page?: number | undefined;
  page_size?: number | undefined;
}): Promise<ProductDynamicsPayload | null> {
  const query = new URLSearchParams();
  if (params.platform) query.set("platform", params.platform);
  if (params.snapshot_date) query.set("snapshot_date", params.snapshot_date);
  if (params.compare_date) query.set("compare_date", params.compare_date);
  if (params.change_type) query.set("change_type", params.change_type);
  if (params.q) query.set("q", params.q);
  if (params.l1) query.set("l1", params.l1);
  if (params.brand) query.set("brand", params.brand);
  if (params.sort) query.set("sort", params.sort);
  if (params.order) query.set("order", params.order);
  if (params.page) query.set("page", String(params.page));
  if (params.page_size) query.set("page_size", String(params.page_size));

  try {
    const res = await fetchWithTimeout(`${API_BASE}/api/product-dynamics?${query.toString()}`, 30_000);
    if (!res.ok) throw new Error(`Product dynamics API returned ${res.status}`);
    return (await res.json()) as ProductDynamicsPayload;
  } catch (err) {
    console.warn("[MarketLens] Product dynamics API failed", err);
    return null;
  }
}

const historyCache = new Map<string, ProductHistoryPayload>();
const inFlightHistory = new Map<string, Promise<ProductHistoryPayload | null>>();

export async function fetchProductHistory(
  platform: string,
  productId: string
): Promise<ProductHistoryPayload | null> {
  const cacheKey = `${platform.toLowerCase()}:${productId.trim()}`;
  if (historyCache.has(cacheKey)) {
    return historyCache.get(cacheKey)!;
  }
  if (inFlightHistory.has(cacheKey)) {
    return inFlightHistory.get(cacheKey)!;
  }

  const promise = (async () => {
    try {
      const res = await fetchWithTimeout(
        `${API_BASE}/api/product-history?platform=${encodeURIComponent(platform)}&product_id=${encodeURIComponent(productId)}`,
        20_000
      );
      if (!res.ok) throw new Error(`Product history API returned ${res.status}`);
      const data = (await res.json()) as ProductHistoryPayload;
      historyCache.set(cacheKey, data);
      return data;
    } catch (err) {
      console.warn("[MarketLens] Product history API failed", err);
      return null;
    } finally {
      inFlightHistory.delete(cacheKey);
    }
  })();

  inFlightHistory.set(cacheKey, promise);
  return promise;
}

export function prefetchProductHistory(platform: string, productId: string): void {
  const cacheKey = `${platform.toLowerCase()}:${productId.trim()}`;
  if (!historyCache.has(cacheKey) && !inFlightHistory.has(cacheKey)) {
    fetchProductHistory(platform, productId);
  }
}


