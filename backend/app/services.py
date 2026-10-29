"""
Analytics / query services — pure SQL builders over the `products` view.

Every list endpoint accepts the same core filter grammar and every page uses
"snapshot mode" by default (each platform at its latest scraped day) so daily
re-scrapes of the same product do not double count.
"""
from __future__ import annotations

import threading
from collections import defaultdict
from datetime import date
from typing import Any

from .config import MATCHED_ROWS_CAP, SCATTER_SAMPLE_ROWS, WAREHOUSE_DIR
from .db import ensure_view, get_conn, warehouse_parquet_files

_PLATFORMS = ("amazon", "flipkart")

_SORTABLE = {
    "price": "price",
    "mrp": "mrp",
    "discount_pct": "discount_pct",
    "rating": "rating",
    "rating_count": "rating_count",
    "product_name": "product_name",
    "scraped_at": "scraped_at",
    "snapshot_date": "snapshot_date",
}

# Normalized cross-platform matching key (used by platform comparison).
# Strips "(...)" variant suffixes and collapses whitespace.
_NAME_NORM = "regexp_replace(regexp_replace(lower(trim(product_name)), '\\s*\\(.*?\\)', '', 'g'), '\\s+', ' ', 'g')"

RATING_BANDS = (
    ("< 3★", 0.0, 3.0),
    ("3–3.5★", 3.0, 3.5),
    ("3.5–4★", 3.5, 4.0),
    ("4–4.5★", 4.0, 4.5),
    ("4.5–5★", 4.5, 5.01),
)


class Where:
    """Tiny accumulator for SQL WHERE clauses + parameter bindings."""

    def __init__(self) -> None:
        self.parts: list[str] = []
        self.params: list[Any] = []

    def add(self, clause: str, *bindings: Any) -> "Where":
        self.parts.append(clause)
        self.params.extend(bindings)
        return self

    def text(self) -> str:
        return "\n  AND ".join(self.parts) if self.parts else "TRUE"


def parse_date(value: str | None) -> date | None:
    if not value or value.lower() in ("latest", "all"):
        return None
    return date.fromisoformat(value)


def build_common_filters(
    *,
    platform: str = "all",
    snapshot_date: str | None = None,
    q: str | None = None,
    l1: str | None = None,
    l2: str | None = None,
    l3: str | None = None,
    l4: str | None = None,
    l5: str | None = None,
    brand: str | None = None,
    min_price: float | None = None,
    max_price: float | None = None,
    min_discount: int | None = None,
    min_rating: float | None = None,
    max_rating: float | None = None,
    stock: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
) -> Where:
    f = Where()

    plat = (platform or "all").lower()
    if plat in _PLATFORMS:
        f.add("platform = ?", plat)

    day = parse_date(snapshot_date)
    start = parse_date(start_date)
    end = parse_date(end_date)
    if day:
        f.add("snapshot_date = CAST(? AS DATE)", day.isoformat())
    elif start or end:
        if start:
            f.add("snapshot_date >= CAST(? AS DATE)", start.isoformat())
        if end:
            f.add("snapshot_date <= CAST(? AS DATE)", end.isoformat())
    else:
        # Snapshot mode (default): latest scraped day per platform — daily
        # re-scrapes of the same product then never double count.
        f.add(
            "(platform, snapshot_date) IN "
            "(SELECT platform, max(snapshot_date) FROM products GROUP BY platform)"
        )

    if q and q.strip():
        like = f"%{q.strip()}%"
        f.add("(product_name ILIKE ? OR brand ILIKE ?)", like, like)
    for col, val in (("l1", l1), ("l2", l2), ("l3", l3), ("l4", l4), ("l5", l5)):
        if val and val.strip():
            f.add(f"{col} ILIKE ?", val.strip())
    if brand:
        brands = [b.strip() for b in brand.split(",") if b.strip()]
        if brands:
            f.add("brand IN (" + ", ".join("?" for _ in brands) + ")", *brands)
    if min_price is not None:
        f.add("price >= ?", min_price)
    if max_price is not None:
        f.add("price <= ?", max_price)
    if min_discount is not None:
        f.add("discount_pct IS NOT NULL AND discount_pct >= ?", min_discount)
    if min_rating is not None:
        f.add("rating IS NOT NULL AND rating >= ?", min_rating)
    if max_rating is not None:
        f.add("rating IS NOT NULL AND rating <= ?", max_rating)
    if stock == "in":
        f.add("sold_out = false")
    elif stock == "out":
        f.add("sold_out = true")

    return f


def _fetch_all(con, sql: str, params: list[Any]) -> list[dict]:
    cur = con.execute(sql, params)
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, r)) for r in cur.fetchall()]


def fetch_scalar(sql: str, params: list[Any]) -> Any:
    con = get_conn()
    row = con.execute(sql, params).fetchone()
    return row[0] if row else None


def fetch_rows(sql: str, params: list[Any]) -> list[dict]:
    return _fetch_all(get_conn(), sql, params)


