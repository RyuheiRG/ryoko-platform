from __future__ import annotations

import asyncio
import hashlib
import logging
import time
from dataclasses import dataclass

from fastapi import Request
from redis.asyncio import Redis
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import JSONResponse, Response

logger = logging.getLogger("ryoko.ratelimit")


@dataclass(frozen=True)
class LimitRule:
    name: str
    path_prefix: str
    limit: int
    window_seconds: int = 60
    methods: frozenset[str] | None = None


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Redis-backed fixed-window rate limiting with an in-memory fallback."""

    def __init__(
        self,
        app: object,
        *,
        redis_url: str,
        rules: list[LimitRule],
        error_base_url: str,
    ) -> None:
        super().__init__(app)  # type: ignore[arg-type]
        self._redis = Redis.from_url(
            redis_url,
            encoding="utf-8",
            decode_responses=True,
            socket_connect_timeout=0.25,
            socket_timeout=0.25,
        )
        self._rules = sorted(rules, key=lambda rule: len(rule.path_prefix), reverse=True)
        self._memory: dict[str, tuple[int, float]] = {}
        self._lock = asyncio.Lock()
        self._redis_warned = False
        self._error_base_url = error_base_url

    def _select_rule(self, request: Request) -> LimitRule | None:
        for rule in self._rules:
            if request.url.path.startswith(rule.path_prefix):
                if rule.methods is None or request.method in rule.methods:
                    return rule
        return None

    @staticmethod
    def _identity(request: Request) -> str:
        authorization = request.headers.get("authorization")
        if authorization:
            return "auth_" + hashlib.sha256(authorization.encode()).hexdigest()[:24]
        host = request.client.host if request.client else "unknown"
        return "ip_" + hashlib.sha256(host.encode()).hexdigest()[:24]

    async def _redis_count(self, key: str, window: int) -> tuple[int, int] | None:
        try:
            count = await self._redis.incr(key)
            if count == 1:
                await self._redis.expire(key, window)
            ttl = await self._redis.ttl(key)
            return int(count), max(int(ttl), 1)
        except Exception as exc:  # pragma: no cover - depends on Redis availability
            if not self._redis_warned:
                self._redis_warned = True
                logger.warning("redis_rate_limit_unavailable", extra={"error": str(exc)})
            return None

    async def _memory_count(self, key: str, window: int) -> tuple[int, int]:
        now = time.monotonic()
        async with self._lock:
            count, reset_at = self._memory.get(key, (0, now + window))
            if reset_at <= now:
                count, reset_at = 0, now + window
            count += 1
            self._memory[key] = (count, reset_at)
            if len(self._memory) > 20_000:
                self._memory = {k: v for k, v in self._memory.items() if v[1] > now}
            return count, max(int(reset_at - now), 1)

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        rule = self._select_rule(request)
        if rule is None or request.method == "OPTIONS":
            return await call_next(request)

        identity = self._identity(request)
        window_start = int(time.time() // rule.window_seconds)
        key = f"ryoko:rl:{rule.name}:{identity}:{window_start}"
        result = await self._redis_count(key, rule.window_seconds)
        if result is None:
            result = await self._memory_count(key, rule.window_seconds)
        count, ttl = result
        remaining = max(rule.limit - count, 0)
        headers = {
            "X-RateLimit-Limit": str(rule.limit),
            "X-RateLimit-Remaining": str(remaining),
            "X-RateLimit-Reset": str(int(time.time()) + ttl),
        }
        if count > rule.limit:
            headers["Retry-After"] = str(ttl)
            request_id = getattr(request.state, "request_id", "req_unknown")
            return JSONResponse(
                status_code=429,
                headers={**headers, "content-type": "application/problem+json"},
                content={
                    "type": f"{self._error_base_url.rstrip('/')}/rate-limit",
                    "title": "Too many requests",
                    "status": 429,
                    "detail": "Se excedió el límite de solicitudes. Intenta de nuevo más tarde.",
                    "instance": request.url.path,
                    "request_id": request_id,
                },
            )

        response = await call_next(request)
        for name, value in headers.items():
            response.headers[name] = value
        return response
