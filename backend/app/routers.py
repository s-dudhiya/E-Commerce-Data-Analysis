"""
HTTP API surface. One router, thin — all real logic lives in services.py.
"""
from __future__ import annotations

import tempfile
from datetime import date
from pathlib import Path

import duckdb
import orjson
from duckdb import DuckDBPyConnection
from fastapi import APIRouter, BackgroundTasks, HTTPException, Query
from fastapi.responses import FileResponse

from . import services
from .config import MAX_PAGE_SIZE, WAREHOUSE_DIR
from .db import ensure_view, refresh_products_view
from .ingest import load_manifest, run_ingest

router = APIRouter(prefix="/api", tags=["marketlens"])


def _filters(**kwargs):
    """build_common_filters that turns bad date inputs into a 422."""
    raw_dates = {
        k: kwargs.pop(k)
        for k in ("snapshot_date", "start_date", "end_date")
        if kwargs.get(k)
    }
    try:
        return services.build_common_filters(**kwargs, **raw_dates)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=f"Invalid date: {e}") from e


# ---------------------------------------------------------------- metadata
@router.get("/meta")
def api_meta() -> dict:
    ensure_view()
    return {"warehouse": str(WAREHOUSE_DIR), **services.meta()}


@router.get("/facets")
def api_facets() -> dict:
    return services.facets()


@router.get("/sample")
def api_sample(
    size: int = Query(12000, ge=500, le=50000, description="Rows sampled from the latest snapshot"),
    platform: str = "all",
) -> dict:
    f = _filters(platform=platform)
    return services.sample_listings(f, size)


@router.get("/categories/tree")
def api_category_tree(l1: str | None = None) -> list[dict]:
    return services.category_tree(l1)


@router.get("/search")
def api_search(
    q: str = Query(..., min_length=1, description="Free-text product search"),
    limit: int = Query(10, ge=1, le=50),
) -> list[dict]:
    return services.search_suggestions(q, limit)


