"""Dataset composition audit: null rates, category depth, brand overlap with
platforms, stock/rating distributions, and image/url availability — to decide
which dashboard analyses are meaningful. Run: python scripts/_audit.py"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import db, services  # noqa: E402

con = db.get_conn()
db.refresh_products_view()

print("=== platform volume & days ===")
for r in con.execute(
    "SELECT platform, count(*) AS rows_, count(distinct snapshot_date) AS days_, "
    "min(snapshot_date) AS first_day, max(snapshot_date) AS last_day FROM products GROUP BY platform"
).fetchall():
    print(" ", r[0], "rows=", r[1], "days=", r[2], "range=", r[3], "->", r[4])

print("=== latest snapshot rows per platform (the boot universe) ===")
for r in con.execute(
    "SELECT platform, count(*) FROM products WHERE (platform, snapshot_date) IN "
    "(SELECT platform, max(snapshot_date) FROM products GROUP BY platform) GROUP BY platform"
).fetchall():
    print(" ", r[0], r[1])

print("=== null rates on latest snapshot (per platform) ===")
cols = ["price", "mrp", "discount_pct", "rating", "rating_count", "sold_out",
        "product_url", "image_url", "arrival_date", "shipping_charges", "l1", "l2", "l3", "brand"]
for plat in ("amazon", "flipkart"):
    for c in cols:
        n, tot = con.execute(
            f"SELECT count({c}), count(*) FROM products WHERE platform = ? AND snapshot_date = "
            "(SELECT max(snapshot_date) FROM products WHERE platform = ?)", [plat, plat],
        ).fetchone()
        pct = 100 * (1 - n / tot) if tot else 0
        flag = "  <-- mostly missing" if pct > 60 else ""
        print(f"  {plat:8s} {c:16s} null {pct:5.1f}%{flag}")
    print()

print("=== top-level categories (l1) on latest snapshot, both platforms ===")
for r in con.execute(
    "SELECT l1, count(*) AS rows_, count(distinct platform) AS plats FROM products WHERE snapshot_date IN "
    "(SELECT max(snapshot_date) FROM products p2 WHERE p2.platform = products.platform) "
    "AND l1 IS NOT NULL GROUP BY l1 ORDER BY rows_ DESC LIMIT 15"
).fetchall():
    print(f"  {str(r[0])[:38]:38s} rows={r[1]:>6d} platforms={r[2]}")

print("=== brands on BOTH platforms (latest snapshots) ===")
n_both = con.execute("""
    SELECT count(*) FROM (
        SELECT brand FROM products WHERE snapshot_date IN
            (SELECT max(snapshot_date) FROM products p2 WHERE p2.platform = products.platform)
            AND brand IS NOT NULL
        GROUP BY brand HAVING count(distinct platform) = 2
    )
""").fetchone()[0]
print("  brands present on both platforms:", n_both)

print("=== top 12 dual-platform brands by (min side volume) ===")
for r in con.execute("""
    SELECT brand, sum(amazon), sum(flipkart) FROM (
        SELECT brand,
               CASE WHEN platform='amazon' THEN 1 ELSE 0 END amazon,
               CASE WHEN platform='flipkart' THEN 1 ELSE 0 END flipkart
        FROM products WHERE snapshot_date IN
            (SELECT max(snapshot_date) FROM products p2 WHERE p2.platform = products.platform)
            AND brand IS NOT NULL
    ) GROUP BY brand
      HAVING sum(amazon) >= 5 AND sum(flipkart) >= 5
    ORDER BY (sum(amazon) + sum(flipkart)) DESC LIMIT 12
""").fetchall():
    print(f"  {r[0][:24]:24s} amazon={r[1]:>5d} flipkart={r[2]:>5d}")

print("=== discount / rating / stock shape (latest snapshot, all) ===")
print(" ", con.execute(
    "SELECT count(*), sum(sold_out::int), sum(CASE WHEN rating IS NULL THEN 1 ELSE 0 END), "
    "round(avg(discount_pct),1) FROM products WHERE snapshot_date IN "
    "(SELECT max(snapshot_date) FROM products p2 WHERE p2.platform = products.platform)"
).fetchone())

print("=== image_url presence (latest snapshot) ===")
for r in con.execute(
    "SELECT platform, count(image_url), count(*) FROM products WHERE snapshot_date IN "
    "(SELECT max(snapshot_date) FROM products p2 WHERE p2.platform = products.platform) "
    "GROUP BY platform"
).fetchall():
    print(f"  {r[0]}: has image {r[1]}/{r[2]}")
