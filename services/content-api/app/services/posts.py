from __future__ import annotations

import uuid
from datetime import timedelta
from typing import Any
from urllib.parse import urljoin

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.models import Post, Tag, User
from app.schemas import (
    AdminPost,
    PostCreate,
    PostUpdate,
    PublishStatus,
    SeoInput,
    SeoUpdate,
)
from app.serializers import (
    admin_post,
    ensure_media_exists,
    reading_time,
    slugify,
    tag_counts,
)
from app.webhooks import emit_event
from ryoko_common.errors import ProblemException, ProblemField
from ryoko_common.pagination import page_meta
from ryoko_common.security import create_signed_token
from ryoko_common.time import iso_utc, utc_now


async def _load_post(session: AsyncSession, post_id: uuid.UUID) -> Post:
    post = (
        await session.execute(
            select(Post).where(Post.id == post_id).options(selectinload(Post.tags))
        )
    ).scalar_one_or_none()
    if post is None:
        raise ProblemException(status=404, title="Not found", detail="Post no encontrado.")
    return post


async def _unique_slug(
    session: AsyncSession, base: str, *, exclude_id: uuid.UUID | None = None
) -> str:
    root = slugify(base)
    candidate = root
    index = 2
    while True:
        stmt = select(Post.id).where(Post.slug == candidate)
        if exclude_id is not None:
            stmt = stmt.where(Post.id != exclude_id)
        if await session.scalar(stmt) is None:
            return candidate
        candidate = f"{root}-{index}"
        index += 1


async def _resolve_tags(session: AsyncSession, tag_ids: list[uuid.UUID]) -> list[Tag]:
    unique_ids = list(dict.fromkeys(tag_ids))
    if not unique_ids:
        return []
    tags = (await session.execute(select(Tag).where(Tag.id.in_(unique_ids)))).scalars().all()
    if len(tags) != len(unique_ids):
        raise ProblemException(
            status=422,
            title="Validation error",
            detail="Uno o más tags no existen.",
            type_slug="validation",
            errors=[ProblemField(field="tag_ids", code="not_found", message="Tag inexistente.")],
        )
    return list(tags)


async def _apply_create_seo(post: Post, seo: SeoInput) -> None:
    post.seo_title = seo.title
    post.seo_description = seo.description
    post.og_media_id = seo.og_image_id
    post.canonical_url = str(seo.canonical_url) if seo.canonical_url else None
    post.noindex = seo.noindex


async def _apply_update_seo(session: AsyncSession, post: Post, seo: SeoUpdate) -> None:
    fields = seo.model_fields_set
    if "title" in fields:
        post.seo_title = seo.title
    if "description" in fields:
        post.seo_description = seo.description
    if "og_image_id" in fields:
        await ensure_media_exists(session, seo.og_image_id)
        post.og_media_id = seo.og_image_id
    if "canonical_url" in fields:
        post.canonical_url = str(seo.canonical_url) if seo.canonical_url else None
    if "noindex" in fields:
        post.noindex = bool(seo.noindex)


def _validate_for_publish(post: Post) -> None:
    missing: list[ProblemField] = []
    if not post.title.strip():
        missing.append(
            ProblemField(field="title", code="required", message="El título es obligatorio.")
        )
    if not post.slug.strip():
        missing.append(
            ProblemField(field="slug", code="required", message="El slug es obligatorio.")
        )
    if not post.excerpt.strip():
        missing.append(
            ProblemField(field="excerpt", code="required", message="El excerpt es obligatorio.")
        )
    if not post.content_md.strip():
        missing.append(
            ProblemField(
                field="content_md", code="required", message="El contenido es obligatorio."
            )
        )
    if missing:
        raise ProblemException(
            status=422,
            title="Validation error",
            detail="El post no cumple los requisitos para publicarse.",
            type_slug="validation",
            errors=missing,
        )


def _post_event_data(post: Post, *, include_updated: bool) -> dict[str, Any]:
    data: dict[str, Any] = {
        "post_id": str(post.id),
        "slug": post.slug,
        "publish_status": post.publish_status,
        "url": urljoin(settings.public_site_url.rstrip("/") + "/", f"blog/{post.slug}"),
    }
    if include_updated:
        data["updated_at"] = iso_utc(post.updated_at)
    elif post.published_at is not None:
        data["published_at"] = iso_utc(post.published_at)
    return data


