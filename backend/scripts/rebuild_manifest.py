"""Rebuild _manifest.parquet from the warehouse directory layout (footer-only scan)."""
from __future__ import annotations

import os
import re
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import WAREHOUSE_DIR
from app.db import get_conn

con = get_conn()
files = sorted(WAREHOUSE_DIR.glob("*/*/*.parquet"))
values = []
for p in files:
    m = re.match(r"^([^/\\]+[/\\])(\d{4}-\d{2}-\d{2})[/\\]", p.relative_to(WAREHOUSE_DIR).as_posix() + ("/" if "\\" not in p.name else ""))
    # simpler: parse parts
    parts = p.relative_to(WAREHOUSE_DIR).parts  # (source, day, file.parquet)
    source, day = parts[0], parts[1]
    rows = con.execute(
        "SELECT num_rows FROM parquet_file_metadata(?) LIMIT 1", [p.as_posix()]
    ).fetchone()[0]
    values.append(f"('{source}', DATE '{day}', '{p.as_posix().replace(chr(39), chr(39)*2)}', {rows})")

tmp = WAREHOUSE_DIR / f"_manifest.{os.getpid()}.parquet.tmp"
val_sql = ", ".join(values)
con.execute(
    f"COPY (SELECT * FROM (VALUES {val_sql}) t(source, snapshot_date, path, rows)) "
    f"TO '{tmp.as_posix()}' (FORMAT PARQUET)"
)
target = WAREHOUSE_DIR / "_manifest.parquet"
if target.exists():
    target.unlink()
tmp.replace(target)
print(f"manifest rebuilt: {len(values)} files, {sum(int(v.split(', ')[-1][:-1]) for v in values)} rows")
