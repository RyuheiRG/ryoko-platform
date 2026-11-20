from __future__ import annotations

import re
import unicodedata
import uuid
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Media, Tag
from app.schemas import (
    AdminPost,
    AdminProject,
    AuthorRead,
    MediaRead,
    PostRead,
    PostSummaryRead,
    ProjectRead,
    ProjectSummaryRead,
    Seo,
    TagRead,
)
from ryoko_common.errors import ProblemException


def slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    ascii_value = normalized.encode("ascii", "ignore").decode("ascii").lower()
    cleaned = re.sub(r"[^a-z0-9]+", "-", ascii_value).strip("-")
    return cleaned or f"item-{uuid.uuid4().hex[:8]}"


def reading_time(content: str) -> int:
    words = len(re.findall(r"\S+", content))
    return max(1, round(words / 200))


def _media_variants(media: Media) -> list[dict[str, int | str]]:
    variants: list[dict[str, int | str]] = []
    for variant in media.variants:
        width = variant.get("width")
        url = variant.get("url")
        if isinstance(width, (int, float, str)) and isinstance(url, str):
            variants.append({"width": int(width), "url": url})
    return variants


def media_read(media: Media | None) -> MediaRead | None:
    if media is None:
        return None
    return MediaRead(
        id=media.id,
        url=media.url,
        width=media.width,
        height=media.height,
        mime_type=media.mime_type,
        size_bytes=media.size_bytes,
        alt=media.alt,
        blurhash=media.blurhash,
        variants=_media_variants(media),
        created_at=media.created_at,
    )


def author_read(user: Any) -> AuthorRead:
    return AuthorRead(
        id=user.id,
        name=user.display_name or user.email.split("@")[0],
        alias=user.alias,
        avatar=media_read(user.avatar),
        bio=user.bio,
        github_url=user.github_url,
        linkedin_url=user.linkedin_url,
    )


def seo_read(post_or_project: Any) -> Seo:
    og_url: str | None = None
    if post_or_project.og_image is not None:
        og_url = post_or_project.og_image.url
    return Seo(
        title=post_or_project.seo_title,
        description=post_or_project.seo_description,
        og_image=og_url,
        canonical_url=post_or_project.canonical_url,
        noindex=post_or_project.noindex,
    )


async def tag_counts(session: AsyncSession, *, published_only: bool = True) -> dict[uuid.UUID, int]:
    from app.models import Post, post_tags

    stmt = (
        select(post_tags.c.tag_id, func.count(Post.id))
        .join(Post, Post.id == post_tags.c.post_id)
        .group_by(post_tags.c.tag_id)
    )
    if published_only:
        stmt = stmt.where(Post.publish_status == "published")
    rows = (await session.execute(stmt)).all()
    return {row[0]: int(row[1]) for row in rows}


def tag_read(tag: Tag, count: int) -> TagRead:
    return TagRead(
        id=tag.id,
        slug=tag.slug,
        name=tag.name,
        description=tag.description,
        post_count=count,
    )


def _tags(post: Any, counts: dict[uuid.UUID, int]) -> list[TagRead]:
    return [tag_read(tag, counts.get(tag.id, 0)) for tag in sorted(post.tags, key=lambda t: t.name)]


def post_summary(post: Any, counts: dict[uuid.UUID, int]) -> PostSummaryRead:
    return PostSummaryRead(
        id=post.id,
        slug=post.slug,
        title=post.title,
        excerpt=post.excerpt,
        cover=media_read(post.cover),
        tags=_tags(post, counts),
        published_at=post.published_at,
        updated_at=post.updated_at,
        reading_time_minutes=post.reading_time_minutes,
        featured=post.featured,
        publish_status=post.publish_status,
        type=post.type,
        seo=seo_read(post),
    )


def post_read(post: Any, counts: dict[uuid.UUID, int]) -> PostRead:
    summary = post_summary(post, counts)
    return PostRead(
        **summary.model_dump(),
        content_md=post.content_md,
        author=author_read(post.author),
    )


def admin_post(post: Any, counts: dict[uuid.UUID, int]) -> AdminPost:
    return AdminPost(
        **post_read(post, counts).model_dump(),
        cover_media_id=post.cover_media_id,
        tag_ids=[tag.id for tag in post.tags],
        og_image_id=post.og_media_id,
        scheduled_at=post.scheduled_at,
        created_at=post.created_at,
    )


def project_summary(project: Any, counts: dict[uuid.UUID, int]) -> ProjectSummaryRead:
    return ProjectSummaryRead(
        id=project.id,
        slug=project.slug,
        title=project.title,
        summary=project.summary,
        cover=media_read(project.cover),
        stack=list(project.stack or []),
        year=project.year,
        updated_at=project.updated_at,
        publish_status=project.publish_status,
        lifecycle_status=project.lifecycle_status,
        featured=project.featured,
        repo_url=project.repo_url,
        demo_url=project.demo_url,
        sort_order=project.sort_order,
        seo=seo_read(project),
    )


def project_read(project: Any) -> ProjectRead:
    summary = project_summary(project, {})
    return ProjectRead(
        **summary.model_dump(),
        case_study_md=project.case_study_md,
        gallery=[
            media_read(item.media) for item in project.gallery_items if item.media is not None
        ],
        github=None,
        role=project.role,
        team=list(project.team or []),
        learnings=list(project.learnings or []),
    )


def admin_project(project: Any) -> AdminProject:
    full = project_read(project)
    return AdminProject(
        **full.model_dump(),
        cover_media_id=project.cover_media_id,
        og_image_id=project.og_media_id,
        gallery_media_ids=[item.media_id for item in project.gallery_items],
        github_repo=project.github_repo,
        created_at=project.created_at,
    )


async def ensure_media_exists(session: AsyncSession, media_id: uuid.UUID | None) -> Media | None:
    if media_id is None:
        return None
    media = await session.get(Media, media_id)
    if media is None:
        raise ProblemException(
            status=422,
            title="Validation error",
            detail="La media indicada no existe.",
            type_slug="validation",
        )
    return media
