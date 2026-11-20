from __future__ import annotations

import uuid
from typing import Any
from urllib.parse import urljoin

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.models import Media, Project, ProjectMedia, User
from app.schemas import (
    AdminProject,
    ProjectCreate,
    ProjectUpdate,
    PublishStatus,
)
from app.serializers import admin_project, ensure_media_exists, slugify
from app.webhooks import emit_event
from ryoko_common.errors import ProblemException, ProblemField
from ryoko_common.pagination import page_meta
from ryoko_common.time import iso_utc, utc_now


async def _load_project(session: AsyncSession, project_id: uuid.UUID) -> Project:
    project = (
        await session.execute(
            select(Project)
            .where(Project.id == project_id)
            .options(selectinload(Project.gallery_items).joinedload(ProjectMedia.media))
        )
    ).scalar_one_or_none()
    if project is None:
        raise ProblemException(status=404, title="Not found", detail="Proyecto no encontrado.")
    return project


async def _unique_slug(
    session: AsyncSession, base: str, *, exclude_id: uuid.UUID | None = None
) -> str:
    root = slugify(base)
    candidate = root
    index = 2
    while True:
        stmt = select(Project.id).where(Project.slug == candidate)
        if exclude_id is not None:
            stmt = stmt.where(Project.id != exclude_id)
        if await session.scalar(stmt) is None:
            return candidate
        candidate = f"{root}-{index}"
        index += 1


async def _resolve_gallery(session: AsyncSession, media_ids: list[uuid.UUID]) -> list[Media]:
    unique_ids = list(dict.fromkeys(media_ids))
    if not unique_ids:
        return []
    media = (await session.execute(select(Media).where(Media.id.in_(unique_ids)))).scalars().all()
    if len(media) != len(unique_ids):
        raise ProblemException(
            status=422,
            title="Validation error",
            detail="Una o más imágenes de la galería no existen.",
            type_slug="validation",
        )
    by_id = {item.id: item for item in media}
    return [by_id[media_id] for media_id in unique_ids]


def _set_gallery(project: Project, media: list[Media]) -> None:
    project.gallery_items = [
        ProjectMedia(
            project_id=project.id, media_id=item.id, media=item, role="gallery", sort_order=index
        )
        for index, item in enumerate(media)
    ]


def _validate_for_publish(project: Project) -> None:
    errors: list[ProblemField] = []
    if not project.title.strip():
        errors.append(
            ProblemField(field="title", code="required", message="El título es obligatorio.")
        )
    if not project.summary.strip():
        errors.append(
            ProblemField(field="summary", code="required", message="El summary es obligatorio.")
        )
    if not project.case_study_md.strip():
        errors.append(
            ProblemField(
                field="case_study_md", code="required", message="El case study es obligatorio."
            )
        )
    if errors:
        raise ProblemException(
            status=422,
            title="Validation error",
            detail="El proyecto no cumple los requisitos para publicarse.",
            type_slug="validation",
            errors=errors,
        )


def _event_data(project: Project, *, include_updated: bool) -> dict[str, Any]:
    data: dict[str, Any] = {
        "project_id": str(project.id),
        "slug": project.slug,
        "publish_status": project.publish_status,
        "lifecycle_status": project.lifecycle_status,
        "url": urljoin(settings.public_site_url.rstrip("/") + "/", f"proyectos/{project.slug}"),
    }
    if include_updated:
        data["updated_at"] = iso_utc(project.updated_at)
    return data


