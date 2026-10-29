import { useMemo, useState } from "react";
import { FilterBar } from "@/components/filters/FilterBar";
import { EmptyState } from "@/components/panels";
import { ProductDrawer } from "@/components/products/ProductDrawer";
import { ProductTable } from "@/components/products/ProductTable";
import type { Product } from "@/data/dataset";
import { useFilters } from "@/context/FiltersContext";
import { formatCompact } from "@/lib/format";



export function ExplorerPage() {
  const { filteredProducts: ps } = useFilters();
  const [selected, setSelected] = useState<Product | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const platformCounts = useMemo(() => {
    const amazon = ps.filter((p) => p.platform === "Amazon").length;
    return { amazon, flipkart: ps.length - amazon };
  }, [ps]);

  const openProduct = (p: Product) => {
    setSelected(p);
    setDrawerOpen(true);
  };

  return (
    <div className="space-y-3.5">
      <FilterBar />

      <ProductTable
        products={ps}
        defaultColumns={[
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
        ]}
        onRowClick={openProduct}
        enableSelection
        enableExport
        exportName="marketlens-catalog-export"
        initialPageSize={25}
      />

      {ps.length > 0 ? (
        <p className="pb-2 text-[11px] text-slate-500 dark:text-slate-400">
          {formatCompact(platformCounts.amazon)} Amazon and {formatCompact(platformCounts.flipkart)}{" "}
          Flipkart listings match the active filters. Click any row to inspect the full product attributes or select rows for bulk export.
        </p>
      ) : (
        <EmptyState />
      )}

      <ProductDrawer product={selected} open={drawerOpen} onOpenChange={setDrawerOpen} />
    </div>
  );
}
