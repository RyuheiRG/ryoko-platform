from __future__ import annotations

import asyncio
import hashlib
import json
import secrets
import uuid
from datetime import date, datetime, timedelta
from enum import StrEnum
from typing import Any

import strawberry
from fastapi import Request
from graphql import GraphQLError
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from strawberry.scalars import JSON
from strawberry.types import Info

from app.config import settings
from app.models import MetricsEvent
from ryoko_common.security import TokenError, decode_token
from ryoko_common.time import ensure_utc, utc_now

VIEW_EVENT_TYPES = ("PAGE_VIEW", "POST_VIEW", "PROJECT_VIEW")


class GraphQLContextError(GraphQLError):
    pass


@strawberry.enum
class EventType(StrEnum):
    PAGE_VIEW = "PAGE_VIEW"
    POST_VIEW = "POST_VIEW"
    PROJECT_VIEW = "PROJECT_VIEW"
    OUTBOUND_CLICK = "OUTBOUND_CLICK"
    AD_IMPRESSION = "AD_IMPRESSION"
    AD_CLICK = "AD_CLICK"


@strawberry.input
class TrackEventInput:
    event_id: uuid.UUID
    type: EventType
    path: str
    session_id: str
    occurred_at: datetime
    post_slug: str | None = None
    project_slug: str | None = None
    ad_id: str | None = None
    referrer: str | None = None
    properties: JSON | None = None


@strawberry.type
class TrackEventPayload:
    ok: bool
    event_id: uuid.UUID
    duplicate: bool


@strawberry.type
class TrackEventsPayload:
    accepted: int
    duplicates: int


@strawberry.input
class DateRangeInput:
    from_: datetime = strawberry.field(name="from")
    to: datetime


@strawberry.type
class TimeSeriesPoint:
    date: date
    value: int


@strawberry.type
class TimeSeries:
    total: int
    points: list[TimeSeriesPoint]


@strawberry.type
class TopPost:
    slug: str
    title: str | None
    views: int


@strawberry.type
class ProjectClicks:
    slug: str
    clicks: int


@strawberry.type
class OutboundClick:
    url: str
    clicks: int


@strawberry.type
class AdMetrics:
    impressions: int
    clicks: int
    ctr: float


def _session(info: Info[Any, Any]) -> AsyncSession:
    context = info.context
    assert isinstance(context, dict)
    session = context.get("session")
    if not isinstance(session, AsyncSession):
        raise GraphQLContextError("Sesión de base de datos no disponible.")
    return session


def _request(info: Info[Any, Any]) -> Request:
    context = info.context
    assert isinstance(context, dict)
    request = context.get("request")
    if not isinstance(request, Request):
        raise GraphQLContextError("Request no disponible.")
    return request


def _lock(info: Info[Any, Any]) -> asyncio.Lock:
    context = info.context
    assert isinstance(context, dict)
    lock = context.get("lock")
    if not isinstance(lock, asyncio.Lock):
        raise GraphQLContextError("Lock de sesión no disponible.")
    return lock


def _require_site_key(info: Info[Any, Any]) -> None:
    provided = _request(info).headers.get("x-site-key", "")
    if not provided or not secrets.compare_digest(provided, settings.site_key):
        raise GraphQLContextError("X-Site-Key inválida.")


def _require_admin(info: Info[Any, Any]) -> None:
    authorization = _request(info).headers.get("authorization", "")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise GraphQLContextError("Se requiere un access token de administrador.")
    try:
        claims = decode_token(settings, token, expected_type="access")
    except TokenError as exc:
        raise GraphQLContextError(str(exc)) from exc
    if claims.role != "admin":
        raise GraphQLContextError("Esta consulta requiere el rol admin.")


def _clean_referrer(value: str | None) -> str | None:
    if not value:
        return None
    from urllib.parse import urlsplit, urlunsplit

    try:
        parts = urlsplit(value)
    except ValueError:
        return value[:200]
    if parts.scheme and parts.netloc:
        cleaned = urlunsplit((parts.scheme, parts.netloc, parts.path, "", ""))
    else:
        cleaned = value
    return cleaned[:200]


def _hash_ip(request: Request) -> str | None:
    forwarded = request.headers.get("x-forwarded-for")
    ip = forwarded.split(",")[0].strip() if forwarded else None
    if not ip and request.client is not None:
        ip = request.client.host
    if not ip:
        return None
    salt = settings.ip_hash_salt.get_secret_value()
    daily = utc_now().date().isoformat()
    return hashlib.sha256(f"{salt}:{daily}:{ip}".encode()).hexdigest()