def latest_dates() -> dict[str, str | None]:
    ensure_view()
    out: dict[str, str | None] = {p: None for p in _PLATFORMS}
    for platform, day in get_conn().execute(
        "SELECT platform, max(snapshot_date) FROM products GROUP BY platform"
    ).fetchall():
        out[platform] = day.isoformat() if day else None
    return out


# ------------------------------------------------------------------ meta
def meta() -> dict:
    ensure_view()
    stats: dict[str, Any] = {
        p: {"first_date": None, "last_date": None, "rows": 0, "days": 0} for p in _PLATFORMS
    }
    rows = get_conn().execute("""
        SELECT platform, min(snapshot_date), max(snapshot_date), count(*),
               count(DISTINCT snapshot_date)
        FROM products GROUP BY platform
    """).fetchall()
    for platform, first, last, n, days in rows:
        stats[platform] = {
            "first_date": first.isoformat() if first else None,
            "last_date": last.isoformat() if last else None,
            "rows": int(n),
            "days": int(days),
        }
    return {"warehouse_stats": stats, "latest_dates": latest_dates()}


# ------------------------------------------------------------------ products
def products_list(f: Where, sort: str, order: str, page: int, page_size: int) -> dict:
    ensure_view()
    con = get_conn()
    key = _SORTABLE.get(sort, "price")
    direction = "DESC" if (order or "").lower() == "desc" else "ASC"
    where = f.text()
    total = int(fetch_scalar(f"SELECT count(*) FROM products WHERE {where}", f.params) or 0)
    offset = max(0, page - 1) * page_size
    items = _fetch_all(
        con,
        f"""
        SELECT product_id, catalog_id, platform, snapshot_date, scraped_at,
               product_name, image_url, l1, l2, l3, l4, l5, brand,
               price, mrp, discount_pct, rating, rating_count,
               sold_out, product_url, arrival_date, shipping_charges
        FROM products
        WHERE {where}
        ORDER BY {key} {direction} NULLS LAST, product_id ASC
        LIMIT {page_size} OFFSET {offset}
        """,
        f.params,
    )
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": (total + page_size - 1) // page_size or 1,
        "items": items,
    }


# ------------------------------------------------------------------ shared helpers
def _rating_bands(f: Where) -> dict[str, int]:
    con = get_conn()
    out: dict[str, int] = {}
    for label, lo, hi in RATING_BANDS:
        out[label] = int(fetch_scalar(
            f"SELECT count(*) FROM products WHERE {f.text()} AND rating >= ? AND rating < ?",
            f.params + [lo, hi],
        ) or 0)
    return out


def _avg_with_guard(expr: str) -> str:
    return f"avg(CASE WHEN {expr} IS NOT NULL THEN {expr} END)"


# ------------------------------------------------------------------ overview
def overview(f: Where) -> dict:
    ensure_view()
    con = get_conn()
    where = f.text()

    kpi = con.execute(f"""
        SELECT count(*),
               avg(price),
               median(price),
               {_avg_with_guard('discount_pct')},
               {_avg_with_guard('rating')},
               count(CASE WHEN rating IS NOT NULL THEN 1 END),
               sum(COALESCE(rating_count, 0)),
               count(CASE WHEN NOT sold_out THEN 1 END),
               count(CASE WHEN sold_out THEN 1 END),
               count(CASE WHEN discount_pct IS NOT NULL THEN 1 END)
        FROM products WHERE {where}
    """, f.params).fetchone()

    by_platform = _fetch_all(con, f"""
        SELECT platform, count(*) AS listings,
               avg(price) AS avg_price, median(price) AS median_price,
               {_avg_with_guard('rating')} AS avg_rating,
               sum(COALESCE(rating_count, 0)) AS total_review_count,
               count(CASE WHEN NOT sold_out THEN 1 END) AS in_stock,
               count(CASE WHEN sold_out THEN 1 END) AS out_of_stock
        FROM products WHERE {where}
        GROUP BY platform ORDER BY platform
    """, f.params)

    top_categories = _fetch_all(con, f"""
        SELECT l1 AS category, count(*) AS listings, avg(price) AS avg_price,
               {_avg_with_guard('rating')} AS avg_rating
        FROM products WHERE {where} AND l1 IS NOT NULL
        GROUP BY l1 ORDER BY listings DESC LIMIT 12
    """, f.params)

    top_brands = _fetch_all(con, f"""
        SELECT brand, count(*) AS listings, avg(price) AS avg_price,
               {_avg_with_guard('rating')} AS avg_rating
        FROM products WHERE {where} AND brand IS NOT NULL
        GROUP BY brand ORDER BY listings DESC LIMIT 10
    """, f.params)

    return {
        "kpis": {
            "total_listings": int(kpi[0] or 0),
            "avg_price": kpi[1],
            "median_price": kpi[2],
            "avg_discount": kpi[3],
            "avg_rating": kpi[4],
            "rated_listings": int(kpi[5] or 0),
            "total_reviews": int(kpi[6] or 0),
            "in_stock": int(kpi[7] or 0),
            "out_of_stock": int(kpi[8] or 0),
            "discounted": int(kpi[9] or 0),
        },
        "spotlights": {"by_platform": by_platform, "top_categories": top_categories, "top_brands": top_brands},
        "rating_bands": _rating_bands(f),
    }