async def list_posts(
    session: AsyncSession,
    *,
    page: int,
    limit: int,
    publish_status: str | None,
    q: str | None,
    tag: str | None,
    sort: str,
) -> tuple[list[AdminPost], Any]:
    filters = []
    if publish_status:
        filters.append(Post.publish_status == publish_status)
    if q:
        filters.append(Post.title.ilike(f"%{q}%"))
    if tag:
        filters.append(Post.tags.any(Tag.slug == tag))

    total = int(await session.scalar(select(func.count(Post.id)).where(*filters)) or 0)
    meta = page_meta(page=page, limit=limit, total=total)
    order_map = {
        "published_at": Post.published_at,
        "updated_at": Post.updated_at,
        "title": Post.title,
        "created_at": Post.created_at,
    }
    descending = sort.startswith("-")
    field = sort.lstrip("-")
    order_column = order_map.get(field, Post.updated_at)
    order_by = order_column.desc() if descending else order_column.asc()

    posts = (
        (
            await session.execute(
                select(Post)
                .where(*filters)
                .options(selectinload(Post.tags))
                .order_by(order_by)
                .offset((meta.page - 1) * limit)
                .limit(limit)
            )
        )
        .scalars()
        .unique()
        .all()
    )
    counts = await tag_counts(session, published_only=False)
    return [admin_post(post, counts) for post in posts], meta


async def get_admin_post(session: AsyncSession, post_id: uuid.UUID) -> AdminPost:
    post = await _load_post(session, post_id)
    counts = await tag_counts(session, published_only=False)
    return admin_post(post, counts)


async def create_post(
    session: AsyncSession, payload: PostCreate, user: User
) -> tuple[AdminPost, uuid.UUID | None]:
    slug = payload.slug or await _unique_slug(session, payload.title)
    if await session.scalar(select(Post.id).where(Post.slug == slug)) is not None:
        raise ProblemException(
            status=422,
            title="Validation error",
            detail="Ya existe un post con ese slug.",
            type_slug="validation",
            errors=[ProblemField(field="slug", code="unique", message="Slug duplicado.")],
        )
    cover = await ensure_media_exists(session, payload.cover_media_id)
    await ensure_media_exists(session, payload.seo.og_image_id)
    tags = await _resolve_tags(session, payload.tag_ids)
    post = Post(
        slug=slug,
        title=payload.title,
        excerpt=payload.excerpt,
        content_md=payload.content_md,
        cover_media_id=payload.cover_media_id,
        publish_status=payload.publish_status.value,
        type=payload.type.value,
        featured=payload.featured,
        scheduled_at=payload.scheduled_at,
        reading_time_minutes=reading_time(payload.content_md),
        author_id=user.id,
    )
    post.author = user
    post.cover = cover
    post.tags = tags
    await _apply_create_seo(post, payload.seo)
    if payload.publish_status == PublishStatus.published:
        _validate_for_publish(post)
        post.published_at = utc_now()

    session.add(post)
    await session.commit()
    post = await _load_post(session, post.id)
    counts = await tag_counts(session, published_only=False)
    event_id = None
    if post.publish_status == "published":
        event_id = await emit_event(
            "post.published", _post_event_data(post, include_updated=False), user.id
        )
    return admin_post(post, counts), event_id


async def update_post(
    session: AsyncSession, post_id: uuid.UUID, payload: PostUpdate, user: User
) -> tuple[AdminPost, uuid.UUID | None]:
    post = await _load_post(session, post_id)
    was_published = post.publish_status == "published"
    old_slug = post.slug
    fields = payload.model_fields_set

    if "title" in fields and payload.title is not None:
        post.title = payload.title
    if "slug" in fields and payload.slug is not None:
        if payload.slug != post.slug:
            if await session.scalar(
                select(Post.id).where(Post.slug == payload.slug, Post.id != post.id)
            ):
                raise ProblemException(
                    status=422,
                    title="Validation error",
                    detail="Ya existe un post con ese slug.",
                    type_slug="validation",
                    errors=[ProblemField(field="slug", code="unique", message="Slug duplicado.")],
                )
            post.slug = payload.slug
    if "excerpt" in fields and payload.excerpt is not None:
        post.excerpt = payload.excerpt
    if "content_md" in fields and payload.content_md is not None:
        post.content_md = payload.content_md
    if "type" in fields and payload.type is not None:
        post.type = payload.type.value
    if "featured" in fields and payload.featured is not None:
        post.featured = payload.featured
    if "cover_media_id" in fields:
        cover = await ensure_media_exists(session, payload.cover_media_id)
        post.cover_media_id = payload.cover_media_id
        post.cover = cover
    if "tag_ids" in fields and payload.tag_ids is not None:
        post.tags = await _resolve_tags(session, payload.tag_ids)
    if "scheduled_at" in fields:
        post.scheduled_at = payload.scheduled_at
    if payload.seo is not None:
        await _apply_update_seo(session, post, payload.seo)

    post.reading_time_minutes = reading_time(post.content_md)
    redirects_to_emit: list[tuple[str, str, int]] = []
    if was_published and post.slug != old_slug:
        from app.models import Redirect

        from_path = f"/blog/{old_slug}"
        to_path = f"/blog/{post.slug}"
        existing = await session.scalar(select(Redirect).where(Redirect.from_path == from_path))
        if existing is None:
            session.add(Redirect(from_path=from_path, to_path=to_path, status=301))
            redirects_to_emit.append((from_path, to_path, 301))

    await session.commit()
    post = await _load_post(session, post.id)
    counts = await tag_counts(session, published_only=False)
    event_id = None
    if was_published and post.publish_status == "published":
        event_id = await emit_event(
            "post.updated", _post_event_data(post, include_updated=True), user.id
        )
        for from_path, to_path, status in redirects_to_emit:
            await emit_event(
                "redirect.created",
                {"from_path": from_path, "to_path": to_path, "status": status},
                user.id,
            )
    return admin_post(post, counts), event_id


