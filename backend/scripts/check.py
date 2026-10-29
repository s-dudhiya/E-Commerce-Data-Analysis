"""Quick warehouse sanity check (dev script)."""
import sys

sys.path.insert(0, ".")
from app.db import get_conn, refresh_products_view

refresh_products_view()
con = get_conn()

print(con.execute("""
    SELECT platform, snapshot_date, count(*) AS rows, count(DISTINCT product_id) AS ids,
           count(DISTINCT product_name) AS names
    FROM products GROUP BY platform, snapshot_date ORDER BY snapshot_date
""").fetchall())

print("null price rows:", con.execute("SELECT count(*) FROM products WHERE price IS NULL").fetchone())
print("brand coverage :", con.execute("SELECT count(*) FROM products WHERE brand IS NOT NULL").fetchone())
print("rating coverage:", con.execute("SELECT count(*) FROM products WHERE rating IS NOT NULL").fetchone())
print("duplicate ids within platform+day:", con.execute("""
    SELECT count(*) FROM (
        SELECT platform, snapshot_date, product_id, count(*) c
        FROM products GROUP BY platform, snapshot_date, product_id HAVING c > 1
    )
""").fetchone())
