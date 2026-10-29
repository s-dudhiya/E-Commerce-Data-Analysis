import type { Product } from "@/data/dataset";

export function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

export function mean(values: number[]): number | null {
  return values.length ? sum(values) / values.length : null;
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  if (s.length % 2) return s[mid] ?? null;
  const lo = s[mid - 1];
  const hi = s[mid];
  return lo !== undefined && hi !== undefined ? (lo + hi) / 2 : null;
}

export function groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const arr = map.get(key);
    if (arr) arr.push(item);
    else map.set(key, [item]);
  }
  return map;
}

export function countBy<T>(items: T[], keyFn: (item: T) => string): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of items) {
    const key = keyFn(item);
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}

export function histogram(
  values: number[],
  binStart: number,
  binSize: number,
  binCount: number,
): { from: number; to: number; count: number }[] {
  const bins = Array.from({ length: binCount }, (_, i) => ({
    from: binStart + i * binSize,
    to: binStart + (i + 1) * binSize,
    count: 0,
  }));
  for (const v of values) {
    const idx = Math.min(binCount - 1, Math.floor((v - binStart) / binSize));
    const bin = idx >= 0 ? bins[idx] : undefined;
    if (bin) bin.count++;
  }
  return bins;
}
