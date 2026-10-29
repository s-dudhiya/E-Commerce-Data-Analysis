"""Find parquet files that are missing/zero-byte/truncated."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.config import WAREHOUSE_DIR
from app.db import get_conn

con = get_conn()
bad = []
files = sorted(WAREHOUSE_DIR.glob("*/*/*.parquet"))
for p in files:
    if p.name.startswith("_manifest") or p.stat().st_size < 1024:
        bad.append((p, "tiny/zero"))
        continue
    try:
        n = con.execute("SELECT num_rows FROM parquet_file_metadata(?)", [p.as_posix()]).fetchone()
        if n is None or n[0] < 10:
            bad.append((p, f"rows={n}"))
    except Exception as e:
        bad.append((p, str(e).split("\n")[0][:80]))

print(f"scan: {len(files)} files, {len(bad)} bad")
for p, why in bad:
    print("BAD:", p.relative_to(WAREHOUSE_DIR), "|", why)
