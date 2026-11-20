from __future__ import annotations

import json
import logging
import uuid
from typing import Annotated, Any

from fastapi import APIRouter, BackgroundTasks, Depends, Query, Request, status
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_session
from app.delivery import process_event, timestamp_is_fresh, verify_signature
from app.deps import event_detail, event_read, get_admin_claims
from app.models import WebhookEvent
from app.schemas import AcceptedEvent, EventEnvelope
from ryoko_common.errors import ProblemException, ProblemField
from ryoko_common.pagination import page_meta
from ryoko_common.security import TokenClaims
from ryoko_common.time import utc_now

logger = logging.getLogger("ryoko.webhook")

ingest_router = APIRouter(tags=["ingest"])
admin_router = APIRouter(prefix="/v1/admin/events", tags=["admin:events"])

SessionDep = Annotated[AsyncSession, Depends(get_session)]
ClaimsDep = Annotated[TokenClaims, Depends(get_admin_claims)]


def _bad(field: str, message: str) -> ProblemException:
    return ProblemException(
        status=400,
        title="Bad request",
        detail=message,
        type_slug="bad-request",
        errors=[ProblemField(field=field, code="invalid", message=message)],
    )


@ingest_router.post("/v1/events", status_code=status.HTTP_202_ACCEPTED)
async def receive_event(
    request: Request,
    background: BackgroundTasks,
    session: SessionDep,
) -> dict[str, Any]:
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > settings.max_body_bytes:
        raise ProblemException(
            status=413,
            title="Payload too large",
            detail="El body supera 1 MB.",
            type_slug="payload-too-large",
        )
    body = await request.body()
    if len(body) > settings.max_body_bytes:
        raise ProblemException(
            status=413,
            title="Payload too large",
            detail="El body supera 1 MB.",
            type_slug="payload-too-large",
        )

    event_id_header = request.headers.get("x-ryoko-event-id")
    event_type_header = request.headers.get("x-ryoko-event-type")
    timestamp = request.headers.get("x-ryoko-timestamp")
    signature = request.headers.get("x-ryoko-signature")
    missing = [
        name
        for name, value in (
            ("X-Ryoko-Event-Id", event_id_header),
            ("X-Ryoko-Event-Type", event_type_header),
            ("X-Ryoko-Timestamp", timestamp),
            ("X-Ryoko-Signature", signature),
        )
        if not value
    ]
    if missing:
        raise _bad("headers", f"Faltan headers: {', '.join(missing)}.")
    assert event_id_header and event_type_header and timestamp and signature

    if not timestamp_is_fresh(timestamp):
        raise ProblemException(
            status=401,
            title="Unauthorized",
            detail="Timestamp fuera de la ventana permitida (300 s).",
            type_slug="unauthorized",
        )
    if not verify_signature(
        secret=settings.webhook_secret.get_secret_value(),
        timestamp=timestamp,
        body=body,
        signature=signature,
    ):
        raise ProblemException(
            status=401,
            title="Unauthorized",
            detail="Firma HMAC inválida.",
            type_slug="unauthorized",
        )

    try:
        raw = json.loads(body)
    except json.JSONDecodeError as exc:
        raise _bad("body", "JSON inválido.") from exc

    try:
        envelope = EventEnvelope.model_validate(raw)
    except ValidationError as exc:
        raise _bad("body", f"Envelope inválido: {exc.errors()[0]['msg']}") from exc

    if str(envelope.event_id) != event_id_header:
        raise _bad("X-Ryoko-Event-Id", "El header no coincide con event_id del body.")
    if envelope.type != event_type_header:
        raise _bad("X-Ryoko-Event-Type", "El header no coincide con type del body.")

    existing = await session.scalar(
        select(WebhookEvent).where(WebhookEvent.event_id == envelope.event_id)
    )
    if existing is not None:
        payload = AcceptedEvent(
            event_id=existing.event_id,
            received_at=existing.received_at,
            duplicate=True,
        )
        return {"data": payload.model_dump(mode="json")}

    event = WebhookEvent(
        id=uuid.uuid4(),
        event_id=envelope.event_id,
        event_type=envelope.type,
        payload_json=raw,
        status="queued",
        attempts=0,
    )
    session.add(event)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        existing = await session.scalar(
            select(WebhookEvent).where(WebhookEvent.event_id == envelope.event_id)
        )
        if existing is None:
            raise
        payload = AcceptedEvent(
            event_id=existing.event_id,
            received_at=existing.received_at,
            duplicate=True,
        )
        return {"data": payload.model_dump(mode="json")}
    await session.refresh(event)
    background.add_task(process_event, event.id)
    accepted = AcceptedEvent(event_id=event.event_id, received_at=event.received_at)
    return {"data": accepted.model_dump(mode="json")}


@admin_router.get("")
async def list_events(
    session: SessionDep,
    _claims: ClaimsDep,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    type_filter: Annotated[str | None, Query(alias="type")] = None,
) -> dict[str, Any]:
    filters = []
    if status_filter:
        filters.append(WebhookEvent.status == status_filter)
    if type_filter:
        filters.append(WebhookEvent.event_type == type_filter)
    total = int(await session.scalar(select(func.count(WebhookEvent.id)).where(*filters)) or 0)
    meta = page_meta(page=page, limit=limit, total=total)
    rows = (
        (
            await session.execute(
                select(WebhookEvent)
                .where(*filters)
                .order_by(WebhookEvent.received_at.desc())
                .offset((meta.page - 1) * limit)
                .limit(limit)
            )
        )
        .scalars()
        .all()
    )
    return {
        "data": [event_read(row).model_dump(mode="json") for row in rows],
        "meta": meta.as_dict(),
    }


@admin_router.get("/{event_id}")
async def get_event(
    event_id: uuid.UUID,
    session: SessionDep,
    _claims: ClaimsDep,
) -> dict[str, Any]:
    event = await session.scalar(select(WebhookEvent).where(WebhookEvent.event_id == event_id))
    if event is None:
        raise ProblemException(status=404, title="Not found", detail="Evento no encontrado.")
    return {"data": event_detail(event).model_dump(mode="json")}


@admin_router.post("/{event_id}/retry")
async def retry_event(
    event_id: uuid.UUID,
    background: BackgroundTasks,
    session: SessionDep,
    _claims: ClaimsDep,
) -> dict[str, Any]:
    event = await session.scalar(select(WebhookEvent).where(WebhookEvent.event_id == event_id))
    if event is None:
        raise ProblemException(status=404, title="Not found", detail="Evento no encontrado.")
    if event.status == "processing":
        raise ProblemException(
            status=409,
            title="Conflict",
            detail="El evento se está procesando.",
            type_slug="conflict",
        )
    event.status = "queued"
    event.attempts = 0
    event.last_error = None
    event.processed_at = None
    event.next_attempt_at = utc_now()
    await session.commit()
    background.add_task(process_event, event.id)
    logger.info("webhook_manual_retry", extra={"request_id": str(event.event_id)})
    return {"data": event_read(event).model_dump(mode="json")}