# ------------------------------------------------------------------ price analysis
def price_analysis(f: Where, bins: int = 12) -> dict:
    ensure_view()
    con = get_conn()
    where = f.text()

    bounds = con.execute(f"SELECT min(price), max(price) FROM products WHERE {where}", f.params).fetchone()
    pmin = float(bounds[0]) if bounds and bounds[0] is not None else 0.0
    pmax = float(bounds[1]) if bounds and bounds[1] is not None else 10.0
    width = max(50.0, (pmax - pmin) / max(1, bins))
    n_bins = int(max(1, min(bins, int((pmax - pmin) / width) + 1)))

    buckets = _fetch_all(con, f"""
        SELECT CAST(greatest(0, least({n_bins - 1}, CAST(floor((price - {pmin:.4f}) / {width:.4f}) AS BIGINT))) AS INT) AS b,
               count(*) AS count,
               avg(discount_pct) AS avg_discount,
               {_avg_with_guard('rating')} AS avg_rating
        FROM products WHERE {where} AND price IS NOT NULL
        GROUP BY b ORDER BY b
    """, f.params)

    price_bins = []
    for b in buckets:
        frm = pmin + b["b"] * width
        price_bins.append({
            "label": f"₹{int(frm):,} – ₹{int(frm + width):,}",
            "from": frm,
            "to": frm + width,
            "count": int(b["count"]),
            "avg_discount": b["avg_discount"],
            "avg_rating": b["avg_rating"],
        })

    category_platform_medians = _fetch_all(con, f"""
        SELECT l1 AS category, platform, median(price) AS median_price, count(*) AS listings
        FROM products WHERE {where} AND l1 IS NOT NULL AND price IS NOT NULL
        GROUP BY l1, platform
    """, f.params)

    brand_medians = _fetch_all(con, f"""
        SELECT brand, median(price) AS median_price, count(*) AS listings
        FROM products WHERE {where} AND brand IS NOT NULL AND price IS NOT NULL
        GROUP BY brand ORDER BY median_price DESC LIMIT 10
    """, f.params)

    discounted_where = where + " AND discount_pct IS NOT NULL AND mrp IS NOT NULL"
    original_vs_current = _fetch_all(con, f"""
        SELECT l1 AS category,
               avg(mrp) AS avg_original, avg(price) AS avg_current,
               count(*) AS listings
        FROM products WHERE {discounted_where}
        GROUP BY l1 ORDER BY avg_current DESC NULLS LAST
    """, f.params)

    discount_distribution = []
    for lo, hi, label in ((0, 10, "0–9%"), (10, 20, "10–19%"), (20, 30, "20–29%"),
                          (30, 40, "30–39%"), (40, 50, "40–49%"), (50, 60, "50–59%"), (60, 96, "60%+")):
        row = con.execute(f"""
            SELECT sum(CASE WHEN platform = 'amazon' THEN 1 ELSE 0 END) AS a,
                   sum(CASE WHEN platform = 'flipkart' THEN 1 ELSE 0 END) AS fl
            FROM products WHERE {where} AND discount_pct >= ? AND discount_pct < ?
        """, f.params + [lo, hi]).fetchone()
        discount_distribution.append({
            "label": label, "amazon": int(row[0] or 0), "flipkart": int(row[1] or 0),
        })

    return {
        "price_bins": price_bins,
        "bin_width": width,
        "category_platform_medians": category_platform_medians,
        "brand_medians": brand_medians,
        "original_vs_current": original_vs_current,
        "discount_distribution": discount_distribution,
    }


# ------------------------------------------------------------------ ratings
def ratings_reviews(f: Where, min_review_threshold: int = 100) -> dict:
    ensure_view()
    con = get_conn()
    where = f.text()

    kpi = con.execute(f"""
        SELECT {_avg_with_guard('rating')},
               sum(COALESCE(rating_count, 0)),
               median(COALESCE(rating_count, 0))
        FROM products WHERE {where}
    """, f.params).fetchone()
    highly = int(fetch_scalar(
        f"SELECT count(*) FROM products WHERE {where} AND COALESCE(rating_count, 0) >= 1000", f.params
    ) or 0)

    by_category = _fetch_all(con, f"""
        SELECT l1 AS category,
               {_avg_with_guard('rating')} AS avg_rating,
               avg(COALESCE(rating_count, 0)) AS avg_review_count,
               count(CASE WHEN rating IS NOT NULL THEN 1 END) AS rated
        FROM products WHERE {where} AND l1 IS NOT NULL
        GROUP BY l1 ORDER BY avg_rating DESC NULLS LAST
    """, f.params)

    by_platform = _fetch_all(con, f"""
        SELECT platform,
               {_avg_with_guard('rating')} AS avg_rating,
               sum(COALESCE(rating_count, 0)) AS total_review_count,
               count(CASE WHEN rating IS NOT NULL THEN 1 END) AS rated
        FROM products WHERE {where} GROUP BY platform ORDER BY platform
    """, f.params)

    rated_where = where + " AND rating IS NOT NULL AND rating_count IS NOT NULL"
    scatter = _fetch_all(con, f"""
        SELECT product_id, product_name, platform, brand, price, rating, rating_count
        FROM products WHERE {rated_where}
        ORDER BY random() LIMIT {SCATTER_SAMPLE_ROWS}
    """, f.params)

    top_reviewed = _fetch_all(con, f"""
        SELECT product_id, product_name, platform, brand, price, rating, rating_count
        FROM products WHERE {rated_where}
        ORDER BY rating_count DESC LIMIT 10
    """, f.params)

    top_rated = _fetch_all(con, f"""
        SELECT product_id, product_name, platform, brand, price, rating, rating_count
        FROM products WHERE {rated_where} AND rating_count >= ?
        ORDER BY rating DESC, rating_count DESC LIMIT 10
    """, f.params + [min_review_threshold])

    return {
        "kpis": {
            "avg_rating": kpi[0],
            "total_reviews": int(kpi[1] or 0),
            "median_review_count": kpi[2],
            "highly_reviewed": highly,
        },
        "rating_bands": _rating_bands(f),
        "by_category": by_category,
        "by_platform": by_platform,
        "scatter": scatter,
        "top_reviewed": top_reviewed,
        "top_rated": top_rated,
    }


