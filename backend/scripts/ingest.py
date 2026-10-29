"""
CLI for building the Parquet warehouse from the raw dumps.

Examples (run from the backend folder):

    # Everything, both platforms (long first run; incremental afterwards)
    python scripts/ingest.py

    # One platform, a date range
    python scripts/ingest.py --source amazon --start 2026-06-06 --end 2026-06-30

    # Smoke test: ingest only 3 files
    python scripts/ingest.py --max-files 3
"""
from __future__ import annotations

import argparse
import sys
import time
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import WAREHOUSE_DIR
from app.db import refresh_products_view
from app.ingest import run_ingest


def main() -> None:
    ap = argparse.ArgumentParser(description="Build the MarketLens Parquet warehouse")
    ap.add_argument("--source", choices=["all", "amazon", "flipkart"], default="all")
    ap.add_argument("--start", type=date.fromisoformat, default=None, help="YYYY-MM-DD inclusive")
    ap.add_argument("--end", type=date.fromisoformat, default=None, help="YYYY-MM-DD inclusive")
    ap.add_argument("--max-files", type=int, default=0, help="Smoke test: stop after N new files")
    args = ap.parse_args()

    sources = ("amazon", "flipkart") if args.source == "all" else (args.source,)
    print(f"Warehouse: {WAREHOUSE_DIR}")

    t0 = time.time()
    summaries = run_ingest(sources, args.start, args.end, args.max_files)
    refresh_products_view()

    for s in summaries:
        print(
            f"[{s.source}] scanned={s.files_scanned} ingested={s.files_ingested} "
            f"skipped(existing)={s.skipped} rows={s.rows_ingested} in {s.seconds:.1f}s"
        )
    print(f"Done in {time.time() - t0:.1f}s")


if __name__ == "__main__":
    main()
