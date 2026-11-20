from __future__ import annotations

import asyncio
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from strawberry.fastapi import GraphQLRouter

from app.config import settings
from app.database import SessionLocal, engine
from app.schema import schema
from ryoko_common.errors import install_error_handlers
from ryoko_common.logging import RequestContextMiddleware, configure_logging
from ryoko_common.ratelimit import LimitRule, RateLimitMiddleware

STARTED_AT = time.time()


async def get_context(request: Request) -> AsyncIterator[dict[str, Any]]:
    async with SessionLocal() as session:
        # Strawberry resolves GraphQL query fields concurrently; an AsyncSession
        # (and its asyncpg connection) cannot serve parallel statements.
        yield {"session": session, "request": request, "lock": asyncio.Lock()}


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    try:
        yield
    finally:
        await engine.dispose()


configure_logging(settings.log_level)

app = FastAPI(
    title="Ryoko Metrics API",
    version="0.1.0",
    description="Privacy-friendly analytics ingestion and GraphQL aggregates.",
    lifespan=lifespan,
    docs_url=None,
    redoc_url=None,
)

app.add_middleware(
    RateLimitMiddleware,
    redis_url=settings.redis_url,
    rules=[LimitRule(name="graphql", path_prefix="/graphql", limit=120, window_seconds=60)],
    error_base_url=settings.error_base_url,
)
app.add_middleware(RequestContextMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_origin_regex=r"https://ryoko-[a-z0-9-]+\.vercel\.app",
    allow_credentials=False,
    allow_methods=["POST", "OPTIONS"],
    allow_headers=["Content-Type", "X-Site-Key", "Authorization"],
    max_age=86400,
)

install_error_handlers(app, error_base_url=settings.error_base_url)

app.include_router(GraphQLRouter(schema, context_getter=get_context), prefix="/graphql")


@app.get("/health", tags=["ops"])
async def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "service": "metrics-api",
        "version": "0.1.0",
        "uptime_seconds": int(time.time() - STARTED_AT),
    }


@app.get("/ready", tags=["ops"])
async def ready() -> dict[str, Any]:
    async with SessionLocal() as session:
        await session.execute(text("SELECT 1"))
    return {"status": "ready", "service": "metrics-api", "checks": {"database": "ok"}}