async def list_projects(
    session: AsyncSession,
    *,
    page: int,
    limit: int,
    publish_status: str | None,
    lifecycle_status: str | None,
    featured: bool | None,
    sort: str,
) -> tuple[list[AdminProject], Any]:
    filters = []
    if publish_status:
        filters.append(Project.publish_status == publish_status)
    if lifecycle_status:
        filters.append(Project.lifecycle_status == lifecycle_status)
    if featured is not None:
        filters.append(Project.featured == featured)
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
    order_column = order_map.get(field, Project.sort_order)
    order_by = order_column.desc() if descending else order_column.asc()
    projects = (
        (
            await session.execute(
                select(Project)
                .where(*filters)
                .options(selectinload(Project.gallery_items).joinedload(ProjectMedia.media))
                .order_by(order_by)
                .offset((meta.page - 1) * limit)
                .limit(limit)
            )
        )
        .scalars()
        .unique()
        .all()
    )
    return [admin_project(project) for project in projects], meta


async def get_admin_project(session: AsyncSession, project_id: uuid.UUID) -> AdminProject:
    return admin_project(await _load_project(session, project_id))


async def create_project(
    session: AsyncSession, payload: ProjectCreate, user: User
) -> tuple[AdminProject, uuid.UUID | None]:
    slug = payload.slug or await _unique_slug(session, payload.title)
    if await session.scalar(select(Project.id).where(Project.slug == slug)) is not None:
        raise ProblemException(
            status=422,
            title="Validation error",
            detail="Ya existe un proyecto con ese slug.",
            type_slug="validation",
            errors=[ProblemField(field="slug", code="unique", message="Slug duplicado.")],
        )
    cover = await ensure_media_exists(session, payload.cover_media_id)
    await ensure_media_exists(session, payload.seo.og_image_id)
    gallery = await _resolve_gallery(session, payload.gallery_media_ids)
    project = Project(
        id=uuid.uuid4(),
        slug=slug,
        title=payload.title,
        summary=payload.summary,
        case_study_md=payload.case_study_md,
        cover_media_id=payload.cover_media_id,
        stack=payload.stack,
        year=payload.year,
        publish_status=payload.publish_status.value,
        lifecycle_status=payload.lifecycle_status.value,
        featured=payload.featured,
        repo_url=str(payload.repo_url) if payload.repo_url else None,
        demo_url=str(payload.demo_url) if payload.demo_url else None,
        github_repo=payload.github_repo,
        sort_order=payload.sort_order,
        role=payload.role,
        team=payload.team,
        learnings=payload.learnings,
        seo_title=payload.seo.title,
        seo_description=payload.seo.description,
        og_media_id=payload.seo.og_image_id,
        canonical_url=str(payload.seo.canonical_url) if payload.seo.canonical_url else None,
        noindex=payload.seo.noindex,
    )
    project.cover = cover
    _set_gallery(project, gallery)
    if payload.publish_status == PublishStatus.published:
        _validate_for_publish(project)
        project.published_at = utc_now()
    session.add(project)
    await session.commit()
    project = await _load_project(session, project.id)
    event_id = None
    if project.publish_status == "published":
        event_id = await emit_event(
            "project.published", _event_data(project, include_updated=False), user.id
        )
    return admin_project(project), event_id