# ------------------------------------------------------------------ stock
def stock_analysis(f: Where) -> dict:
    ensure_view()
    con = get_conn()
    where = f.text()

    kpi = con.execute(f"""
        SELECT count(CASE WHEN NOT sold_out THEN 1 END),
               count(CASE WHEN sold_out THEN 1 END)
        FROM products WHERE {where}
    """, f.params).fetchone()

    by_platform = _fetch_all(con, f"""
        SELECT platform,
               count(CASE WHEN NOT sold_out THEN 1 END) AS in_stock,
               count(CASE WHEN sold_out THEN 1 END) AS out_of_stock,
               count(*) AS total
        FROM products WHERE {where} GROUP BY platform ORDER BY platform
    """, f.params)

    by_category = _fetch_all(con, f"""
        SELECT l1 AS category,
               count(CASE WHEN NOT sold_out THEN 1 END) AS in_stock,
               count(CASE WHEN sold_out THEN 1 END) AS out_of_stock,
               avg(CASE WHEN NOT sold_out THEN 1.0 ELSE 0 END) * 100 AS in_stock_pct
        FROM products WHERE {where} AND l1 IS NOT NULL
        GROUP BY l1 ORDER BY in_stock DESC
    """, f.params)

    out_items = _fetch_all(con, f"""
        SELECT * FROM (
            SELECT product_id, product_name, platform, brand, l1 AS category, l2, l3,
                   price, rating, rating_count, snapshot_date
            FROM products WHERE {where} AND sold_out
            ORDER BY random() LIMIT 100
        ) ORDER BY rating_count DESC NULLS LAST
    """, f.params)

    return {
        "kpis": {"in_stock": int(kpi[0] or 0), "out_of_stock": int(kpi[1] or 0)},
        "by_platform": by_platform,
        "by_category": by_category,
        "out_of_stock_sample": out_items,
    }


# ------------------------------------------------------------------ platform comparison
def platform_comparison(f: Where) -> dict:
    """
    Cross-marketplace comparison. `f` must NOT carry a platform filter — the
    router strips it so both marketplaces are always included.
    """
    ensure_view()
    con = get_conn()
    where = f.text()

    base = _fetch_all(con, f"""
        SELECT platform,
               count(*) AS listings,
               avg(price) AS avg_price, median(price) AS median_price,
               {_avg_with_guard('discount_pct')} AS avg_discount,
               {_avg_with_guard('rating')} AS avg_rating,
               sum(COALESCE(rating_count, 0)) AS total_review_count,
               avg(CASE WHEN NOT sold_out THEN 1.0 END) * 100 AS in_stock_pct
        FROM products WHERE {where}
        GROUP BY platform
    """, f.params)
    summaries = {r["platform"]: r for r in base}

    matched = _fetch_all(con, f"""
        WITH base AS (
            SELECT platform, brand, {_NAME_NORM} AS name_norm, price, rating, rating_count, product_url
            FROM products WHERE {where} AND price IS NOT NULL
        ),
        matched_keys AS (
            SELECT brand, name_norm
            FROM base
            GROUP BY brand, name_norm
            HAVING count(DISTINCT platform) = 2
        ),
        a AS (SELECT b.brand, b.name_norm, first(b.price) AS amazon_price, first(b.rating) AS amazon_rating,
                     first(b.product_url) AS amazon_url
              FROM base b JOIN matched_keys d ON d.brand = b.brand AND d.name_norm = b.name_norm
              WHERE b.platform = 'amazon' GROUP BY b.brand, b.name_norm),
        fl AS (SELECT b.brand, b.name_norm, first(b.price) AS flipkart_price, first(b.rating) AS flipkart_rating,
                      first(b.product_url) AS flipkart_url
               FROM base b JOIN matched_keys d ON d.brand = b.brand AND d.name_norm = b.name_norm
               WHERE b.platform = 'flipkart' GROUP BY b.brand, b.name_norm)
        SELECT a.brand, a.name_norm, a.amazon_price, a.amazon_rating, a.amazon_url,
               fl.flipkart_price, fl.flipkart_rating, fl.flipkart_url,
               fl.flipkart_price - a.amazon_price AS gap
        FROM a JOIN fl USING (brand, name_norm)
        ORDER BY abs(fl.flipkart_price - a.amazon_price) DESC
        LIMIT {MATCHED_ROWS_CAP}
    """, f.params)

    per_platform_matched = defaultdict(int)
    for r in matched:
        per_platform_matched["amazon"] += 1
        per_platform_matched["flipkart"] += 1
    for platform, row in summaries.items():
        row["matched_listings"] = per_platform_matched.get(platform, 0)
        row["exclusive_listings"] = max(0, int(row.get("listings", 0)) - row["matched_listings"])

    return {"platforms": summaries, "matched_pairs": matched}