def _row(item: TrackEventInput, *, ip_hash: str | None, request: Request) -> dict[str, Any]:
    country = request.headers.get("x-vercel-ip-country") or request.headers.get("cf-ipcountry")
    properties = item.properties
    if properties is not None and not isinstance(properties, dict):
        raise GraphQLContextError("properties debe ser un objeto JSON.")
    if properties is not None and len(json.dumps(properties)) > 4096:
        raise GraphQLContextError("properties supera 4 KB.")
    return {
        "event_id": item.event_id,
        "site_id": settings.site_id,
        "event_type": item.type.value,
        "path": item.path[:2048],
        "post_slug": (item.post_slug[:200] if item.post_slug else None),
        "project_slug": (item.project_slug[:200] if item.project_slug else None),
        "ad_id": (item.ad_id[:120] if item.ad_id else None),
        "referrer": _clean_referrer(item.referrer),
        "session_id": item.session_id[:120],
        "country": country[:2].upper() if country else None,
        "ip_hash": ip_hash,
        "occurred_at": ensure_utc(item.occurred_at),
        "received_at": utc_now(),
        "properties_json": properties,
    }


def _validate_occurred_at(value: datetime) -> None:
    occurred = ensure_utc(value)
    if abs((utc_now() - occurred).total_seconds()) > 600:
        raise GraphQLContextError("occurred_at debe estar dentro de ±10 minutos.")


def _validate_range(value: DateRangeInput) -> tuple[datetime, datetime]:
    start = ensure_utc(value.from_)
    end = ensure_utc(value.to)
    if start >= end:
        raise GraphQLContextError("El rango debe tener from < to.")
    if (end - start) > timedelta(days=366):
        raise GraphQLContextError("El rango máximo es de 366 días.")
    return start, end


async def _insert_events(session: AsyncSession, rows: list[dict[str, Any]]) -> tuple[int, int]:
    if not rows:
        return 0, 0
    statement = (
        pg_insert(MetricsEvent)
        .values(rows)
        .on_conflict_do_nothing(index_elements=[MetricsEvent.event_id])
        .returning(MetricsEvent.id)
    )
    result = await session.execute(statement)
    inserted = len(result.scalars().all())
    await session.commit()
    return inserted, len(rows) - inserted


async def _count(
    session: AsyncSession,
    *,
    from_: datetime,
    to: datetime,
    event_types: tuple[str, ...],
    path: str | None = None,
) -> int:
    stmt = (
        select(func.count())
        .select_from(MetricsEvent)
        .where(
            MetricsEvent.received_at >= from_,
            MetricsEvent.received_at <= to,
            MetricsEvent.event_type.in_(event_types),
        )
    )
    if path:
        stmt = stmt.where(MetricsEvent.path == path)
    return int(await session.scalar(stmt) or 0)


