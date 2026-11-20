"""Initial metrics schema.

Revision ID: 0001_initial
Revises:
Create Date: 2026-11-18
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0001_initial"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "metrics_events",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), nullable=False, unique=True),
        sa.Column("site_id", sa.String(length=60), nullable=False),
        sa.Column("event_type", sa.String(length=40), nullable=False),
        sa.Column("path", sa.Text(), nullable=False),
        sa.Column("post_slug", sa.String(length=200), nullable=True),
        sa.Column("project_slug", sa.String(length=200), nullable=True),
        sa.Column("ad_id", sa.String(length=120), nullable=True),
        sa.Column("referrer", sa.String(length=200), nullable=True),
        sa.Column("session_id", sa.String(length=120), nullable=False),
        sa.Column("country", sa.String(length=2), nullable=True),
        sa.Column("ip_hash", sa.String(length=64), nullable=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "received_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("properties_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.create_index("ix_metrics_events_occurred_at", "metrics_events", ["occurred_at"])
    op.create_index(
        "ix_metrics_events_type_occurred", "metrics_events", ["event_type", "occurred_at"]
    )
    op.create_index(
        "ix_metrics_events_post_occurred", "metrics_events", ["post_slug", "occurred_at"]
    )
    op.create_index(
        "ix_metrics_events_project_occurred",
        "metrics_events",
        ["project_slug", "occurred_at"],
    )
    op.create_index("ix_metrics_events_received_at", "metrics_events", ["received_at"])


def downgrade() -> None:
    op.drop_index("ix_metrics_events_received_at", table_name="metrics_events")
    op.drop_index("ix_metrics_events_project_occurred", table_name="metrics_events")
    op.drop_index("ix_metrics_events_post_occurred", table_name="metrics_events")
    op.drop_index("ix_metrics_events_type_occurred", table_name="metrics_events")
    op.drop_index("ix_metrics_events_occurred_at", table_name="metrics_events")
    op.drop_table("metrics_events")