# ------------------------------------------------------------------ trends
def trends(platform: str, start: date | None, end: date | None, f: Where) -> dict:
    """Time series across days — the only endpoint dedicated to history mode."""
    ensure_view()
    con = get_conn()
    where = f.text()
    if (platform or "all").lower() in _PLATFORMS:
        where += "\n  AND platform = ?"
        f.params = f.params + [platform.lower()]
    condition = f"""
        snapshot_date >= DATE '{(start or date(2026, 1, 1)).isoformat()}'
        AND snapshot_date <= DATE '{(end or date.today()).isoformat()}'
    """

    rows = _fetch_all(con, f"""
        SELECT platform, snapshot_date,
               count(*) AS listings,
               median(price) AS median_price,
               {_avg_with_guard('discount_pct')} AS avg_discount,
               {_avg_with_guard('rating')} AS avg_rating,
               avg(CASE WHEN NOT sold_out THEN 1.0 END) * 100 AS in_stock_pct
        FROM products
        WHERE {condition}
        {"AND (" + where + ")" if f.parts else ""}
        GROUP BY platform, snapshot_date
        ORDER BY snapshot_date, platform
    """, f.params)

    series: dict[str, list] = defaultdict(list)
    for r in rows:
        series[r["platform"]].append(r)
    return {"series": dict(series), "rows": rows}


# ------------------------------------------------------------------ facets
def facets() -> dict:
    ensure_view()
    con = get_conn()
    l1s = _fetch_all(con, """
        SELECT l1, count(*) AS listings FROM products
        WHERE l1 IS NOT NULL GROUP BY l1 ORDER BY listings DESC
    """, [])
    brands = _fetch_all(con, """
        SELECT brand, count(*) AS listings FROM products
        WHERE brand IS NOT NULL GROUP BY brand ORDER BY listings DESC LIMIT 150
    """, [])
    dates = [r["snapshot_date"].isoformat() for r in _fetch_all(
        con, "SELECT DISTINCT snapshot_date FROM products ORDER BY snapshot_date", []
    )]
    return {"l1": l1s, "brands": brands, "dates": dates}


# ------------------------------------------------------------------ frontend sample
# Dashboard-boot cache: materialize the boot universe (latest snapshot rows per
# platform) into an in-memory table, so boots never re-scan the whole Parquet
# warehouse (1,887 files) — a full scan is ~20 s, and the previous version did
# THREE scans per boot (sample + count(*) + matched count(*)), compounded by
# concurrent retries.
_boot_lock = threading.RLock()
_boot_cache: dict[str, Any] = {"file_count": -1, "latest_dates": None, "total_rows": None}
_UNIVERSE_TABLE = "_boot_universe"


def _refresh_boot_cache() -> None:
    parts = warehouse_parquet_files()
    if _boot_cache["file_count"] == len(parts):
        return
    with _boot_lock:
        if _boot_cache["file_count"] == len(parts):
            return
        ensure_view()
        con = get_conn()
        f = build_common_filters()
        con.execute(
            f"CREATE OR REPLACE TABLE {_UNIVERSE_TABLE} AS "
            f"SELECT * FROM products WHERE {f.text()}",
            f.params,
        )
        latest: dict[str, str | None] = {
            p: None for p in _PLATFORMS
        }
        for platform, day in con.execute(
            f"SELECT platform, max(snapshot_date) FROM {_UNIVERSE_TABLE} GROUP BY platform"
        ).fetchall():
            latest[platform] = day.isoformat() if day else None
        _boot_cache["latest_dates"] = latest
        _boot_cache["total_rows"] = int(fetch_scalar("SELECT count(*) FROM products", []) or 0)
        _boot_cache["file_count"] = len(parts)