@strawberry.type
class Query:
    @strawberry.field(name="pageViews")
    async def page_views(
        self,
        info: Info[Any, Any],
        range: DateRangeInput,
        path: str | None = None,
    ) -> TimeSeries:
        _require_admin(info)
        async with _lock(info):
            start, end = _validate_range(range)
            session = _session(info)
            total = await _count(
                session, from_=start, to=end, event_types=VIEW_EVENT_TYPES, path=path
            )
            rows = (
                await session.execute(
                    select(
                        func.date(MetricsEvent.received_at).label("day"),
                        func.count().label("value"),
                    )
                    .where(
                        MetricsEvent.received_at >= start,
                        MetricsEvent.received_at <= end,
                        MetricsEvent.event_type.in_(VIEW_EVENT_TYPES),
                        *([MetricsEvent.path == path] if path else []),
                    )
                    .group_by("day")
                    .order_by("day")
                )
            ).all()
            by_day = {row[0]: int(row[1]) for row in rows}
            points: list[TimeSeriesPoint] = []
            current = start.date()
            last = end.date()
            while current <= last:
                points.append(TimeSeriesPoint(date=current, value=by_day.get(current, 0)))
                current += timedelta(days=1)
            return TimeSeries(total=total, points=points)

    @strawberry.field(name="topPosts")
    async def top_posts(
        self,
        info: Info[Any, Any],
        range: DateRangeInput,
        limit: int = 10,
    ) -> list[TopPost]:
        _require_admin(info)
        async with _lock(info):
            start, end = _validate_range(range)
            session = _session(info)
            rows = (
                await session.execute(
                    select(MetricsEvent.post_slug, func.count().label("views"))
                    .where(
                        MetricsEvent.received_at >= start,
                        MetricsEvent.received_at <= end,
                        MetricsEvent.event_type == "POST_VIEW",
                        MetricsEvent.post_slug.is_not(None),
                    )
                    .group_by(MetricsEvent.post_slug)
                    .order_by(func.count().desc())
                    .limit(max(1, min(limit, 50)))
                )
            ).all()
            return [
                TopPost(slug=str(row[0]), title=None, views=int(row[1])) for row in rows if row[0]
            ]

    @strawberry.field(name="projectClicks")
    async def project_clicks(
        self, info: Info[Any, Any], range: DateRangeInput
    ) -> list[ProjectClicks]:
        _require_admin(info)
        async with _lock(info):
            start, end = _validate_range(range)
            session = _session(info)
            rows = (
                await session.execute(
                    select(MetricsEvent.project_slug, func.count().label("clicks"))
                    .where(
                        MetricsEvent.received_at >= start,
                        MetricsEvent.received_at <= end,
                        MetricsEvent.event_type == "OUTBOUND_CLICK",
                        MetricsEvent.project_slug.is_not(None),
                    )
                    .group_by(MetricsEvent.project_slug)
                    .order_by(func.count().desc())
                )
            ).all()
            return [ProjectClicks(slug=str(row[0]), clicks=int(row[1])) for row in rows if row[0]]

    @strawberry.field(name="outboundClicks")
    async def outbound_clicks(
        self,
        info: Info[Any, Any],
        range: DateRangeInput,
        limit: int = 20,
    ) -> list[OutboundClick]:
        _require_admin(info)
        async with _lock(info):
            start, end = _validate_range(range)
            session = _session(info)
            url = MetricsEvent.properties_json.op("->>")("url")
            rows = (
                await session.execute(
                    select(url.label("url"), func.count().label("clicks"))
                    .where(
                        MetricsEvent.received_at >= start,
                        MetricsEvent.received_at <= end,
                        MetricsEvent.event_type == "OUTBOUND_CLICK",
                        url.is_not(None),
                    )
                    .group_by(url)
                    .order_by(func.count().desc())
                    .limit(max(1, min(limit, 100)))
                )
            ).all()
            return [OutboundClick(url=str(row[0]), clicks=int(row[1])) for row in rows if row[0]]

    @strawberry.field(name="adMetrics")
    async def ad_metrics(
        self, info: Info[Any, Any], range: DateRangeInput, ad_id: str | None = None
    ) -> AdMetrics:
        _require_admin(info)
        async with _lock(info):
            start, end = _validate_range(range)
            session = _session(info)
            filters = [
                MetricsEvent.received_at >= start,
                MetricsEvent.received_at <= end,
            ]
            if ad_id:
                filters.append(MetricsEvent.ad_id == ad_id)
            rows = (
                await session.execute(
                    select(MetricsEvent.event_type, func.count())
                    .where(*filters, MetricsEvent.event_type.in_(("AD_IMPRESSION", "AD_CLICK")))
                    .group_by(MetricsEvent.event_type)
                )
            ).all()
            counts = {row[0]: int(row[1]) for row in rows}
            impressions = counts.get("AD_IMPRESSION", 0)
            clicks = counts.get("AD_CLICK", 0)
            ctr = (clicks / impressions) if impressions else 0.0
            return AdMetrics(impressions=impressions, clicks=clicks, ctr=ctr)

    @strawberry.field(name="realtime")
    async def realtime(self, info: Info[Any, Any], window_minutes: int = 5) -> int:
        _require_admin(info)
        async with _lock(info):
            session = _session(info)
            window = max(1, min(window_minutes, 60))
            cutoff = utc_now() - timedelta(minutes=window)
            return int(
                await session.scalar(
                    select(func.count())
                    .select_from(MetricsEvent)
                    .where(MetricsEvent.received_at >= cutoff)
                )
                or 0
            )


@strawberry.type
class Mutation:
    @strawberry.mutation(name="trackEvent")
    async def track_event(self, info: Info[Any, Any], input: TrackEventInput) -> TrackEventPayload:
        _require_site_key(info)
        _validate_occurred_at(input.occurred_at)
        request = _request(info)
        row = _row(input, ip_hash=_hash_ip(request), request=request)
        async with _lock(info):
            inserted, _duplicates = await _insert_events(_session(info), [row])
        if inserted == 0:
            return TrackEventPayload(ok=True, event_id=input.event_id, duplicate=True)
        return TrackEventPayload(ok=True, event_id=input.event_id, duplicate=False)

    @strawberry.mutation(name="trackEvents")
    async def track_events(
        self, info: Info[Any, Any], input: list[TrackEventInput]
    ) -> TrackEventsPayload:
        _require_site_key(info)
        if not input:
            return TrackEventsPayload(accepted=0, duplicates=0)
        if len(input) > 20:
            raise GraphQLContextError("El batch máximo es de 20 eventos.")
        for item in input:
            _validate_occurred_at(item.occurred_at)
        request = _request(info)
        ip_hash = _hash_ip(request)
        rows = [_row(item, ip_hash=ip_hash, request=request) for item in input]
        async with _lock(info):
            accepted, duplicates = await _insert_events(_session(info), rows)
        return TrackEventsPayload(accepted=accepted, duplicates=duplicates)


schema = strawberry.Schema(
    query=Query,
    mutation=Mutation,
    config=strawberry.schema.config.StrawberryConfig(auto_camel_case=False),
)
