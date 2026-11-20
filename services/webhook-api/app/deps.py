from __future__ import annotations

from typing import Annotated

from fastapi import Depends
from fastapi.security import OAuth2PasswordBearer

from app.config import settings
from app.models import WebhookAttempt, WebhookEvent
from app.schemas import AttemptRead, EventDetail, EventRead
from ryoko_common.errors import ProblemException
from ryoko_common.security import TokenClaims, TokenError, decode_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/v1/auth/token", auto_error=False)


def event_read(event: WebhookEvent) -> EventRead:
    return EventRead(
        id=event.id,
        event_id=event.event_id,
        type=event.event_type,
        status=event.status,
        attempts=event.attempts,
        last_error=event.last_error,
        received_at=event.received_at,
        processed_at=event.processed_at,
        payload=event.payload_json,
    )


def attempt_read(attempt: WebhookAttempt) -> AttemptRead:
    return AttemptRead(
        attempt=attempt.attempt,
        status_code=attempt.status_code,
        error=attempt.error,
        duration_ms=attempt.duration_ms,
        created_at=attempt.created_at,
    )


def event_detail(event: WebhookEvent) -> EventDetail:
    base = event_read(event)
    return EventDetail(
        **base.model_dump(),
        attempts_log=[
            attempt_read(item) for item in sorted(event.attempts_log, key=lambda a: a.attempt)
        ],
    )


async def get_admin_claims(
    token: Annotated[str | None, Depends(oauth2_scheme)],
) -> TokenClaims:
    if not token:
        raise ProblemException(
            status=401,
            title="Unauthorized",
            detail="Se requiere un access token de administrador.",
            type_slug="unauthorized",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        claims = decode_token(settings, token, expected_type="access")
    except TokenError as exc:
        raise ProblemException(
            status=401,
            title="Unauthorized",
            detail=str(exc),
            type_slug="unauthorized",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
    if claims.role != "admin":
        raise ProblemException(
            status=403,
            title="Forbidden",
            detail="Esta operación requiere el rol admin.",
            type_slug="forbidden",
        )
    return claims
