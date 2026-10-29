"""
Ingestion pipeline: raw daily CSV.gz dumps -> normalized zstd Parquet warehouse.

Pipeline per shard file:
  1. Skip if already ingested (parquet output exists AND is newer than source).
  2. COPY (SELECT ...normalized... FROM read_csv(<gz>, all_varchar=true)) TO
     warehouse/<source>/<yyyy-mm-dd>/<shard>.parquet (zstd).
  3. Track files/rows in a tiny manifest Parquet (atomic rewrite).

Safe to re-run: incremental, atomic-ish, and it never blocks the API because
both live purely on Parquet files (no lock-prone DuckDB database file).
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Iterable, Iterator

from .config import AMAZON_DATA_DIR, FLIPKART_DATA_DIR, WAREHOUSE_DIR
from .db import WAREHOUSE_COLUMNS, get_conn

MANIFEST_PATH = WAREHOUSE_DIR / "_manifest.parquet"

SOURCES: dict[str, Path] = {
    "amazon": AMAZON_DATA_DIR,
    "flipkart": FLIPKART_DATA_DIR,
}

# Normalized projection over one raw shard. Documents the exact extraction
# rules in SQL so the transforms are auditable from the code alone.
_INGEST_SELECT = """
SELECT
    product_id,
    catalog_id,
    lower(source)                                    AS platform,
    CAST('{snapshot_date}' AS DATE)                  AS snapshot_date,
    try_cast(scraped_date AS TIMESTAMP)              AS scraped_at,
    product_name,
    nullif(image_url, 'N/A')                         AS image_url,
    CASE WHEN json_valid(category_hierarchy) THEN json_extract_string(category_hierarchy, '$.l1') END AS l1,
    CASE WHEN json_valid(category_hierarchy) THEN json_extract_string(category_hierarchy, '$.l2') END AS l2,
    CASE WHEN json_valid(category_hierarchy) THEN json_extract_string(category_hierarchy, '$.l3') END AS l3,
    CASE WHEN json_valid(category_hierarchy) THEN json_extract_string(category_hierarchy, '$.l4') END AS l4,
    CASE WHEN json_valid(category_hierarchy) THEN json_extract_string(category_hierarchy, '$.l5') END AS l5,
    CASE WHEN json_valid(others)            THEN nullif(json_extract_string(others, '$.brand'), '')  END AS brand,
    try_cast(nullif(product_price, 'N/A')            AS DOUBLE)  AS price,
    try_cast(nullif(mrp, 'N/A')                      AS DOUBLE)  AS mrp,
    try_cast(nullif(discount, 'N/A')                 AS INTEGER) AS discount_pct,
    try_cast(nullif(avg_rating, 'N/A')               AS DOUBLE)  AS rating,
    try_cast(replace(number_of_ratings, ',', '')     AS BIGINT)  AS rating_count,
    lower(is_sold_out) = 'true'                      AS sold_out,
    nullif(product_url, 'N/A')                       AS product_url,
    try_cast(nullif(arrival_date, 'N/A')             AS DATE)    AS arrival_date,
    try_cast(nullif(shipping_charges, 'N/A')         AS DOUBLE)  AS shipping_charges