def sample_listings(f: Where, size: int) -> dict:
    """Uniform random sample of the current filter universe, for dashboard boot."""
    _refresh_boot_cache()
    where = f.text()
    total_rows: int = _boot_cache["total_rows"]

    if where == build_common_filters().text():
        # Fast path: the default boot universe == the cached table.
        return {
            "items": fetch_rows(
                f"SELECT * FROM {_UNIVERSE_TABLE} ORDER BY random() LIMIT {size}", []
            ),
            "total_rows": total_rows,
            "total_matched": int(
                fetch_scalar(f"SELECT count(*) FROM {_UNIVERSE_TABLE}", []) or 0
            ),
            "latest_dates": dict(_boot_cache["latest_dates"]),
        }

    # Any custom platform filter: materialize that subset on the fly.
    ensure_view()
    items = fetch_rows(
        f"SELECT * FROM products WHERE {where} ORDER BY random() LIMIT {size}", f.params
    )
    total_matched = int(fetch_scalar(f"SELECT count(*) FROM products WHERE {where}", f.params) or 0)
    return {
        "items": items,
        "total_rows": total_rows,
        "total_matched": total_matched,
        "latest_dates": latest_dates(),
    }


def category_tree(l1: str | None = None) -> list[dict]:
    """l1 -> l2 -> l3 subtree for the filter dropdowns (within current warehouse)."""
    ensure_view()
    con = get_conn()
    cond = "l1 IS NOT NULL" if not l1 else "l1 ILIKE ?"
    params = [] if not l1 else [l1]
    rows = _fetch_all(con, f"""
        SELECT l1, l2, l3, count(*) AS listings
        FROM products WHERE {cond} AND l2 IS NOT NULL
        GROUP BY l1, l2, l3 ORDER BY l1, l2, l3
    """, params)
    tree: dict[str, dict] = defaultdict(dict)
    for r in rows:
        tree[r["l1"]].setdefault(r["l2"], {})
        tree[r["l1"]][r["l2"]].setdefault(r["l3"], 0)
        tree[r["l1"]][r["l2"]][r["l3"]] += r["listings"]
    return [
        {"l1": a, "l2": [{"l2": b, "l3": [{"l3": c, "listings": n} for c, n in d.items()]}
                          for b, d in subs.items()]}
        for a, subs in tree.items()
    ]


def search_suggestions(q: str, limit: int = 10) -> list[dict]:
    ensure_view()
    if not q.strip():
        return []
    return _fetch_all(get_conn(), f"""
        SELECT product_id, product_name, brand, platform, price, image_url
        FROM products
        WHERE product_name ILIKE ?
        ORDER BY product_name
        LIMIT {limit}
    """, [f"%{q.strip()}%"])


def export_products(f: Where, fmt: str = "csv") -> Any:
    """Return SELECT string for FileResponse; used by the data-table export."""
    ensure_view()
    cols = ", ".join(n for n, _ in (
        ("product_id", None), ("platform", None), ("snapshot_date", None), ("product_name", None),
        ("brand", None), ("l1", None), ("l2", None), ("l3", None),
        ("price", None), ("mrp", None), ("discount_pct", None), ("rating", None),
        ("rating_count", None), ("sold_out", None), ("product_url", None),
    ))
    return f"SELECT {cols} FROM products WHERE {f.text()}", f.params, fmt


# ------------------------------------------------------------------ product dynamics & history
_DYNAMICS_CACHE: dict[tuple[str, str, str | None], dict] = {}
_AVAILABLE_DATES_CACHE: dict[str, list[str]] = {}


