from __future__ import annotations

import hashlib
import hmac
import json
import logging
import time
import uuid
from datetime import timedelta
from typing import Any, cast

import httpx
from sqlalchemy import CursorResult, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import WebhookAttempt, WebhookEvent
from ryoko_common.time import ensure_utc, iso_utc, utc_now

logger = logging.getLogger("ryoko.webhook.delivery")


def verify_signature(*, secret: str, timestamp: str, body: bytes, signature: str) -> bool:
    if signature.startswith("sha256="):
        provided = signature[len("sha256=") :]
    else:
        provided = signature
    expected = hmac.new(
        secret.encode("utf-8"), timestamp.encode("utf-8") + b"." + body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, provided)


def timestamp_is_fresh(timestamp: str, *, now: float | None = None) -> bool:
    try:
        value = int(timestamp)
    except (TypeError, ValueError):
        return False
    current = now if now is not None else time.time()
    return abs(current - value) <= settings.timestamp_tolerance_seconds


async def _try_targets(payload: bytes) -> tuple[bool, int | None, str | None, int]:
    targets: list[str] = []
    if settings.n8n_webhook_url:
        targets.append(settings.n8n_webhook_url)
    if settings.vercel_deploy_hook_url:
        targets.append(settings.vercel_deploy_hook_url)
    if not targets:
        return True, None, "sin destino configurado (modo local)", 0

    started = time.perf_counter()
    last_code: int | None = None
    last_error: str | None = None
    for index, target in enumerate(targets):
        headers = {
            "Content-Type": "application/json",
            "X-Ryoko-Delivery": "webhook-api",
        }
        if index == 0 and settings.n8n_shared_secret and settings.n8n_webhook_url:
            headers["X-Ryoko-Shared-Secret"] = settings.n8n_shared_secret.get_secret_value()
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(target, content=payload, headers=headers)
        except httpx.HTTPError as exc:
            last_error = f"{target}: {exc.__class__.__name__}: {exc}"
            continue
        last_code = response.status_code
        if 200 <= response.status_code < 300:
            duration = int((time.perf_counter() - started) * 1000)
            return True, response.status_code, None, duration
        last_error = f"{target}: HTTP {response.status_code}"
    duration = int((time.perf_counter() - started) * 1000)
    return False, last_code, last_error, duration


async def _notify_dead_letter(event: WebhookEvent) -> None:
    if not settings.discord_webhook_url:
        return
    content = (
        f"Webhook `{event.event_type}` ({event.event_id}) pasó a dead_letter "
        f"tras {event.attempts} intentos. Último error: {event.last_error or 'desconocido'}"
    )
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(settings.discord_webhook_url, json={"content": content[:1900]})
    except httpx.HTTPError as exc:  # pragma: no cover - external dependency
        logger.warning("discord_notification_failed", extra={"error": str(exc)})


def _next_delay(attempts: int) -> int:
    schedule = settings.retry_schedule or [60, 300, 900, 3600, 21600]
    index = min(max(attempts - 1, 0), len(schedule) - 1)
    return schedule[index]


async def claim_event(session: AsyncSession, event_pk: uuid.UUID) -> bool:
    result = cast(
        CursorResult[Any],
        await session.execute(
            update(WebhookEvent)
            .where(WebhookEvent.id == event_pk, WebhookEvent.status == "queued")
            .values(status="processing")
        ),
    )
    await session.commit()
    return bool(result.rowcount)


async def deliver_event(session: AsyncSession, event: WebhookEvent) -> WebhookEvent:
    payload = json.dumps(event.payload_json, separators=(",", ":"), ensure_ascii=False).encode(
        "utf-8"
    )
    event.attempts += 1
    ok, status_code, error, duration_ms = await _try_targets(payload)
    session.add(
        WebhookAttempt(
            webhook_event_id=event.id,
            attempt=event.attempts,
            status_code=status_code,
            error=error,
            duration_ms=duration_ms,
        )
    )
    event.last_error = error
    if ok:
        event.status = "delivered"
        event.processed_at = utc_now()
    elif event.attempts >= settings.max_attempts:
        event.status = "dead_letter"
        event.processed_at = utc_now()
    else:
        event.status = "queued"
        event.next_attempt_at = utc_now() + timedelta(seconds=_next_delay(event.attempts))
    await session.commit()
    await session.refresh(event)
    if event.status == "dead_letter":
        await _notify_dead_letter(event)
    return event


async def process_event(event_pk: uuid.UUID) -> None:
    from app.database import SessionLocal

    async with SessionLocal() as session:
        if not await claim_event(session, event_pk):
            return
        event = await session.get(WebhookEvent, event_pk)
        if event is None:
            return
        try:
            await deliver_event(session, event)
        except Exception as exc:  # pragma: no cover - defensive
            logger.exception("webhook_delivery_crashed")
            await session.rollback()
            event = await session.get(WebhookEvent, event_pk)
            if event is not None:
                event.status = "queued"
                event.last_error = str(exc)
                await session.commit()


async def due_events(session: AsyncSession, *, limit: int = 10) -> list[uuid.UUID]:
    rows = (
        (
            await session.execute(
                select(WebhookEvent.id)
                .where(
                    WebhookEvent.status == "queued",
                    WebhookEvent.next_attempt_at <= utc_now(),
                )
                .order_by(WebhookEvent.next_attempt_at)
                .limit(limit)
            )
        )
        .scalars()
        .all()
    )
    return list(rows)


async def reclaim_stuck(session: AsyncSession, *, older_than_seconds: int = 600) -> None:
    cutoff = utc_now() - timedelta(seconds=older_than_seconds)
    rows = (
        (
            await session.execute(
                select(WebhookEvent).where(
                    WebhookEvent.status == "processing",
                    WebhookEvent.received_at <= cutoff,
                )
            )
        )
        .scalars()
        .all()
    )
    for event in rows:
        event.status = "queued"
        event.next_attempt_at = utc_now()
    if rows:
        await session.commit()


def envelope_for_delivery(event: WebhookEvent) -> dict[str, Any]:
    return {
        "event_id": str(event.event_id),
        "type": event.event_type,
        "payload": event.payload_json,
        "received_at": iso_utc(ensure_utc(event.received_at)),
    }


async def run_due(session: AsyncSession) -> int:
    ids = await due_events(session)
    for event_id in ids:
        await process_event(event_id)
    return len(ids)