async def publish_post(
    session: AsyncSession, post_id: uuid.UUID, user: User, published_at: Any = None
) -> tuple[AdminPost, uuid.UUID]:
    post = await _load_post(session, post_id)
    _validate_for_publish(post)
    post.publish_status = PublishStatus.published.value
    if post.published_at is None:
        post.published_at = published_at or utc_now()
    post.scheduled_at = None
    await session.commit()
    post = await _load_post(session, post.id)
    counts = await tag_counts(session, published_only=False)
    event_id = await emit_event(
        "post.published", _post_event_data(post, include_updated=False), user.id
    )
    return admin_post(post, counts), event_id


async def unpublish_post(session: AsyncSession, post_id: uuid.UUID, user: User) -> AdminPost:
    post = await _load_post(session, post_id)
    was_published = post.publish_status == "published"
    post.publish_status = PublishStatus.draft.value
    post.scheduled_at = None
    await session.commit()
    post = await _load_post(session, post.id)
    if was_published:
        await emit_event("post.unpublished", _post_event_data(post, include_updated=False), user.id)
    counts = await tag_counts(session, published_only=False)
    return admin_post(post, counts)


async def archive_post(session: AsyncSession, post_id: uuid.UUID, user: User) -> None:
    post = await _load_post(session, post_id)
    was_published = post.publish_status == "published"
    post.publish_status = PublishStatus.archived.value
    await session.commit()
    if was_published:
        await emit_event("post.unpublished", _post_event_data(post, include_updated=False), user.id)


async def schedule_post(session: AsyncSession, post_id: uuid.UUID, scheduled_at: Any) -> AdminPost:
    post = await _load_post(session, post_id)
    if post.publish_status == "published":
        raise ProblemException(
            status=409,
            title="Conflict",
            detail="Un post publicado no se puede programar. Despublica primero.",
            type_slug="conflict",
        )
    if scheduled_at <= utc_now():
        raise ProblemException(
            status=422,
            title="Validation error",
            detail="scheduled_at debe estar en el futuro.",
            type_slug="validation",
        )
    _validate_for_publish(post)
    post.scheduled_at = scheduled_at
    await session.commit()
    post = await _load_post(session, post.id)
    counts = await tag_counts(session, published_only=False)
    return admin_post(post, counts)


async def cancel_schedule(session: AsyncSession, post_id: uuid.UUID) -> AdminPost:
    post = await _load_post(session, post_id)
    post.scheduled_at = None
    await session.commit()
    post = await _load_post(session, post.id)
    counts = await tag_counts(session, published_only=False)
    return admin_post(post, counts)


async def duplicate_post(session: AsyncSession, post_id: uuid.UUID, user: User) -> AdminPost:
    original = await _load_post(session, post_id)
    slug = await _unique_slug(session, f"{original.slug}-copia")
    copy = Post(
        slug=slug,
        title=f"{original.title} (copia)",
        excerpt=original.excerpt,
        content_md=original.content_md,
        cover_media_id=original.cover_media_id,
        publish_status=PublishStatus.draft.value,
        type=original.type,
        featured=False,
        reading_time_minutes=original.reading_time_minutes,
        author_id=user.id,
        seo_title=original.seo_title,
        seo_description=original.seo_description,
        og_media_id=original.og_media_id,
        canonical_url=original.canonical_url,
        noindex=original.noindex,
    )
    copy.author = user
    copy.cover = original.cover
    copy.tags = list(original.tags)
    session.add(copy)
    await session.commit()
    copy = await _load_post(session, copy.id)
    counts = await tag_counts(session, published_only=False)
    return admin_post(copy, counts)


def preview_url(post: Post) -> str:
    token = create_signed_token(
        settings,
        subject=str(post.id),
        role="editor",
        token_type="preview",
        expires_delta=timedelta(hours=24),
        extra={"slug": post.slug},
    )
    base = settings.preview_base_url.rstrip("/")
    return f"{base}/blog/{post.slug}?token={token}"


async def publish_scheduled_posts(session: AsyncSession) -> int:
    due = (
        (
            await session.execute(
                select(Post).where(
                    Post.publish_status == "draft",
                    Post.scheduled_at.is_not(None),
                    Post.scheduled_at <= utc_now(),
                )
            )
        )
        .scalars()
        .all()
    )
    count = 0
    for post in due:
        _validate_for_publish(post)
        post.publish_status = "published"
        post.published_at = utc_now()
        post.scheduled_at = None
        await session.commit()
        await emit_event(
            "post.published", _post_event_data(post, include_updated=False), "scheduler"
        )
        count += 1
    return count
