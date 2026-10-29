"""
Central configuration for the MarketLens FastAPI backend.

Paths can be overridden with environment variables so the same code works on a
server with the raw dumps on another volume.
"""
from __future__ import annotations

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent          # backend/
PROJECT_ROOT = BASE_DIR.parent                             # e-com-data/

# Raw dataset locations (read-only).
AMAZON_DATA_DIR = Path(os.getenv("AMAZON_DATA_DIR", PROJECT_ROOT / "amazon-data"))
FLIPKART_DATA_DIR = Path(os.getenv("FLIPKART_DATA_DIR", PROJECT_ROOT / "flipkart-data"))

# Derived Parquet warehouse built by scripts/ingest.py (read + write).
WAREHOUSE_DIR = Path(os.getenv("WAREHOUSE_DIR", BASE_DIR / "warehouse"))

# FastAPI CORS. Comma-separated origins; default allows dev server ports.
CORS_ORIGINS = [
    o.strip()
    for o in os.getenv(
        "CORS_ORIGINS",
        "*,http://localhost:8080,http://localhost:8081,http://localhost:5173,http://localhost:5174,http://localhost:3000,http://127.0.0.1:8080,http://127.0.0.1:8081,http://127.0.0.1:5173",
    ).split(",")
    if o.strip()
]

# Memory budget for DuckDB. Queries spill to disk in WAREHOUSE_DIR/tmp when the
# working set exceeds this, which is what makes 100 GB+ queries possible locally.
DUCKDB_MEMORY_LIMIT = os.getenv("DUCKDB_MEMORY_LIMIT", "2GB")

# Hard cap on page sizes for list endpoints.
MAX_PAGE_SIZE = 200

# Scatter-plot / matched-table sampling caps.
SCATTER_SAMPLE_ROWS = int(os.getenv("SCATTER_SAMPLE_ROWS", "3000"))
MATCHED_ROWS_CAP = 500