async def update_project(
    session: AsyncSession, project_id: uuid.UUID, payload: ProjectUpdate, user: User
) -> tuple[AdminProject, uuid.UUID | None]:
    project = await _load_project(session, project_id)
    was_published = project.publish_status == "published"
    old_slug = project.slug
    fields = payload.model_fields_set

    scalar_fields = (
        "title",
        "summary",
        "case_study_md",
        "stack",
        "year",
        "featured",
        "sort_order",
        "role",
        "team",
        "learnings",
        "github_repo",
    )
    for field in scalar_fields:
        if field in fields and getattr(payload, field) is not None:
            setattr(project, field, getattr(payload, field))
    if "slug" in fields and payload.slug is not None and payload.slug != project.slug:
        if await session.scalar(
            select(Project.id).where(Project.slug == payload.slug, Project.id != project.id)
        ):
            raise ProblemException(
                status=422,
                title="Validation error",
                detail="Ya existe un proyecto con ese slug.",
                type_slug="validation",
                errors=[ProblemField(field="slug", code="unique", message="Slug duplicado.")],
            )
        project.slug = payload.slug
    if "lifecycle_status" in fields and payload.lifecycle_status is not None:
        project.lifecycle_status = payload.lifecycle_status.value
    if "repo_url" in fields:
        project.repo_url = str(payload.repo_url) if payload.repo_url else None
    if "demo_url" in fields:
        project.demo_url = str(payload.demo_url) if payload.demo_url else None
    if "cover_media_id" in fields:
        project.cover = await ensure_media_exists(session, payload.cover_media_id)
        project.cover_media_id = payload.cover_media_id
    if payload.seo is not None:
        seo_fields = payload.seo.model_fields_set
        if "title" in seo_fields:
            project.seo_title = payload.seo.title
        if "description" in seo_fields:
            project.seo_description = payload.seo.description
        if "og_image_id" in seo_fields:
            await ensure_media_exists(session, payload.seo.og_image_id)
            project.og_media_id = payload.seo.og_image_id
        if "canonical_url" in seo_fields:
            project.canonical_url = (
                str(payload.seo.canonical_url) if payload.seo.canonical_url else None
            )
        if "noindex" in seo_fields:
            project.noindex = bool(payload.seo.noindex)

    redirects_to_emit: list[tuple[str, str, int]] = []
    if was_published and project.slug != old_slug:
        from app.models import Redirect

        from_path = f"/proyectos/{old_slug}"
        to_path = f"/proyectos/{project.slug}"
        existing = await session.scalar(select(Redirect).where(Redirect.from_path == from_path))
        if existing is None:
            session.add(Redirect(from_path=from_path, to_path=to_path, status=301))
            redirects_to_emit.append((from_path, to_path, 301))

    await session.commit()
    project = await _load_project(session, project.id)
    event_id = None
    if was_published and project.publish_status == "published":
        event_id = await emit_event(
            "project.updated", _event_data(project, include_updated=True), user.id
        )
        for from_path, to_path, status in redirects_to_emit:
            await emit_event(
                "redirect.created",
                {"from_path": from_path, "to_path": to_path, "status": status},
                user.id,
            )
    return admin_project(project), event_id


async def replace_gallery(
    session: AsyncSession, project_id: uuid.UUID, media_ids: list[uuid.UUID], user: User
) -> AdminProject:
    project = await _load_project(session, project_id)
    media = await _resolve_gallery(session, media_ids)
    _set_gallery(project, media)
    await session.commit()
    project = await _load_project(session, project.id)
    if project.publish_status == "published":
        await emit_event("project.updated", _event_data(project, include_updated=True), user.id)
    return admin_project(project)


async def publish_project(
    session: AsyncSession, project_id: uuid.UUID, user: User
) -> tuple[AdminProject, uuid.UUID]:
    project = await _load_project(session, project_id)
    _validate_for_publish(project)
    project.publish_status = "published"
    project.published_at = project.published_at or utc_now()
    await session.commit()
    project = await _load_project(session, project.id)
    event_id = await emit_event(
        "project.published", _event_data(project, include_updated=False), user.id
    )
    return admin_project(project), event_id


async def unpublish_project(
    session: AsyncSession, project_id: uuid.UUID, user: User
) -> AdminProject:
    project = await _load_project(session, project_id)
    was_published = project.publish_status == "published"
    project.publish_status = "draft"
    await session.commit()
    project = await _load_project(session, project.id)
    if was_published:
        await emit_event(
            "project.unpublished", _event_data(project, include_updated=False), user.id
        )
    return admin_project(project)


async def archive_project(session: AsyncSession, project_id: uuid.UUID, user: User) -> None:
    project = await _load_project(session, project_id)
    was_published = project.publish_status == "published"
    project.publish_status = "archived"
    await session.commit()
    if was_published:
        await emit_event(
            "project.unpublished", _event_data(project, include_updated=False), user.id
        )
