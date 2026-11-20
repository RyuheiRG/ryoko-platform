from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import BigInteger, DateTime, Index, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class MetricsEvent(Base):
    __tablename__ = "metrics_events"
    __table_args__ = (
        Index("ix_metrics_events_occurred_at", "occurred_at"),
        Index("ix_metrics_events_type_occurred", "event_type", "occurred_at"),
        Index("ix_metrics_events_post_occurred", "post_slug", "occurred_at"),
        Index("ix_metrics_events_project_occurred", "project_slug", "occurred_at"),
        Index("ix_metrics_events_received_at", "received_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    event_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), unique=True, nullable=False)
    site_id: Mapped[str] = mapped_column(String(60), nullable=False)
    event_type: Mapped[str] = mapped_column(String(40), nullable=False)
    path: Mapped[str] = mapped_column(Text, nullable=False)
    post_slug: Mapped[str | None] = mapped_column(String(200))
    project_slug: Mapped[str | None] = mapped_column(String(200))
    ad_id: Mapped[str | None] = mapped_column(String(120))
    referrer: Mapped[str | None] = mapped_column(String(200))
    session_id: Mapped[str] = mapped_column(String(120), nullable=False)
    country: Mapped[str | None] = mapped_column(String(2))
    ip_hash: Mapped[str | None] = mapped_column(String(64))
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    properties_json: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
