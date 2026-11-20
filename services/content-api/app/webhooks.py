from __future__ import annotations

import hashlib
import hmac
import json
import logging
import time
import uuid
from typing import Any

import httpx

from app.config import settings
from ryoko_common.time import iso_utc, utc_now

logger = logging.getLogger("ryoko.webhooks")


async def emit_event(event_type: str, data: dict[str, Any], actor_id: uuid.UUID | str) -> uuid.UUID:
    event_id = uuid.uuid4()
    envelope = {
        "event_id": str(event_id),
        "type": event_type,
        "occurred_at": iso_utc(utc_now()),
        "api_version": "v1",
        "data": data,
        "metadata": {"actor_id": str(actor_id), "source": "content-api"},
    }
    body = json.dumps(envelope, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    timestamp = str(int(time.time()))
    signature = hmac.new(
        settings.webhook_secret.get_secret_value().encode("utf-8"),
        timestamp.encode("utf-8") + b"." + body,
        hashlib.sha256,
    ).hexdigest()
    headers = {
        "Content-Type": "application/json",
        "X-Ryoko-Event-Id": str(event_id),
        "X-Ryoko-Event-Type": event_type,
        "X-Ryoko-Timestamp": timestamp,
        "X-Ryoko-Signature": f"sha256={signature}",
    }

    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            response = await client.post(settings.webhook_url, content=body, headers=headers)
        if response.status_code >= 300:
            logger.warning(
                "webhook_delivery_rejected",
                extra={"request_id": str(event_id), "status_code": response.status_code},
            )
    except httpx.HTTPError as exc:
        logger.warning(
            "webhook_delivery_failed",
            extra={"request_id": str(event_id), "path": settings.webhook_url, "error": str(exc)},
        )
    return event_id
