from __future__ import annotations

import asyncio
import contextlib
import logging
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from starlette.responses import Response

from app.config import settings
from app.database import SessionLocal, engine
from app.routers import admin_catalog, admin_posts, admin_projects, auth, public
from app.services.posts import publish_scheduled_posts
from ryoko_common.errors import install_error_handlers
from ryoko_common.logging import RequestContextMiddleware, configure_logging
from ryoko_common.ratelimit import LimitRule, RateLimitMiddleware

logger = logging.getLogger("ryoko.content")
STARTED_AT = time.time()
ADVISORY_LOCK_KEY = 727001


async def _scheduler_loop() -> None:
    while True:
        try:
            async with SessionLocal() as session:
                locked = await session.scalar(
                    text("SELECT pg_try_advisory_lock(:key)"), {"key": ADVISORY_LOCK_KEY}
                )
                if locked:
                    try:
                        published = await publish_scheduled_posts(session)
                        if published:
                            logger.info("scheduled_posts_published", extra={"count": published})
                    finally:
                        await session.execute(
                            text("SELECT pg_advisory_unlock(:key)"), {"key": ADVISORY_LOCK_KEY}
                        )
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # pragma: no cover - depends on runtime state
            logger.warning("scheduler_iteration_failed", extra={"error": str(exc)})
        await asyncio.sleep(60)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    if settings.media_storage == "local":
        Path(settings.media_dir).mkdir(parents=True, exist_ok=True)  # noqa: ASYNC240
    task: asyncio.Task[None] | None = None
    if settings.enable_scheduler:
        task = asyncio.create_task(_scheduler_loop())
    try:
        yield
    finally:
        if task is not None:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task
        await engine.dispose()


configure_logging(settings.log_level)

app = FastAPI(
    title="Ryoko Content API",
    version="0.1.0",
    description="Admin CRUD and read-only build endpoints for the Ryoko website.",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url=None,
)

app.add_middleware(
    RateLimitMiddleware,
    redis_url=settings.redis_url,
    rules=[
        LimitRule(name="auth", path_prefix="/v1/auth/token", limit=10, window_seconds=60),
        LimitRule(
            name="media-upload",
            path_prefix="/v1/admin/media",
            limit=30,
            window_seconds=60,
            methods=frozenset({"POST"}),
        ),
        LimitRule(name="admin", path_prefix="/v1/admin", limit=600, window_seconds=60),
        LimitRule(name="public", path_prefix="/v1/public", limit=120, window_seconds=60),
    ],
    error_base_url=settings.error_base_url,
)
app.add_middleware(RequestContextMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_origin_regex=r"https://ryoko-[a-z0-9-]+\.vercel\.app",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID", "If-None-Match"],
    expose_headers=[
        "X-Request-ID",
        "X-RateLimit-Limit",
        "X-RateLimit-Remaining",
        "X-RateLimit-Reset",
    ],
    max_age=600,
)

install_error_handlers(app, error_base_url=settings.error_base_url)


@app.middleware("http")
async def public_cache_headers(request: Request, call_next: Any) -> Response:
    response: Response = await call_next(request)
    if request.url.path.startswith("/v1/public") and response.status_code < 400:
        response.headers["Cache-Control"] = "private, max-age=60, stale-while-revalidate=300"
        response.headers["Vary"] = "Authorization"
    return response


@app.get("/health", tags=["ops"])
async def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "service": "content-api",
        "version": "0.1.0",
        "uptime_seconds": int(time.time() - STARTED_AT),
    }


@app.get("/ready", tags=["ops"])
async def ready() -> dict[str, Any]:
    async with SessionLocal() as session:
        await session.execute(text("SELECT 1"))
    return {"status": "ready", "service": "content-api", "checks": {"database": "ok"}}


app.include_router(auth.router)
app.include_router(public.health_router)
app.include_router(public.router)
app.include_router(admin_posts.router)
app.include_router(admin_projects.router)
app.include_router(admin_catalog.router)

if settings.media_storage == "local":
    from fastapi.staticfiles import StaticFiles

    Path(settings.media_dir).mkdir(parents=True, exist_ok=True)
    app.mount(
        "/media",
        StaticFiles(directory=str(settings.media_dir)),
        name="media",
    )
