from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, PlainSerializer

from ryoko_common.time import ensure_utc


def _iso(value: datetime) -> str:
    return ensure_utc(value).isoformat().replace("+00:00", "Z")


UTCDateTime = Annotated[datetime, PlainSerializer(_iso, return_type=str, when_used="json")]


class EventEnvelope(BaseModel):
    model_config = ConfigDict(extra="ignore")

    event_id: UUID
    type: str = Field(min_length=1, max_length=80)
    occurred_at: datetime
    api_version: Literal["v1"]
    data: dict[str, Any]
    metadata: dict[str, Any] = Field(default_factory=dict)


class EventRead(BaseModel):
    id: UUID
    event_id: UUID
    type: str
    status: str
    attempts: int
    last_error: str | None
    received_at: UTCDateTime
    processed_at: UTCDateTime | None
    payload: dict[str, Any]


class AttemptRead(BaseModel):
    attempt: int
    status_code: int | None
    error: str | None
    duration_ms: int
    created_at: UTCDateTime


class EventDetail(EventRead):
    attempts_log: list[AttemptRead] = Field(default_factory=list)


class AcceptedEvent(BaseModel):
    event_id: UUID
    status: Literal["accepted"] = "accepted"
    received_at: UTCDateTime
    duplicate: bool = False


class PageMetaRead(BaseModel):
    page: int
    limit: int
    total: int
    total_pages: int
    has_next: bool
    has_prev: bool