FROM read_csv('{src}', delim=';', header=true, all_varchar=true, ignore_errors=true)
"""


@dataclass
class IngestSummary:
    source: str
    files_scanned: int
    files_ingested: int
    rows_ingested: int
    skipped: int
    seconds: float

    def as_dict(self) -> dict:
        return self.__dict__.copy()


def discover_files(source: str, start: date | None = None, end: date | None = None) -> Iterator[tuple[Path, date]]:
    """Yield (csv.gz path, snapshot_date) for every shard in the raw dumps."""
    base = SOURCES[source]
    if not base.exists():
        return
    for folder in sorted(p for p in base.iterdir() if p.is_dir()):
        try:
            day = datetime.strptime(folder.name, "%Y%m%d").date()
        except ValueError:
            continue
        if start and day < start:
            continue
        if end and day > end:
            continue
        for shard in sorted(folder.glob("*.csv.gz")):
            yield shard, day


def _parquet_target(source: str, snapshot_date: date, shard: Path) -> Path:
    return WAREHOUSE_DIR / source / snapshot_date.isoformat() / f"{shard.stem}.parquet"


def _exists_fresh(target: Path, shard: Path) -> bool:
    """Already ingested AND the raw file has not changed since."""
    return target.exists() and target.stat().st_mtime >= shard.stat().st_mtime


def _ingest_one(con, shard: Path, source: str, snapshot_date: date) -> int:
    target = _parquet_target(source, snapshot_date, shard)
    target.parent.mkdir(parents=True, exist_ok=True)
    sql = _INGEST_SELECT.format(
        snapshot_date=snapshot_date.isoformat(),
        src=shard.as_posix().replace("'", "''"),
    )
    out = target.as_posix().replace("'", "''")
    con.execute(f"COPY ({sql}) TO '{out}' (FORMAT PARQUET, COMPRESSION ZSTD)")
    rows = con.execute(f"SELECT count(*) FROM read_parquet('{out}')").fetchone()
    return int(rows[0]) if rows else 0


def load_manifest() -> list[dict]:
    if not MANIFEST_PATH.exists():
        return []
    con = get_conn()
    rows = con.execute(
        "SELECT source, snapshot_date, path, rows FROM read_parquet(?) ORDER BY source, snapshot_date, path",
        [MANIFEST_PATH.as_posix()],
    ).fetchall()
    return [
        {"source": r[0], "snapshot_date": r[1].isoformat(), "path": r[2], "rows": r[3]}
        for r in rows
    ]


def _append_manifest(entries: Iterable[tuple[str, date, Path, int]]) -> None:
    entries = list(entries)
    if not entries:
        return
    con = get_conn()
    # Unique per-process temp name so parallel ingest workers never collide.
    tmp = MANIFEST_PATH.with_name(f"_manifest.{os.getpid()}.parquet.tmp")
    values_sql = ", ".join(
        f"('{src}', DATE '{day.isoformat()}', '{path.as_posix().replace(chr(39), chr(39) * 2)}', {rows})"
        for src, day, path, rows in entries
    )
    # First write ever: no previous manifest to merge with.
    if not MANIFEST_PATH.exists():
        con.execute(f"""
            COPY (
                SELECT * FROM (VALUES {values_sql}) t(source, snapshot_date, path, rows)
            ) TO '{tmp.as_posix()}' (FORMAT PARQUET)
        """)
    else:
        con.execute(f"""
            COPY (
                SELECT * FROM (VALUES {values_sql}) t(source, snapshot_date, path, rows)
                UNION ALL
                SELECT m.source, m.snapshot_date, m.path, m.rows
                FROM read_parquet('{MANIFEST_PATH.as_posix()}') m
                WHERE m.path NOT IN (SELECT path FROM (VALUES {values_sql}) t(source, snapshot_date, path, rows))
            ) TO '{tmp.as_posix()}' (FORMAT PARQUET)
        """)
    tmp.replace(MANIFEST_PATH)


def run_ingest(
    sources: Iterable[str] = ("amazon", "flipkart"),
    start: date | None = None,
    end: date | None = None,
    max_files: int = 0,
) -> list[IngestSummary]:
    """
    Ingest raw shards into the warehouse.

    max_files: for smoke tests — stop after N new files in total (0 = all).
    """
    con = get_conn()
    WAREHOUSE_DIR.mkdir(parents=True, exist_ok=True)
    summaries: list[IngestSummary] = []

    manifest_rows: list[tuple[str, date, Path, int]] = []
    completed = 0

    for source in sources:
        s_started = datetime.now()
        scanned = ingested = skipped = rows_added = 0
        for shard, day in discover_files(source, start, end):
            scanned += 1
            target = _parquet_target(source, day, shard)
            if _exists_fresh(target, shard):
                skipped += 1
                continue
            rows = _ingest_one(con, shard, source, day)
            manifest_rows.append((source, day, target, rows))
            rows_added += rows
            ingested += 1
            completed += 1
            if max_files and completed >= max_files:
                _append_manifest(manifest_rows)
                summaries.append(IngestSummary(source, scanned, ingested, rows_added, skipped,
                                               (datetime.now() - s_started).total_seconds()))
                return summaries
        _append_manifest(manifest_rows)
        manifest_rows.clear()
        summaries.append(IngestSummary(source, scanned, ingested, rows_added, skipped,
                                       (datetime.now() - s_started).total_seconds()))

    return summaries