# ---------------------------------------------------------------- pages
@router.get("/products")
def api_products(
    platform: str = "all",
    snapshot_date: str | None = None,
    q: str | None = None,
    l1: str | None = None, l2: str | None = None, l3: str | None = None,
    l4: str | None = None, l5: str | None = None,
    brand: str | None = None,
    min_price: float | None = None, max_price: float | None = None,
    min_discount: int | None = None,
    min_rating: float | None = None, max_rating: float | None = None,
    stock: str | None = Query(None, pattern="^(in|out)$"),
    sort: str = Query("price", pattern="^(price|mrp|discount_pct|rating|rating_count|product_name|scraped_at|snapshot_date)$"),
    order: str = Query("asc", pattern="^(asc|desc)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=MAX_PAGE_SIZE),
) -> dict:
    f = _filters(platform=platform, snapshot_date=snapshot_date, q=q, l1=l1, l2=l2, l3=l3,
                 l4=l4, l5=l5, brand=brand, min_price=min_price, max_price=max_price,
                 min_discount=min_discount, min_rating=min_rating, max_rating=max_rating, stock=stock)
    return services.products_list(f, sort, order, page, page_size)


@router.get("/overview")
def api_overview(
    platform: str = "all",
    snapshot_date: str | None = None,
    q: str | None = None,
    l1: str | None = None, brand: str | None = None,
    min_price: float | None = None, max_price: float | None = None,
    min_discount: int | None = None, min_rating: float | None = None,
    stock: str | None = Query(None, pattern="^(in|out)$"),
) -> dict:
    f = _filters(platform=platform, snapshot_date=snapshot_date, q=q, l1=l1, brand=brand,
                 min_price=min_price, max_price=max_price, min_discount=min_discount,
                 min_rating=min_rating, stock=stock)
    return services.overview(f)


@router.get("/price-analysis")
def api_price_analysis(
    platform: str = "all",
    snapshot_date: str | None = None,
    q: str | None = None,
    l1: str | None = None, brand: str | None = None,
    stock: str | None = Query(None, pattern="^(in|out)$"),
    bins: int = Query(12, ge=4, le=30),
) -> dict:
    f = _filters(platform=platform, snapshot_date=snapshot_date, q=q, l1=l1, brand=brand, stock=stock)
    return services.price_analysis(f, bins)


@router.get("/ratings-reviews")
def api_ratings_reviews(
    platform: str = "all",
    snapshot_date: str | None = None,
    q: str | None = None,
    l1: str | None = None, brand: str | None = None,
    stock: str | None = Query(None, pattern="^(in|out)$"),
    min_review_threshold: int = Query(100, ge=0),
) -> dict:
    f = _filters(platform=platform, snapshot_date=snapshot_date, q=q, l1=l1, brand=brand, stock=stock)
    return services.ratings_reviews(f, min_review_threshold)


@router.get("/stock-analysis")
def api_stock_analysis(
    platform: str = "all",
    snapshot_date: str | None = None,
    q: str | None = None,
    l1: str | None = None, brand: str | None = None,
) -> dict:
    f = _filters(platform=platform, snapshot_date=snapshot_date, q=q, l1=l1, brand=brand)
    return services.stock_analysis(f)


@router.get("/platform-comparison")
def api_platform_comparison(
    platform: str = "amazon",
    snapshot_date: str | None = None,
    change_type: str = "all",
    q: str | None = None,
    l1: str | None = None,
    brand: str | None = None,
    sort: str = "delta_abs",
    order: str = "desc",
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
) -> dict:
    return services.product_dynamics(
        platform=platform,
        snapshot_date=snapshot_date,
        change_type=change_type,
        q=q,
        l1=l1,
        brand=brand,
        sort=sort,
        order=order,
        page=page,
        page_size=page_size,
    )


@router.get("/product-dynamics")
def api_product_dynamics(
    platform: str = "amazon",
    snapshot_date: str | None = None,
    compare_date: str | None = None,
    change_type: str = "all",
    q: str | None = None,
    l1: str | None = None,
    brand: str | None = None,
    sort: str = "delta_abs",
    order: str = "desc",
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
) -> dict:
    return services.product_dynamics(
        platform=platform,
        snapshot_date=snapshot_date,
        compare_date=compare_date,
        change_type=change_type,
        q=q,
        l1=l1,
        brand=brand,
        sort=sort,
        order=order,
        page=page,
        page_size=page_size,
    )


@router.get("/product-history")
def api_product_history(
    platform: str = "amazon",
    product_id: str = Query(..., description="Product ID/ASIN"),
) -> dict:
    return services.product_history(platform=platform, product_id=product_id)


@router.get("/trends")
def api_trends(
    platform: str = "all",
    start_date: str | None = Query(None, description="YYYY-MM-DD inclusive"),
    end_date: str | None = Query(None, description="YYYY-MM-DD inclusive"),
    q: str | None = None,
    l1: str | None = None, brand: str | None = None,
) -> dict:
    effective_start = start_date or "2026-01-01"
    f = _filters(platform="all", q=q, l1=l1, brand=brand,
                 start_date=effective_start, end_date=end_date)
    return services.trends(platform, services.parse_date(effective_start), services.parse_date(end_date), f)


# ---------------------------------------------------------------- export
EXPORT_COLS = (
    ("product_id", "product_id"), ("platform", "platform"), ("snapshot_date", "snapshot_date"),
    ("product_name", "product_name"), ("brand", "brand"), ("l1", "category_l1"),
    ("l2", "category_l2"), ("l3", "category_l3"), ("price", "price"), ("mrp", "mrp"),
    ("discount_pct", "discount_pct"), ("rating", "rating"), ("rating_count", "review_count"),
    ("sold_out", "is_sold_out"), ("product_url", "product_url"),
)


def _cleanup(path: Path | None) -> None:
    if path is None:
        return
    try:
        path.unlink()
    except OSError:
        pass


def _export_target(fmt: str) -> Path:
    """Unique temp path. Deliberately NOT pre-created: DuckDB's COPY refuses
    to overwrite existing files and its internal tmp-file move fails on them."""
    import uuid

    out = Path(tempfile.gettempdir()) / f"marketlens-export-{uuid.uuid4().hex}.{fmt}"
    _cleanup(out)
    out.parent.mkdir(parents=True, exist_ok=True)
    return out


@router.get("/products/export")
def api_products_export(
    background_tasks: BackgroundTasks,
    fmt: str = Query("csv", pattern="^(csv|json)$"),
    platform: str = "all",
    snapshot_date: str | None = None,
    q: str | None = None,
    l1: str | None = None, brand: str | None = None,
    min_price: float | None = None, max_price: float | None = None,
    min_discount: int | None = None, min_rating: float | None = None,
    stock: str | None = Query(None, pattern="^(in|out)$"),
) -> FileResponse:
    f = _filters(platform=platform, snapshot_date=snapshot_date, q=q, l1=l1, brand=brand,
                 min_price=min_price, max_price=max_price, min_discount=min_discount,
                 min_rating=min_rating, stock=stock)
    ensure_view()
    con: DuckDBPyConnection = services.get_conn()
    cols = ", ".join(f'"{a}" AS "{b}"' for a, b in EXPORT_COLS)
    select_sql = f"SELECT {cols} FROM products WHERE {f.text()}"

    out = _export_target(fmt)
    background_tasks.add_task(_cleanup, out)

    if fmt == "csv":
        quoted = out.as_posix().replace("'", "''")
        con.execute(f"COPY ({select_sql}) TO '{quoted}' (FORMAT CSV, HEADER, DELIMITER ',')")
        return FileResponse(out, media_type="text/csv", filename="marketlens-products.csv")

    rows = services._fetch_all(con, select_sql, f.params)
    out.write_bytes(orjson.dumps(rows, option=orjson.OPT_INDENT_2))
    return FileResponse(out, media_type="application/json", filename="marketlens-products.json")


# ---------------------------------------------------------------- ingestion
@router.get("/ingest/status")
def api_ingest_status() -> dict:
    return {"warehouse_dir": str(WAREHOUSE_DIR), "files": load_manifest()}


@router.post("/ingest")
def api_ingest(
    source: str = Query("all", pattern="^(all|amazon|flipkart)$"),
    start: str | None = None,
    end: str | None = None,
    max_files: int = Query(0, ge=0, description="Stop after N files (0 = everything; long)"),
) -> dict:
    sources = ("amazon", "flipkart") if source == "all" else (source,)
    try:
        start_d = date.fromisoformat(start) if start else None
        end_d = date.fromisoformat(end) if end else None
    except ValueError as e:
        raise HTTPException(422, f"Invalid date: {e}") from e
    summaries = run_ingest(sources, start_d, end_d, max_files)
    refresh_products_view()
    return {"summaries": [s.as_dict() for s in summaries]}
