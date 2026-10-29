import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { Product, StockStatus } from "@/data/dataset";
import { COLLECTION_DATE } from "@/data/dataset";
import {
  formatCompact,
  formatCurrency,
  formatNumber,
  formatPercent,
  formatRating,
} from "@/lib/format";
import { cn } from "@/lib/utils";

export type ColumnKey =
  | "product_id"
  | "product_name"
  | "platform"
  | "brand"
  | "category"
  | "price"
  | "original_price"
  | "discount_percentage"
  | "rating"
  | "review_count"
  | "stock_status"
  | "scraped_at";

const ALL_COLUMNS: ColumnKey[] = [
  "product_id",
  "product_name",
  "platform",
  "brand",
  "category",
  "price",
  "original_price",
  "discount_percentage",
  "rating",
  "review_count",
  "stock_status",
  "scraped_at",
];

const COLUMN_LABELS: Record<ColumnKey, string> = {
  product_id: "Product ID",
  product_name: "Product",
  platform: "Platform",
  brand: "Brand",
  category: "Category",
  price: "Price",
  original_price: "Original Price",
  discount_percentage: "Discount",
  rating: "Rating",
  review_count: "Reviews",
  stock_status: "Stock",
  scraped_at: "Collected",
};

const NUMERIC_COLUMNS: ColumnKey[] = [
  "price",
  "original_price",
  "discount_percentage",
  "rating",
  "review_count",
];

const STOCK_LABEL: Record<StockStatus, string> = {
  in_stock: "In stock",
  out_of_stock: "Out of stock",
  unknown: "Unknown",
};

function StockBadge({ status }: { status: StockStatus }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "whitespace-nowrap border px-1.5 font-normal text-[11px]",
        status === "in_stock" && "border-primary/30 bg-primary/5 text-primary",
        status === "out_of_stock" && "border-destructive/30 bg-destructive/5 text-destructive",
        status === "unknown" && "text-muted-foreground",
      )}
    >
      {STOCK_LABEL[status]}
    </Badge>
  );
}

function PlatformBadge({ platform }: { platform: string }) {
  const isAmazon = platform === "Amazon";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold border shadow-2xs transition-colors",
        isAmazon
          ? "border-slate-300 bg-slate-100 text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          : "border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-indigo-800/80 dark:bg-indigo-950/60 dark:text-indigo-300"
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          isAmazon ? "bg-slate-600 dark:bg-slate-300" : "bg-indigo-600 dark:bg-indigo-400"
        )}
      />
      {platform}
    </span>
  );
}

type SortState = { key: ColumnKey; dir: "asc" | "desc" } | null;

function sortProducts(products: Product[], sort: SortState): Product[] {
  if (!sort) return products;
  const { key, dir } = sort;
  const mult = dir === "asc" ? 1 : -1;
  return [...products].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * mult;
    return String(av).localeCompare(String(bv)) * mult;
  });
}

function toCsv(products: Product[], columns: ColumnKey[]): string {
  const header = columns.join(",");
  const rows = products.map((p) =>
    columns
      .map((c) => {
        const v = p[c];
        if (v === null || v === undefined) return "";
        const s = String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      })
      .join(","),
  );
  return [header, ...rows].join("\n");
}

function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export interface ProductTableProps {
  products: Product[];
  defaultColumns?: ColumnKey[];
  onRowClick?: (p: Product) => void;
  enableSelection?: boolean;
  enableExport?: boolean;
  exportName?: string;
  initialPageSize?: number;
  className?: string;
}

