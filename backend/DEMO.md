# MarketLens — College Demo Guide

Copy-paste talking points + endpoint mapping for your presentation.

---

## 1. Opening story (30 seconds)

> "This is **MarketLens** — a price-intelligence dashboard for the two biggest Indian
> marketplaces, Amazon.in and Flipkart. The raw dataset is ~4,500 daily CSV dumps —
> 22 GB, **22.6 million rows** covering every product listing they performed over
> ~4 months (6 Jun – 27 Oct 2026). Naively loading that into a browser crashes it;
> naively loading it into pandas exhausts 64 GB of RAM. Instead I built a pipeline
> that converts the dumps **once** into a columnar **Parquet warehouse** and queries
> them with **DuckDB** — so every answer the dashboard shows comes back in
> milliseconds, running 100 % offline on my laptop. No paid APIs, no cloud costs."

## 2. Architecture slide (the "how")

```
raw .csv.gz (22 GB, 4,529 files)
      │  scripts/ingest.py  — incremental, resumable, zstd-compressed
      ▼
Parquet warehouse  (~2–25 GB, partitioned by platform/day)
      │  DuckDB (columnar engine, predicate + partition pushdown)
      ▼
FastAPI backend  ── 11 analytics/CRUD endpoints
      ▼
React frontend   ── dashboards, tables, charts
```

Talking points:
- **Why Parquet?** Columnar encoding + zstd compression = ~10× smaller than raw CSV,
  and a query can read ONLY the columns it needs (1 GB file → reads ~30 MB).
- **Why DuckDB?** Same engine family as Spark/ClickHouse but zero-configuration;
  spills to disk for joins bigger than RAM. Exactly what modern
  "data lake + lakehouse" stacks do; we run it single-node.
- **Why snapshot mode?** The same ASIN appears every day. Every page defaults to
  "each platform at its latest scraped day" so daily re-scrapes don't double count.
  `/api/trends` is the one endpoint that intentionally switches to day-by-day history.

## 3. The 5 demo pages (what to click, what to say)

| # | Page / Endpoint | What you show | Line to say |
|---|---|---|---|
| 1 | **Overview** — `GET /api/overview` | Total listings, avg vs median price, avg discount, avg rating, stock split, top categories & brands, rating-band bar | "The median listing is ₹430 but the average is ₹1,950 — a classic long tail of expensive electronics that a naive 'average' hides." |
| 2 | **Price analysis** — `GET /api/price-analysis` | Price histogram, category×platform median table, brand median top-10, MRP vs current price per category, discount band distribution | "Flipkart discounts harder in fashion, Amazon competes on the under-₹500 pack price point — you can see it by comparing median per category." |
| 3 | **Ratings & reviews** — `GET /api/ratings-reviews` | Rating bands, price-vs-rating scatter, top-reviewed list, per-category avg rating | "Over 1.1 billion review counts across all listings; median listing has ~117 reviews — popularity is extremely top-skewed." |
| 4 | **Stock analysis** — `GET /api/stock-analysis` | In-stock % by platform and by category, sample of sold-out hot items | "About 54 % of listings are flagged sold-out — availability is genuinely a competitive signal." |
| 5 | **Platform comparison** — `GET /api/platform-comparison` | Amazon vs Flipkart summary cards + matched-products price-gap table | "Same name + same brand sold on both marketplaces → we compute who is cheaper. That's an arbitrage table a reseller could use." |
| 6 | **Trends** — `GET /api/trends?start_date=…&end_date=…` | Median price / discount / availability over time | "This is the time-series value: price movement per category per week — impossible to get via any free API." |

## 4. Conclusions to present

1. **Long-tail pricing** — median ₹430 vs avg ₹1,950. Mean is misleading in retail.
2. **Discount culture** — ~62 % of Flipkart listings carry a visible discount; deepest
   discounts cluster in Beauty and Clothing categories (40–60 % bands).
3. **Review concentration** — few listings hold most reviews; a product without ≥
   100 reviews barely competes on trust.
4. **Cross-platform arbitrage** — real matched products exist; you can compute the
   price gap per product with a single SQL join on normalized names.
5. **Time-series treasury** — daily snapshot panel = the real asset (price wars over
   sale events, discount creep, restock cycles).

## 5. Possible extensions (say this if asked "what next?")

- Daily auto-ingest cron → monitoring/alerting on price drops.
- Category-embedding + fuzzy matching (product name → normalized ASIN↔PID map).
- Demand proxy forecasting from review_velocity (delta of rating_count/day).
- Deploy: Docker compose (FastAPI + Nginx) or Streamlit static export for offline judging.

## 6. Technical Q&A cheat sheet

**Q: Why not pandas / Excel?**
Converting 22 GB consumes >50 GB RAM — DuckDB is a columnar engine that spills to
disk and reads Parquet natively. Excel caps at ~1 M rows.

**Q: Why not an online API?**
No free API exists for Amazon.in/Flipkart marketplace levels of depth. Official
APIs need affiliate approval and return limited fields; paid scrapers (Rainforest,
SerpApi) cost ~$50+/mo for 100–200 req. The **dataset IS the goldmine** — that's the
point of the demo.

**Q: Why FastAPI + not Flask?**
Async, automatic OpenAPI docs at `/docs`, pydantic validation, native WebSockets —
modern standard.

**Q: Why NoSQL/normal DB instead?**
Postgres with 22.6 M rows × 25 columns needs careful indexing and doesn't do
columnar scans. Our analytics dashboards are read-heavy —
Parquet+DuckDB is THE modern data-warehouse pattern (same as Snowflake/Redshift).

**Q: How do you know your numbers are right?**
`scripts/check.py` reports data-quality gates: duplicate product_id per
platform-day = 0; brand coverage 93 %; rating coverage 85 %.
