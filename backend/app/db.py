"""
DuckDB connection management + the `products` view over the Parquet warehouse.

Why DuckDB: the raw dumps are ~22.6M rows / ~200 GB uncompressed CSV. DuckDB
queries zstd Parquet with predicate + partition pushdown and spills to disk,
so every API endpoint stays interactive (~50–300 ms) without a database server.
"""
from __future__ import annotations

import tempfile
import threading
from pathlib import Path

import duckdb

from .config import DUCKDB_MEMORY_LIMIT, WAREHOUSE_DIR

# Normalized warehouse schema. Each Parquet part-file written by ingest.py
# contains exactly these columns, so views and fallback schemas stay in sync.
WAREHOUSE_COLUMNS: list[tuple[str, str]] = [
    ("product_id", "VARCHAR"),
    ("catalog_id", "VARCHAR"),
    ("platform", "VARCHAR"),        # 'amazon' | 'flipkart'
    ("snapshot_date", "DATE"),      # day of the scrape (folder yyyy-mm-dd)
    ("scraped_at", "TIMESTAMP"),
    ("product_name", "VARCHAR"),
    ("image_url", "VARCHAR"),
    ("l1", "VARCHAR"),              # category hierarchy from the dumps
    ("l2", "VARCHAR"),
    ("l3", "VARCHAR"),
    ("l4", "VARCHAR"),
    ("l5", "VARCHAR"),
    ("brand", "VARCHAR"),
    ("price", "DOUBLE"),
    ("mrp", "DOUBLE"),
    ("discount_pct", "INTEGER"),
    ("rating", "DOUBLE"),
    ("rating_count", "BIGINT"),
    ("sold_out", "BOOLEAN"),
    ("product_url", "VARCHAR"),
    ("arrival_date", "DATE"),
    ("shipping_charges", "DOUBLE"),
]

_lock = threading.RLock()
_base_conn: duckdb.DuckDBPyConnection | None = None
_local = threading.local()
_view_file_count: int = -1


def _get_base_conn() -> duckdb.DuckDBPyConnection:
    """Base connection that owns the database instance and the view catalog."""
    global _base_conn
    if _base_conn is None:
        with _lock:
            if _base_conn is None:
                con = duckdb.connect(":memory:")
                con.execute(f"SET memory_limit='{DUCKDB_MEMORY_LIMIT}'")
                tmp = Path(tempfile.gettempdir()) / "marketlens-duckdb-tmp"
                tmp.mkdir(parents=True, exist_ok=True)
                con.execute(f"SET temp_directory='{tmp.as_posix()}'")
                _base_conn = con
    return _base_conn


def get_conn() -> duckdb.DuckDBPyConnection:
    """Thread-local cursor on the shared in-memory database.

    FastAPI runs sync endpoints in a threadpool. A single shared connection
    is NOT safe: a concurrent request's execute() replaces the connection's
    pending result set, so fetchall() in one thread can return another
    request's rows. Cursors share the database instance (schema, views,
    settings) but keep result sets isolated per connection.
    """
    con: duckdb.DuckDBPyConnection | None = getattr(_local, "con", None)
    if con is None:
        con = _get_base_conn().cursor()
        con.execute(f"SET memory_limit='{DUCKDB_MEMORY_LIMIT}'")
        _local.con = con
    return con


def warehouse_parquet_files() -> list[Path]:
    return sorted(WAREHOUSE_DIR.glob("*/*/*.parquet"))


def _empty_select() -> str:
    """Typed 0-row SELECT so the products view exists before any ingestion."""
    return "SELECT\n" + ",\n".join(
        f"  CAST(NULL AS {t}) AS {n}" for n, t in WAREHOUSE_COLUMNS
    ) + "\nWHERE 1 = 0"


def _warehouse_select(glob: str) -> str:
    order = ", ".join(n for n, _ in WAREHOUSE_COLUMNS)
    return (
        f"SELECT {order}\n"
        f"FROM read_parquet('{glob}', union_by_name = true)"
    )


def refresh_products_view() -> int:
    """(Re)create the products view over all Parquet part files.
    Returns the number of part files backing it. Called at startup and
    re-issued transparently when the file set changes."""
    global _view_file_count
    with _lock:
        con = _get_base_conn()
        parts = warehouse_parquet_files()
        if len(parts) != _view_file_count or _view_file_count < 0:
            if parts:
                glob = (WAREHOUSE_DIR / "*" / "*" / "*.parquet").as_posix()
                select = _warehouse_select(glob.replace("'", "''"))
            else:
                select = _empty_select()
            con.execute(f"CREATE OR REPLACE VIEW products AS {select}")
            _view_file_count = len(parts)
    return _view_file_count


def view_is_current() -> bool:
    """Cheap staleness check so long-running servers pick up new ingested
    files without a restart."""
    return len(warehouse_parquet_files()) == _view_file_count


def ensure_view() -> None:
    if not view_is_current():
        refresh_products_view()