export function ProductTable({
  products,
  defaultColumns = ALL_COLUMNS,
  onRowClick,
  enableSelection = false,
  enableExport = false,
  exportName = "marketlens-products",
  initialPageSize = 50,
  className,
}: ProductTableProps) {
  const [visible, setVisible] = useState<ColumnKey[]>(defaultColumns);
  const [sort, setSort] = useState<SortState>(null);
  const [page, setPage] = useState(0);
  const pageSize = 50;
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const sorted = useMemo(() => sortProducts(products, sort), [products, sort]);
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const rows = sorted.slice(safePage * pageSize, (safePage + 1) * pageSize);

  const toggleSort = (key: ColumnKey) => {
    setSort((prev) => {
      if (prev?.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return null;
    });
    setPage(0);
  };

  const toggleRow = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allPageSelected = rows.length > 0 && rows.every((r) => selected.has(r.product_id));

  const toggleAllPage = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allPageSelected) rows.forEach((r) => next.delete(r.product_id));
      else rows.forEach((r) => next.add(r.product_id));
      return next;
    });

  return (
    <div className={cn("overflow-hidden rounded-md border bg-card", className)}>
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        {enableSelection && (
          <span className="text-xs text-muted-foreground">
            {selected.size > 0
              ? `${selected.size.toLocaleString("en-IN")} row${selected.size > 1 ? "s" : ""} selected`
              : "No rows selected"}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {enableExport && (
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={() =>
                  download(`${exportName}.csv`, toCsv(products, visible), "text/csv;charset=utf-8")
                }
                title="Export the currently filtered dataset as CSV"
              >
                <Download className="h-3.5 w-3.5" strokeWidth={1.75} />
                CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={() =>
                  download(
                    `${exportName}.json`,
                    JSON.stringify(products, null, 2),
                    "application/json",
                  )
                }
                title="Export the currently filtered dataset as JSON"
              >
                <Download className="h-3.5 w-3.5" strokeWidth={1.75} />
                JSON
              </Button>
            </div>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 text-xs">
                Columns ({visible.length}/{ALL_COLUMNS.length})
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
              <DropdownMenuLabel className="text-xs">Visible columns</DropdownMenuLabel>
              {ALL_COLUMNS.map((col) => (
                <DropdownMenuCheckboxItem
                  key={col}
                  checked={visible.includes(col)}
                  onCheckedChange={(checked) =>
                    setVisible((prev) => (checked ? [...prev, col] : prev.filter((c) => c !== col)))
                  }
                  className="text-xs"
                  onSelect={(e) => e.preventDefault()}
                >
                  {COLUMN_LABELS[col]}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <TooltipProvider delayDuration={200}>
        <div className="max-h-[640px] overflow-auto">
          <Table className="min-w-[900px]">
            <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_var(--color-border)]">
              <TableRow className="hover:bg-card">
                {enableSelection && (
                  <TableHead className="w-9">
                    <input
                      type="checkbox"
                      checked={allPageSelected}
                      onChange={toggleAllPage}
                      aria-label="Select all rows on this page"
                      className="h-3.5 w-3.5 accent-[var(--color-primary)]"
                    />
                  </TableHead>
                )}
                {visible.map((col) => (
                  <TableHead
                    key={col}
                    onClick={() => toggleSort(col)}
                    className={cn(
                      "cursor-pointer select-none whitespace-nowrap text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground hover:text-foreground",
                      NUMERIC_COLUMNS.includes(col) && "text-right",
                      col === "product_name" && "min-w-[260px]",
                    )}
                  >
                    <span className="inline-flex items-center gap-1">
                      {COLUMN_LABELS[col]}
                      {sort?.key === col &&
                        (sort.dir === "asc" ? (
                          <ArrowUp className="h-3 w-3" />
                        ) : (
                          <ArrowDown className="h-3 w-3" />
                        ))}
                    </span>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={visible.length + (enableSelection ? 1 : 0)}
                    className="h-32 text-center text-sm text-muted-foreground"
                  >
                    No products match the active filters.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((p) => (
                  <TableRow
                    key={p.product_id}
                    onClick={() => onRowClick?.(p)}
                    className={cn(
                      "border-b",
                      onRowClick && "cursor-pointer",
                      selected.has(p.product_id) && "bg-accent/50",
                    )}
                  >
                    {enableSelection && (
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selected.has(p.product_id)}
                          onChange={() => toggleRow(p.product_id)}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Select ${p.product_name}`}
                          className="h-3.5 w-3.5 accent-[var(--color-primary)]"
                        />
                      </TableCell>
                    )}
                    {visible.map((col) => {
                      const numeric = NUMERIC_COLUMNS.includes(col);
                      const cellClass = cn("py-1.5 text-xs", numeric && "text-right tabular-nums");
                      switch (col) {
                        case "product_id":
                          return (
                            <TableCell
                              key={col}
                              className={cn(
                                cellClass,
                                "font-mono text-[11px] text-muted-foreground",
                              )}
                            >
                              {p.product_id}
                            </TableCell>
                          );
                        case "product_name":
                          return (
                            <TableCell key={col} className={cellClass}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="block max-w-[280px] truncate text-foreground">
                                    {p.product_name}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="right" className="max-w-xs">
                                  <span>{p.product_name}</span>
                                </TooltipContent>
                              </Tooltip>
                            </TableCell>
                          );
                        case "platform":
                          return (
                            <TableCell key={col} className={cellClass}>
                              <PlatformBadge platform={p.platform} />
                            </TableCell>
                          );
                        case "price":
                          return (
                            <TableCell key={col} className={cn(cellClass, "font-medium")}>
                              {formatCurrency(p.price)}
                            </TableCell>
                          );
                        case "original_price":
                          return (
                            <TableCell
                              key={col}
                              className={cn(
                                cellClass,
                                "text-muted-foreground line-through decoration-border",
                              )}
                            >
                              {p.original_price === null ? "—" : formatCurrency(p.original_price)}
                            </TableCell>
                          );
                        case "discount_percentage":
                          return (
                            <TableCell key={col} className={cellClass}>
                              {p.discount_percentage === null
                                ? "—"
                                : formatPercent(p.discount_percentage, 0)}
                            </TableCell>
                          );
                        case "rating":
                          return (
                            <TableCell key={col} className={cellClass}>
                              {p.rating === null ? "—" : formatRating(p.rating)}
                            </TableCell>
                          );
                        case "review_count":
                          return (
                            <TableCell key={col} className={cellClass}>
                              {p.review_count === null ? "—" : formatNumber(p.review_count)}
                            </TableCell>
                          );
                        case "stock_status":
                          return (
                            <TableCell key={col} className={cellClass}>
                              <StockBadge status={p.stock_status} />
                            </TableCell>
                          );
                        case "scraped_at":
                          return (
                            <TableCell
                              key={col}
                              className={cn(cellClass, "whitespace-nowrap text-muted-foreground")}
                            >
                              {COLLECTION_DATE}
                            </TableCell>
                          );
                        default:
                          return (
                            <TableCell key={col} className={cn(cellClass, "whitespace-nowrap")}>
                              {String(p[col] ?? "—")}
                            </TableCell>
                          );
                      }
                    })}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </TooltipProvider>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2">
        <span className="text-xs text-muted-foreground">
          {sorted.length === 0
            ? "0 results"
            : `${(safePage * pageSize + 1).toLocaleString("en-IN")}–${Math.min(
                sorted.length,
                (safePage + 1) * pageSize,
              ).toLocaleString("en-IN")} of ${formatCompact(sorted.length)} rows`}
          {sort && " · sorted"}
        </span>
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-7 w-7 p-0"
            disabled={safePage === 0}
            onClick={() => setPage(safePage - 1)}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="px-1 text-xs tabular-nums text-muted-foreground">
            Page {safePage + 1} of {pageCount}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-7 w-7 p-0"
            disabled={safePage >= pageCount - 1}
            onClick={() => setPage(safePage + 1)}
            aria-label="Next page"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
