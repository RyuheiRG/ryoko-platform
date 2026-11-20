"""Initial content schema.

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
    op.execute("CREATE EXTENSION IF NOT EXISTS citext")

    op.create_table(
        "media",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("storage_key", sa.Text(), nullable=False),
        sa.Column("width", sa.Integer(), nullable=False),
        sa.Column("height", sa.Integer(), nullable=False),
        sa.Column("mime_type", sa.String(length=80), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("alt", sa.Text(), nullable=False, server_default=""),
        sa.Column("blurhash", sa.Text(), nullable=True),
        sa.Column(
            "variants",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )

    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", postgresql.CITEXT(), nullable=False, unique=True),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("role", sa.String(length=20), nullable=False, server_default="editor"),
        sa.Column("display_name", sa.Text(), nullable=True),
        sa.Column("alias", sa.Text(), nullable=True),
        sa.Column(
            "avatar_media_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("media.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("bio", sa.Text(), nullable=True),
        sa.Column("github_url", sa.Text(), nullable=True),
        sa.Column("linkedin_url", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.CheckConstraint("role IN ('admin', 'editor')", name="ck_users_role"),
    )

    op.create_table(
        "tags",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("slug", postgresql.CITEXT(), nullable=False, unique=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
    )

    op.create_table(
        "posts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("slug", postgresql.CITEXT(), nullable=False, unique=True),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("excerpt", sa.Text(), nullable=False, server_default=""),
        sa.Column("content_md", sa.Text(), nullable=False, server_default=""),
        sa.Column(
            "cover_media_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("media.id", ondelete="RESTRICT"),
            nullable=True,
        ),
        sa.Column("publish_status", sa.String(length=20), nullable=False, server_default="draft"),
        sa.Column("type", sa.String(length=20), nullable=False, server_default="article"),
        sa.Column("featured", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reading_time_minutes", sa.Integer(), nullable=False, server_default="1"),
        sa.Column(
            "author_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("seo_title", sa.String(length=70), nullable=True),
        sa.Column("seo_description", sa.String(length=160), nullable=True),
        sa.Column(
            "og_media_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("media.id", ondelete="RESTRICT"),
            nullable=True,
        ),
        sa.Column("canonical_url", sa.Text(), nullable=True),
        sa.Column("noindex", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.CheckConstraint(
            "publish_status IN ('draft', 'published', 'archived')",
            name="ck_posts_publish_status",
        ),
        sa.CheckConstraint("type IN ('article', 'note')", name="ck_posts_type"),
    )
    op.create_index("ix_posts_publish_status", "posts", ["publish_status"])
    op.create_index("ix_posts_published_at", "posts", ["published_at"])
    op.create_index("ix_posts_scheduled_at", "posts", ["scheduled_at"])

    op.create_table(
        "post_tags",
        sa.Column(
            "post_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("posts.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "tag_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tags.id", ondelete="CASCADE"),
            primary_key=True,
        ),
    )
    op.create_index("ix_post_tags_tag_id", "post_tags", ["tag_id"])

    op.create_table(
        "projects",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("slug", postgresql.CITEXT(), nullable=False, unique=True),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False, server_default=""),
        sa.Column("case_study_md", sa.Text(), nullable=False, server_default=""),
        sa.Column(
            "cover_media_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("media.id", ondelete="RESTRICT"),
            nullable=True,
        ),
        sa.Column(
            "stack",
            postgresql.ARRAY(sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::text[]"),
        ),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("publish_status", sa.String(length=20), nullable=False, server_default="draft"),
        sa.Column("lifecycle_status", sa.String(length=20), nullable=False, server_default="wip"),
        sa.Column("featured", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("repo_url", sa.Text(), nullable=True),
        sa.Column("demo_url", sa.Text(), nullable=True),
        sa.Column("github_repo", sa.Text(), nullable=True),
        sa.Column("role", sa.Text(), nullable=True),
        sa.Column(
            "team",
            postgresql.ARRAY(sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::text[]"),
        ),
        sa.Column(
            "learnings",
            postgresql.ARRAY(sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::text[]"),
        ),
        sa.Column("seo_title", sa.String(length=70), nullable=True),
        sa.Column("seo_description", sa.String(length=160), nullable=True),
        sa.Column(
            "og_media_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("media.id", ondelete="RESTRICT"),
            nullable=True,
        ),
        sa.Column("canonical_url", sa.Text(), nullable=True),
        sa.Column("noindex", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.CheckConstraint(
            "publish_status IN ('draft', 'published', 'archived')",
            name="ck_projects_publish_status",
        ),
        sa.CheckConstraint(
            "lifecycle_status IN ('live', 'wip', 'archived')",
            name="ck_projects_lifecycle_status",
        ),
    )
    op.create_index("ix_projects_publish_status", "projects", ["publish_status"])

    op.create_table(
        "project_media",
        sa.Column(
            "project_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "media_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("media.id", ondelete="RESTRICT"),
            primary_key=True,
        ),
        sa.Column("role", sa.String(length=20), primary_key=True, server_default="gallery"),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_index("ix_project_media_media_id", "project_media", ["media_id"])

    op.create_table(
        "documents",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("storage_key", sa.Text(), nullable=False),
        sa.Column("mime_type", sa.String(length=80), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.CheckConstraint("kind IN ('cv', 'certificate', 'other')", name="ck_documents_kind"),
    )

    op.create_table(
        "landing_sections",
        sa.Column("key", sa.String(length=40), primary_key=True),
        sa.Column("content_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )

    op.create_table(
        "site_settings",
        sa.Column("id", sa.Integer(), primary_key=True, server_default="1"),
        sa.Column("content_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.CheckConstraint("id = 1", name="ck_site_settings_singleton"),
    )

    op.create_table(
        "redirects",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("from_path", sa.Text(), nullable=False, unique=True),
        sa.Column("to_path", sa.Text(), nullable=False),
        sa.Column("status", sa.Integer(), nullable=False, server_default="301"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.CheckConstraint("status IN (301, 308)", name="ck_redirects_status"),
    )

    op.create_table(
        "refresh_tokens",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("token_hash", sa.Text(), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("ix_refresh_tokens_user_id", "refresh_tokens", ["user_id"])


def downgrade() -> None:
    op.drop_table("refresh_tokens")
    op.drop_table("redirects")
    op.drop_table("site_settings")
    op.drop_table("landing_sections")
    op.drop_table("documents")
    op.drop_index("ix_project_media_media_id", table_name="project_media")
    op.drop_table("project_media")
    op.drop_index("ix_projects_publish_status", table_name="projects")
    op.drop_table("projects")
    op.drop_index("ix_post_tags_tag_id", table_name="post_tags")
    op.drop_table("post_tags")
    op.drop_index("ix_posts_scheduled_at", table_name="posts")
    op.drop_index("ix_posts_published_at", table_name="posts")
    op.drop_index("ix_posts_publish_status", table_name="posts")
    op.drop_table("posts")
    op.drop_table("tags")
    op.drop_table("users")
    op.drop_table("media")
