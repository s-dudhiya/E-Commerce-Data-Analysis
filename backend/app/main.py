"""
MarketLens FastAPI application.

Run (from the backend folder):
    uvicorn app.main:app --reload --port 8000

Interactive docs:
    http://localhost:8000/docs
"""
from __future__ import annotations

import contextlib
import sys
from collections.abc import AsyncIterator

# Make `app.*` imports work when launched as `python -m app.main` too.
if __package__ in (None, ""):  # pragma: no cover
    sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent.parent))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse

from .config import CORS_ORIGINS, WAREHOUSE_DIR
from .db import refresh_products_view
from .routers import router

try:
    from fastapi.responses import ORJSONResponse as _DefaultResponse
except ImportError:  # orjson missing -> fall back to stdlib JSON
    _DefaultResponse = JSONResponse  # type: ignore[assignment]

_DESCRIPTION = """
Analytical API over the Amazon + Flipkart product-daily dumps (2026-06-06 …).

* Raw `.csv.gz` dumps are converted **once** into a zstd **Parquet** warehouse
  (incremental and re-runnable — see `POST /api/ingest`).
* Queries run on **DuckDB** against that warehouse: snapshot views by default
  (latest scrape day per platform), range queries for trends.
"""

_CORS_FALLBACK = True


@contextlib.asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # Ensure warehouse dir + products view exist before first request.
    WAREHOUSE_DIR.mkdir(parents=True, exist_ok=True)
    refresh_products_view()
    yield


app = FastAPI(
    title="MarketLens API",
    version="1.0.0",
    description=_DESCRIPTION,
    default_response_class=_DefaultResponse,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_origin_regex=".*" if _CORS_FALLBACK else None,
    allow_credentials=False,  # wildcard origins require non-credential mode
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.get("/", include_in_schema=False)
def root() -> dict:
    return {"service": "MarketLens API", "docs": "/docs", "warehouse": str(WAREHOUSE_DIR)}


@app.get("/health", include_in_schema=False)
def health() -> dict:
    return {"status": "ok"}


@app.get("/v1/models", include_in_schema=False)
def v1_models() -> dict:
    # Some local tooling probes this OpenAI-style path; keep the log clean.
    return {"object": "list", "data": []}


def main() -> None:  # `python -m app.main`
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=int(sys.argv[1]) if len(sys.argv) > 1 else 8000)


if __name__ == "__main__":
    main()