def product_dynamics(
    platform: str = "amazon",
    snapshot_date: str | None = None,
    compare_date: str | None = None,
    change_type: str = "all",
    q: str | None = None,
    l1: str | None = None,
    brand: str | None = None,
    sort: str = "delta_abs",
    order: str = "desc",
    page: int = 1,
    page_size: int = 50,
) -> dict:
    """Internal platform day-to-day product price and stock transitions with in-memory caching."""
    ensure_view()
    con = get_conn()
    plat = (platform or "amazon").lower()
    if plat not in _PLATFORMS:
        plat = "amazon"

    # All snapshot dates available for this platform (cached in memory)
    if plat not in _AVAILABLE_DATES_CACHE:
        date_rows = con.execute(
            "SELECT DISTINCT snapshot_date FROM products WHERE platform = ? ORDER BY snapshot_date DESC",
            [plat]
        ).fetchall()
        _AVAILABLE_DATES_CACHE[plat] = [d[0].isoformat() for d in date_rows if d[0]]

    available_dates = _AVAILABLE_DATES_CACHE[plat]
    if not available_dates:
        return {
            "platform": plat,
            "snapshot_date": None,
            "prev_date": None,
            "available_dates": [],
            "kpis": {
                "price_drops": 0, "price_hikes": 0, "out_of_stock": 0,
                "restocked": 0, "avg_price_drop": 0.0, "avg_price_hike": 0.0,
                "total_changes": 0
            },
            "items": [],
            "total_items": 0,
            "page": page,
            "page_size": page_size,
        }

    # Selected or latest date
    curr_date = snapshot_date if snapshot_date in available_dates else available_dates[0]
    curr_idx = available_dates.index(curr_date)
    default_prev_date = available_dates[curr_idx + 1] if curr_idx + 1 < len(available_dates) else None

    # If compare_date is passed and valid in available_dates (and not curr_date), use it;
    # otherwise default to the preceding snapshot date
    actual_prev_date = (
        compare_date
        if (compare_date and compare_date in available_dates and compare_date != curr_date)
        else default_prev_date
    )

    if not actual_prev_date:
        return {
            "platform": plat,
            "snapshot_date": curr_date,
            "prev_date": None,
            "available_dates": available_dates,
            "kpis": {
                "price_drops": 0, "price_hikes": 0, "out_of_stock": 0,
                "restocked": 0, "avg_price_drop": 0.0, "avg_price_hike": 0.0,
                "total_changes": 0
            },
            "items": [],
            "total_items": 0,
            "page": page,
            "page_size": page_size,
        }

    cache_key = (plat, curr_date, actual_prev_date)
    if cache_key not in _DYNAMICS_CACHE:
        # Compare products directly between curr_date and actual_prev_date
        cte = """
        WITH curr AS (
            SELECT product_id, product_name, platform, brand, l1 AS category,
                   snapshot_date, price, mrp, discount_pct, sold_out, image_url, product_url
            FROM products
            WHERE platform = ? AND snapshot_date = CAST(? AS DATE)
        ),
        prev AS (
            SELECT product_id, snapshot_date AS prev_date, price AS prev_price, sold_out AS prev_sold_out
            FROM products
            WHERE platform = ? AND snapshot_date = CAST(? AS DATE)
        ),
        diffs AS (
            SELECT
                curr.product_id, curr.product_name, curr.platform, curr.brand, curr.category,
                prev.prev_date, curr.snapshot_date, prev.prev_price, curr.price, curr.mrp, curr.discount_pct,
                round(curr.price - prev.prev_price, 2) AS price_delta,
                round((curr.price - prev.prev_price) / NULLIF(prev.prev_price, 0) * 100, 1) AS price_delta_pct,
                prev.prev_sold_out, curr.sold_out,
                CASE
                    WHEN prev.prev_price IS NOT NULL AND curr.price < prev.prev_price THEN 'price_drop'
                    WHEN prev.prev_price IS NOT NULL AND curr.price > prev.prev_price THEN 'price_hike'
                    WHEN prev.prev_sold_out = false AND curr.sold_out = true THEN 'out_of_stock'
                    WHEN prev.prev_sold_out = true AND curr.sold_out = false THEN 'restocked'
                    ELSE 'price_change'
                END AS change_kind,
                curr.image_url, curr.product_url
            FROM curr
            INNER JOIN prev ON curr.product_id = prev.product_id
            WHERE ((prev.prev_price IS NOT NULL AND prev.prev_price != curr.price)
                OR (prev.prev_sold_out IS NOT NULL AND prev.prev_sold_out != curr.sold_out))
        )
        SELECT *
        FROM diffs
        ORDER BY abs(price_delta) DESC NULLS LAST
        """
        all_rows = _fetch_all(con, cte, [plat, curr_date, plat, actual_prev_date])

        all_items = []
        for r in all_rows:
            all_items.append({
                "product_id": r["product_id"],
                "product_name": r["product_name"],
                "platform": r["platform"],
                "brand": r["brand"],
                "category": r["category"],
                "prev_date": r["prev_date"].isoformat() if r["prev_date"] else None,
                "snapshot_date": r["snapshot_date"].isoformat() if r["snapshot_date"] else None,
                "prev_price": float(r["prev_price"]) if r["prev_price"] is not None else None,
                "price": float(r["price"]) if r["price"] is not None else None,
                "mrp": float(r["mrp"]) if r["mrp"] is not None else None,
                "discount_pct": int(r["discount_pct"]) if r["discount_pct"] is not None else None,
                "price_delta": float(r["price_delta"]) if r["price_delta"] is not None else None,
                "price_delta_pct": float(r["price_delta_pct"]) if r["price_delta_pct"] is not None else None,
                "prev_sold_out": bool(r["prev_sold_out"]) if r["prev_sold_out"] is not None else None,
                "sold_out": bool(r["sold_out"]),
                "change_kind": r["change_kind"],
                "image_url": r["image_url"],
                "product_url": r["product_url"],
            })

        # Calculate KPIs once from all items
        price_drops = sum(1 for r in all_items if (r["price_delta"] or 0) < 0)
        price_hikes = sum(1 for r in all_items if (r["price_delta"] or 0) > 0)
        out_of_stock = sum(1 for r in all_items if r["prev_sold_out"] is False and r["sold_out"] is True)
        restocked = sum(1 for r in all_items if r["prev_sold_out"] is True and r["sold_out"] is False)
        drops_list = [-r["price_delta"] for r in all_items if (r["price_delta"] or 0) < 0]
        hikes_list = [r["price_delta"] for r in all_items if (r["price_delta"] or 0) > 0]
        avg_price_drop = round(sum(drops_list) / len(drops_list), 2) if drops_list else 0.0
        avg_price_hike = round(sum(hikes_list) / len(hikes_list), 2) if hikes_list else 0.0

        computed_kpis = {
            "price_drops": price_drops,
            "price_hikes": price_hikes,
            "out_of_stock": out_of_stock,
            "restocked": restocked,
            "avg_price_drop": avg_price_drop,
            "avg_price_hike": avg_price_hike,
            "total_changes": len(all_items),
        }

        _DYNAMICS_CACHE[cache_key] = {
            "kpis": computed_kpis,
            "items": all_items,
            "prev_date": actual_prev_date,
        }

    cached = _DYNAMICS_CACHE[cache_key]
    kpis = cached["kpis"]
    items_pool = cached["items"]

    # In-memory instant filtering (under 1ms)
    filtered = items_pool

    if change_type == "price_drop":
        filtered = [x for x in filtered if (x["price_delta"] or 0) < 0]
    elif change_type == "price_hike":
        filtered = [x for x in filtered if (x["price_delta"] or 0) > 0]
    elif change_type == "out_of_stock":
        filtered = [x for x in filtered if x["prev_sold_out"] is False and x["sold_out"] is True]
    elif change_type == "restocked":
        filtered = [x for x in filtered if x["prev_sold_out"] is True and x["sold_out"] is False]
    elif change_type == "any_stock":
        filtered = [x for x in filtered if x["prev_sold_out"] != x["sold_out"]]

    if q and q.strip():
        term = q.strip().lower()
        filtered = [
            x for x in filtered
            if term in (x["product_name"] or "").lower() or term in (x["brand"] or "").lower()
        ]

    if l1 and l1.strip() and l1.lower() != "all":
        category_term = l1.strip()
        filtered = [x for x in filtered if x["category"] == category_term]

    if brand and brand.strip() and brand.lower() != "all":
        brand_term = brand.strip().lower()
        filtered = [x for x in filtered if (x["brand"] or "").lower() == brand_term]

    # In-memory instant sorting (under 1ms)
    sort_dir = "ASC" if (order or "").lower() == "asc" else "DESC"
    reverse = sort_dir == "DESC"

    if sort == "delta_pct":
        filtered = sorted(filtered, key=lambda x: abs(x["price_delta_pct"] or 0), reverse=reverse)
    elif sort == "price":
        filtered = sorted(filtered, key=lambda x: (x["price"] is not None, x["price"] or 0), reverse=reverse)
    elif sort == "product_name":
        filtered = sorted(filtered, key=lambda x: (x["product_name"] or "").lower(), reverse=reverse)
    else:  # delta_abs
        filtered = sorted(filtered, key=lambda x: abs(x["price_delta"] or 0), reverse=reverse)

    total_items = len(filtered)
    limit = min(max(1, page_size), 200)
    offset = max(0, (page - 1) * limit)
    page_items = filtered[offset : offset + limit]

    return {
        "platform": plat,
        "snapshot_date": curr_date,
        "prev_date": cached["prev_date"],
        "available_dates": available_dates,
        "kpis": kpis,
        "items": page_items,
        "total_items": total_items,
        "page": page,
        "page_size": limit,
    }


