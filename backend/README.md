# MarketLens Backend

FastAPI + DuckDB analytical API over the local **Amazon + Flipkart product-daily dumps**
(~4,500 `.csv.gz` files, ~22.6 M rows, ~22 GB compressed — 2026-06-06 → 2026-10-27).

There is **no reliable free public API** for Amazon.in / Flipkart marketplace data —
this backend treats your local dumps as the data source and makes them queryable
in seconds.

---

## Architecture

```
amazon-data\YYYYMMDD\*.csv.gz ─┐
                               ├─► scripts/ingest.py ─► backend/warehouse/<source>/<yyyy-mm-dd>/*.parquet
flipkart-data\YYYYMMDD\*.csv.gz┘        (zstd, incremental)      │
                                                                  ▼
                                     FastAPI endpoints ◄── DuckDB SQL over Parquet
```

- **One-time conversion**: raw gz → compressed **Parquet** (~15–25 GB on disk). Zipf-speed queries after.
- **DuckDB** runs the aggregations locally (columnar scans, predicate pushdown, disk spilling).
- **Snapshot mode**: every page defaults to each platform's *latest* scraped day, so the daily
  re-scrape of the same product never double counts. Trends/history use explicit date ranges.
- **Incremental** ingestion: re-running never re-converts files already done.

## Demo-scale sampling (college project note)

The warehouse does NOT need all 4,529 raw files to demonstrate analytics. This
repository currently marks a **sampled demo coverage** optimized for chart density:

- **Amazon**: every 2nd day from 2026-06-06 → 2026-10-27 (~69 days × 8 shards)
- **Flipkart**: every 3rd day from 2026-06-06 → 2026-09-10 (~31 days × ~37 shards)
- Result: smooth multi-platform trend lines in `/api/trends`, full snapshot coverage
  for every other page — at **~1.2 GB** Parquet instead of ~20 GB.

Re-running `python scripts\ingest.py` with a date range converts additional days
into the same warehouse without touching what's already there.

## Install & run

```powershell
cd backend
pip install -r requirements.txt

# Build the warehouse (first run ingests everything, ~2 h; afterwards it is instant/incremental)
python scripts\ingest.py                       # both platforms, all dates
python scripts\ingest.py --source amazon --start 2026-06-06 --end 2026-06-30
python scripts\ingest.py --max-files 5         # quick smoke test

# Sanity-check the warehouse
python scripts\check.py

# Start the API (from the backend folder)
python -m uvicorn app.main:app --reload --port 8000
```

Interactive API docs: <http://localhost:8000/docs>

## API

Common filter params (all list endpoints): `platform=all|amazon|flipkart`,
`snapshot_date=YYYY-MM-DD`, `q` (name/brand search), `l1..l5` (category levels),
`brand` (comma-separated), `min_price/max_price`, `min_discount`, `min_rating/max_rating`,
`stock=in|out`.

| Endpoint | Purpose |
|---|---|
| `GET /api/meta` | Warehouse dates, row counts per platform, latest snapshot dates |
| `GET /api/facets` | l1 categories, top brands, available snapshot dates |
| `GET /api/categories/tree?l1=` | l1 → l2 → l3 drill-down with listing counts |
| `GET /api/search?q=` | Type-ahead product suggestions |
| `GET /api/products` | Filterable, sortable, paginated listings (`sort=price|mrp|discount_pct|rating|rating_count|product_name`, `order`, `page`, `page_size`) |
| `GET /api/overview` | KPIs (avg/median price, avg discount, avg rating, stock split) + top categories/brands + rating bands |
| `GET /api/price-analysis?bins=12` | Price histogram, category×platform median prices, top-brand medians, avg MRP vs current price per category, discount-band distribution |
| `GET /api/ratings-reviews` | Rating bands, rating × review scatter (sampled), top-reviewed / top-rated products, per-category & per-platform stats |
| `GET /api/stock-analysis` | In/out of stock KPIs, by platform & category, sample of sold-out listings |
| `GET /api/platform-comparison` | Amazon vs Flipkart aggregates + products sold on **both** marketplaces matched by brand + name (price gap table) |
| `GET /api/trends?start_date=&end_date=` | Per-day, per-platform time series: listings, median price, avg discount, avg rating, in-stock % |
| `GET /api/products/export?fmt=csv\|json` | Download the current (filtered) listing snapshot |
| `GET /api/ingest/status` · `POST /api/ingest` | Manifest inspection / trigger ingestion from HTTP |

## Warehouse layout

```
backend/warehouse/
  amazon/2026-10-27/AMAZON_..._01_MALL_VRS.parquet   # 1 parquet per raw shard
  flipkart/2026-08-30/FLIPKART_..._01.parquet
  _manifest.parquet                                   # atomic file/row inventory
```

Normalized columns: `product_id, catalog_id, platform, snapshot_date, scraped_at, product_name,
image_url, l1..l5, brand, price, mrp, discount_pct, rating, rating_count, sold_out, product_url,
arrival_date, shipping_charges`.

Data notes (from smoke ingestion):

- `product_id` is unique per platform per day (0 duplicates across ~259 k rows) — no dedupe needed.
- ~35 % of Amazon "old user" rows have `N/A` price (sold-out / price-hidden pages) — price
  aggregations null-guard these.
- Brand from the `others` JSON blob (~93 % coverage); rating fields (~85 % coverage).

## Configuration (env vars)

| Var | Default | Meaning |
|---|---|---|
| `AMAZON_DATA_DIR` | `../amazon-data` | Raw Amazon dumps |
| `FLIPKART_DATA_DIR` | `../flipkart-data` | Raw Flipkart dumps |
| `WAREHOUSE_DIR` | `backend/warehouse` | Parquet warehouse output |
| `DUCKDB_MEMORY_LIMIT` | `2GB` | DuckDB RAM budget (spills beyond) |
| `CORS_ORIGINS` | dev ports | Comma-separated allowed origins |

⚠ Ingestion writes only Parquet files (no DuckDB database file), so the API and the
`scripts/ingest.py` CLI can run at the same time without lock conflicts.
