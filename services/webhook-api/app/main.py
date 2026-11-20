from __future__ import annotations

import asyncio
import contextlib
import logging
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.config import settings
from app.database import SessionLocal, engine
from app.delivery import due_events, process_event, reclaim_stuck
from app.routers import admin_router, ingest_router
from ryoko_common.errors import install_error_handlers
from ryoko_common.logging import RequestContextMiddleware, configure_logging
from ryoko_common.ratelimit import LimitRule, RateLimitMiddleware

logger = logging.getLogger("ryoko.webhook")
STARTED_AT = time.time()


async def _worker_loop() -> None:
    while True:
        try:
            async with SessionLocal() as session:
                await reclaim_stuck(session)
                ids = await due_events(session)
            for event_id in ids:
                await process_event(event_id)
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # pragma: no cover - depends on runtime state
            logger.warning("webhook_worker_iteration_failed", extra={"error": str(exc)})
        await asyncio.sleep(settings.worker_interval_seconds)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    task: asyncio.Task[None] | None = None
    if settings.worker_enabled:
        task = asyncio.create_task(_worker_loop())
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
    title="Ryoko Webhook API",
    version="0.1.0",
    description="HMAC-verified webhook inbox with durable delivery and retries.",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url=None,
)

app.add_middleware(
    RateLimitMiddleware,
    redis_url=settings.redis_url,
    rules=[
        LimitRule(name="events", path_prefix="/v1/events", limit=60, window_seconds=60),
        LimitRule(name="admin", path_prefix="/v1/admin", limit=600, window_seconds=60),
    ],
    error_base_url=settings.error_base_url,
)
app.add_middleware(RequestContextMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_origin_regex=r"https://ryoko-[a-z0-9-]+\.vercel\.app",
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
    expose_headers=["X-Request-ID", "X-RateLimit-Limit", "X-RateLimit-Remaining"],
    max_age=600,
)

install_error_handlers(app, error_base_url=settings.error_base_url)


@app.get("/health", tags=["ops"])
async def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "service": "webhook-api",
        "version": "0.1.0",
        "uptime_seconds": int(time.time() - STARTED_AT),
    }


@app.get("/ready", tags=["ops"])
async def ready() -> dict[str, Any]:
    async with SessionLocal() as session:
        await session.execute(text("SELECT 1"))
    return {"status": "ready", "service": "webhook-api", "checks": {"database": "ok"}}


app.include_router(ingest_router)
app.include_router(admin_router)
