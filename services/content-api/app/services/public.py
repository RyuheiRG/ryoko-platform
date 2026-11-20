from __future__ import annotations

from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Post, Project, ProjectMedia, Redirect, Tag
from app.schemas import (
    PostRead,
    PostSummaryRead,
    ProjectRead,
    ProjectSummaryRead,
    RedirectRead,
    TagRead,
)
from app.serializers import (
    post_read,
    post_summary,
    project_read,
    project_summary,
    tag_counts,
    tag_read,
)
from ryoko_common.errors import ProblemException
from ryoko_common.pagination import PageMeta, page_meta


async def list_public_posts(
    session: AsyncSession,
    *,
    page: int,
    limit: int,
    tag: str | None,
    featured: bool | None,
    q: str | None,
    sort: str,
) -> tuple[list[PostSummaryRead], PageMeta]:
    filters: list[Any] = [Post.publish_status == "published"]
    if tag:
        filters.append(Post.tags.any(Tag.slug == tag))
    if featured is not None:
        filters.append(Post.featured.is_(featured))
    if q:
        filters.append(or_(Post.title.ilike(f"%{q}%"), Post.excerpt.ilike(f"%{q}%")))

    total = int(await session.scalar(select(func.count(Post.id)).where(*filters)) or 0)
    meta = page_meta(page=page, limit=limit, total=total)
    order_map = {
        "published_at": Post.published_at,
        "updated_at": Post.updated_at,
        "title": Post.title,
        "reading_time_minutes": Post.reading_time_minutes,
    }
    descending = sort.startswith("-")
    field = sort.lstrip("-")
    column = order_map.get(field, Post.published_at)
    order_by = column.desc() if descending else column.asc()
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
    counts = await tag_counts(session, published_only=True)
    return [post_summary(post, counts) for post in posts], meta


async def get_public_post(session: AsyncSession, slug: str) -> PostRead:
    post = (
        await session.execute(
            select(Post)
            .where(Post.slug == slug, Post.publish_status == "published")
            .options(selectinload(Post.tags))
        )
    ).scalar_one_or_none()
    if post is None:
        raise ProblemException(status=404, title="Not found", detail="Post no encontrado.")
    counts = await tag_counts(session, published_only=True)
    return post_read(post, counts)


async def related_posts(session: AsyncSession, slug: str, limit: int) -> list[PostSummaryRead]:
    post = (
        await session.execute(
            select(Post)
            .where(Post.slug == slug, Post.publish_status == "published")
            .options(selectinload(Post.tags))
        )
    ).scalar_one_or_none()
    if post is None:
        raise ProblemException(status=404, title="Not found", detail="Post no encontrado.")
    tag_ids = [tag.id for tag in post.tags]
    base = select(Post).where(Post.publish_status == "published", Post.slug != slug)
    if tag_ids:
        base = base.where(Post.tags.any(Tag.id.in_(tag_ids)))
    candidates = (
        (
            await session.execute(
                base.options(selectinload(Post.tags))
                .order_by(Post.published_at.desc())
                .limit(max(limit * 3, limit))
            )
        )
        .scalars()
        .unique()
        .all()
    )
    wanted = {tag.id for tag in post.tags}
    scored = sorted(
        candidates,
        key=lambda item: (
            -len(wanted.intersection({tag.id for tag in item.tags})),
            -(item.published_at.timestamp() if item.published_at else 0),
        ),
    )
    chosen = scored[:limit]
    if len(chosen) < limit:
        existing = {item.id for item in chosen} | {post.id}
        filler = (
            (
                await session.execute(
                    select(Post)
                    .where(Post.publish_status == "published", Post.id.not_in(existing))
                    .options(selectinload(Post.tags))
                    .order_by(Post.published_at.desc())
                    .limit(limit - len(chosen))
                )
            )
            .scalars()
            .unique()
            .all()
        )
        chosen.extend(filler)
    counts = await tag_counts(session, published_only=True)
    return [post_summary(item, counts) for item in chosen]


async def list_public_projects(
    session: AsyncSession,
    *,
    page: int,
    limit: int,
    featured: bool | None,
    stack: str | None,
    sort: str,
) -> tuple[list[ProjectSummaryRead], PageMeta]:
    filters: list[Any] = [Project.publish_status == "published"]
    if featured is not None:
        filters.append(Project.featured.is_(featured))
    if stack:
        filters.append(Project.stack.contains([stack]))
    total = int(await session.scalar(select(func.count(Project.id)).where(*filters)) or 0)
    meta = page_meta(page=page, limit=limit, total=total)
    order_map = {
        "sort_order": Project.sort_order,
        "year": Project.year,
        "updated_at": Project.updated_at,
        "title": Project.title,
    }
    descending = sort.startswith("-")
    field = sort.lstrip("-")
    column = order_map.get(field, Project.sort_order)
    order_by = column.desc() if descending else column.asc()
    projects = (
        (
            await session.execute(
                select(Project)
                .where(*filters)
                .order_by(order_by, Project.id)
                .offset((meta.page - 1) * limit)
                .limit(limit)
            )
        )
        .scalars()
        .all()
    )
    return [project_summary(project, {}) for project in projects], meta


async def get_public_project(session: AsyncSession, slug: str) -> ProjectRead:
    project = (
        await session.execute(
            select(Project)
            .where(Project.slug == slug, Project.publish_status == "published")
            .options(selectinload(Project.gallery_items).joinedload(ProjectMedia.media))
        )
    ).scalar_one_or_none()
    if project is None:
        raise ProblemException(status=404, title="Not found", detail="Proyecto no encontrado.")
    return project_read(project)


async def list_public_tags(session: AsyncSession) -> list[TagRead]:
    tags = (await session.execute(select(Tag).order_by(Tag.name))).scalars().all()
    counts = await tag_counts(session, published_only=True)
    return [tag_read(tag, counts.get(tag.id, 0)) for tag in tags if counts.get(tag.id, 0) > 0]


async def get_public_tag(session: AsyncSession, slug: str) -> tuple[TagRead, list[PostSummaryRead]]:
    tag = (await session.execute(select(Tag).where(Tag.slug == slug))).scalar_one_or_none()
    if tag is None:
        raise ProblemException(status=404, title="Not found", detail="Tag no encontrado.")
    posts = (
        (
            await session.execute(
                select(Post)
                .where(Post.publish_status == "published", Post.tags.any(Tag.slug == slug))
                .options(selectinload(Post.tags))
                .order_by(Post.published_at.desc())
            )
        )
        .scalars()
        .unique()
        .all()
    )
    counts = await tag_counts(session, published_only=True)
    if counts.get(tag.id, 0) <= 0:
        raise ProblemException(status=404, title="Not found", detail="Tag sin posts publicados.")
    return tag_read(tag, counts.get(tag.id, 0)), [post_summary(post, counts) for post in posts]


async def list_public_redirects(session: AsyncSession) -> list[RedirectRead]:
    rows = (await session.execute(select(Redirect).order_by(Redirect.created_at))).scalars().all()
    return [
        RedirectRead(
            id=row.id,
            from_path=row.from_path,
            to_path=row.to_path,
            status=row.status,
            created_at=row.created_at,
        )
        for row in rows
    ]