_PRODUCT_HISTORY_CACHE: dict[tuple[str, str], dict] = {}


def product_history(platform: str, product_id: str) -> dict:
    """Chronological price and stock timeline for a single product across all snapshot dates."""
    plat = (platform or "amazon").lower()
    if plat not in _PLATFORMS:
        plat = "amazon"

    clean_id = (product_id or "").strip()
    cache_key = (plat, clean_id)
    if cache_key in _PRODUCT_HISTORY_CACHE:
        return _PRODUCT_HISTORY_CACHE[cache_key]

    ensure_view()
    con = get_conn()

    plat_glob = (WAREHOUSE_DIR / plat / "*" / "*.parquet").as_posix().replace("'", "''")
    safe_id = clean_id.replace("'", "''")

    rows = con.execute(f"""
        SELECT snapshot_date, price, mrp, discount_pct, sold_out, rating, rating_count,
               product_name, brand, l1 AS category, image_url, product_url
        FROM read_parquet('{plat_glob}')
        WHERE product_id = '{safe_id}'
        ORDER BY snapshot_date ASC
    """).fetchall()

    if not rows:
        payload = {
            "platform": plat,
            "product_id": clean_id,
            "product_name": None,
            "brand": None,
            "category": None,
            "image_url": None,
            "product_url": None,
            "history": [],
        }
        _PRODUCT_HISTORY_CACHE[cache_key] = payload
        return payload

    meta = rows[-1]
    history = []
    for r in rows:
        history.append({
            "snapshot_date": r[0].isoformat() if r[0] else None,
            "price": float(r[1]) if r[1] is not None else None,
            "mrp": float(r[2]) if r[2] is not None else None,
            "discount_pct": int(r[3]) if r[3] is not None else None,
            "sold_out": bool(r[4]),
            "rating": float(r[5]) if r[5] is not None else None,
            "rating_count": int(r[6]) if r[6] is not None else None,
        })

    payload = {
        "platform": plat,
        "product_id": clean_id,
        "product_name": meta[7],
        "brand": meta[8],
        "category": meta[9],
        "image_url": meta[10],
        "product_url": meta[11],
        "history": history,
    }
    _PRODUCT_HISTORY_CACHE[cache_key] = payload
    return payload


