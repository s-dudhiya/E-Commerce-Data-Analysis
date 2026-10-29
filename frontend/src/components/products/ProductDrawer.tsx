import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { Product } from "@/data/dataset";
import { formatCompact, formatCurrency, formatPercent, formatRating } from "@/lib/format";

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="text-right text-sm tabular-nums text-foreground">{value}</span>
    </div>
  );
}

export function ProductDrawer({
  product,
  open,
  onOpenChange,
}: {
  product: Product | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!product) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader className="pb-2">
          <SheetTitle className="text-base leading-snug">{product.product_name}</SheetTitle>
          <SheetDescription className="text-xs">
            {product.brand} · {product.category}
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-6">
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={
                product.platform === "Amazon"
                  ? "border-amazon/30 bg-primary/5 text-amazon"
                  : "border-flipkart/40 bg-flipkart/10 text-flipkart"
              }
            >
              {product.platform}
            </Badge>
            <Badge
              variant="outline"
              className="font-mono text-[11px] font-normal text-muted-foreground"
            >
              {product.product_id}
            </Badge>
          </div>

          <div className="mt-4 rounded-md border bg-muted/40 p-4">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold tabular-nums">
                {formatCurrency(product.price)}
              </span>
              {product.original_price !== null && (
                <span className="text-sm text-muted-foreground line-through">
                  {formatCurrency(product.original_price)}
                </span>
              )}
              {product.discount_percentage !== null && (
                <span className="text-sm font-medium text-primary">
                  {formatPercent(product.discount_percentage, 0)} off
                </span>
              )}
            </div>
            {product.original_price === null && (
              <p className="mt-1 text-xs text-muted-foreground">No discount recorded</p>
            )}
          </div>

          <Separator className="my-4" />

          <div className="divide-y">
            <DetailRow
              label="Rating"
              value={product.rating === null ? "Not rated" : `${formatRating(product.rating)} / 5`}
            />
            <DetailRow
              label="Review count"
              value={
                product.review_count === null
                  ? "No reviews"
                  : `${formatCompact(product.review_count)} (${product.review_count.toLocaleString("en-IN")})`
              }
            />
            <DetailRow
              label="Stock status"
              value={
                product.stock_status === "in_stock"
                  ? "In stock"
                  : product.stock_status === "out_of_stock"
                    ? "Out of stock"
                    : "Unknown"
              }
            />
            <DetailRow label="Platform" value={product.platform} />
            <DetailRow label="Brand" value={product.brand} />
            <DetailRow label="Category" value={product.category} />
            <DetailRow label="Product ID" value={product.product_id} />
            <DetailRow label="Collected" value={product.scraped_at} />
          </div>

          <p className="mt-4 rounded-md border border-dashed p-2.5 text-[11px] leading-relaxed text-muted-foreground">
            Product URL and image are not part of this sample dataset. Connect a real scraped
            dataset to enrich listings with links and imagery.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
