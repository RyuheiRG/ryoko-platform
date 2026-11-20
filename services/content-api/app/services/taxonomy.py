from __future__ import annotations

import uuid
from typing import Any

from pydantic import TypeAdapter
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    LandingSection,
    Redirect,
    SiteSetting,
    Tag,
    User,
    post_tags,
)
from app.schemas import (
    AboutSection,
    ContactSection,
    HeroSection,
    Landing,
    RedirectCreate,
    RedirectRead,
    SiteSettings,
    StackCategory,
)
from app.serializers import tag_counts, tag_read
from app.webhooks import emit_event
from ryoko_common.errors import ProblemException, ProblemField
from ryoko_common.time import utc_now


async def list_tags(session: AsyncSession, *, published_only: bool = False) -> list[Any]:
    tags = (await session.execute(select(Tag).order_by(Tag.name))).scalars().all()
    counts = await tag_counts(session, published_only=published_only)
    return [tag_read(tag, counts.get(tag.id, 0)) for tag in tags]


async def create_tag(
    session: AsyncSession, *, name: str, slug: str, description: str | None, actor: User
) -> Any:
    if await session.scalar(select(Tag.id).where(Tag.slug == slug)) is not None:
        raise ProblemException(
            status=422,
            title="Validation error",
            detail="Ya existe un tag con ese slug.",
            type_slug="validation",
            errors=[ProblemField(field="slug", code="unique", message="Slug duplicado.")],
        )
    tag = Tag(id=uuid.uuid4(), name=name, slug=slug, description=description)
    session.add(tag)
    await session.commit()
    await emit_event(
        "tag.created", {"tag_id": str(tag.id), "slug": tag.slug, "name": tag.name}, actor.id
    )
    return tag_read(tag, 0)


async def update_tag(
    session: AsyncSession,
    tag_id: uuid.UUID,
    *,
    name: str | None,
    slug: str | None,
    description: str | None,
    actor: User,
) -> Any:
    tag = await session.get(Tag, tag_id)
    if tag is None:
        raise ProblemException(status=404, title="Not found", detail="Tag no encontrado.")
    if slug is not None and slug != tag.slug:
        if (
            await session.scalar(select(Tag.id).where(Tag.slug == slug, Tag.id != tag.id))
            is not None
        ):
            raise ProblemException(
                status=422,
                title="Validation error",
                detail="Ya existe un tag con ese slug.",
                type_slug="validation",
            )
        tag.slug = slug
    if name is not None:
        tag.name = name
    if description is not None:
        tag.description = description
    await session.commit()
    counts = await tag_counts(session, published_only=False)
    await emit_event(
        "tag.updated", {"tag_id": str(tag.id), "slug": tag.slug, "name": tag.name}, actor.id
    )
    return tag_read(tag, counts.get(tag.id, 0))


async def delete_tag(session: AsyncSession, tag_id: uuid.UUID, actor: User) -> None:
    tag = await session.get(Tag, tag_id)
    if tag is None:
        raise ProblemException(status=404, title="Not found", detail="Tag no encontrado.")
    count = int(
        await session.scalar(
            select(func.count()).select_from(post_tags).where(post_tags.c.tag_id == tag_id)
        )
        or 0
    )
    if count > 0:
        raise ProblemException(
            status=409,
            title="Conflict",
            detail="No se puede eliminar un tag que aún tiene posts.",
            type_slug="conflict",
        )
    tag_data = {"tag_id": str(tag.id), "slug": tag.slug}
    await session.delete(tag)
    await session.commit()
    await emit_event("tag.deleted", tag_data, actor.id)


async def get_landing(session: AsyncSession) -> Landing:
    rows = (await session.execute(select(LandingSection))).scalars().all()
    by_key = {row.key: row.content_json for row in rows}
    missing = [
        key for key in ("hero", "about", "stack", "certifications", "contact") if key not in by_key
    ]
    if missing:
        raise ProblemException(
            status=503,
            title="Service unavailable",
            detail=f"La landing no está sembrada. Faltan secciones: {', '.join(missing)}.",
            type_slug="not-ready",
        )
    return Landing.model_validate(
        {
            "hero": by_key["hero"],
            "about": by_key["about"],
            "stack": by_key["stack"],
            "certifications": by_key["certifications"],
            "contact": by_key["contact"],
        }
    )


async def put_landing(session: AsyncSession, landing: Landing, actor: User) -> Landing:
    mapping = {
        "hero": landing.hero.model_dump(mode="json"),
        "about": landing.about.model_dump(mode="json"),
        "stack": [item.model_dump(mode="json") for item in landing.stack],
        "certifications": [item.model_dump(mode="json") for item in landing.certifications],
        "contact": landing.contact.model_dump(mode="json"),
    }
    for key, content in mapping.items():
        row = await session.get(LandingSection, key)
        if row is None:
            row = LandingSection(key=key, content_json=content)
            session.add(row)
        else:
            row.content_json = content
            row.updated_at = utc_now()
    await session.commit()
    await emit_event("landing.updated", {"sections": list(mapping.keys())}, actor.id)
    return await get_landing(session)


async def patch_landing_section(
    session: AsyncSession, section: str, payload: dict[str, Any], actor: User
) -> Landing:
    valid = {"hero", "about", "stack", "certifications", "contact"}
    if section not in valid:
        raise ProblemException(
            status=404,
            title="Not found",
            detail="Sección de landing desconocida.",
            type_slug="not-found",
        )
    if section == "stack":
        value = TypeAdapter(list[StackCategory]).validate_python(payload)
        content: Any = [item.model_dump(mode="json") for item in value]
    elif section == "certifications":
        from app.schemas import Certification

        certs = TypeAdapter(list[Certification]).validate_python(payload)
        content = [item.model_dump(mode="json") for item in certs]
    elif section == "hero":
        content = HeroSection.model_validate(payload).model_dump(mode="json")
    elif section == "about":
        content = AboutSection.model_validate(payload).model_dump(mode="json")
    else:
        content = ContactSection.model_validate(payload).model_dump(mode="json")

    row = await session.get(LandingSection, section)
    if row is None:
        row = LandingSection(key=section, content_json=content)
        session.add(row)
    else:
        row.content_json = content
        row.updated_at = utc_now()
    await session.commit()
    await emit_event("landing.updated", {"sections": [section]}, actor.id)
    return await get_landing(session)


async def get_settings(session: AsyncSession) -> SiteSettings:
    row = await session.get(SiteSetting, 1)
    if row is None:
        raise ProblemException(
            status=503,
            title="Service unavailable",
            detail="Los site settings no están sembrados.",
            type_slug="not-ready",
        )
    return SiteSettings.model_validate(row.content_json)


async def put_settings(
    session: AsyncSession, settings_doc: SiteSettings, actor: User
) -> SiteSettings:
    row = await session.get(SiteSetting, 1)
    content = settings_doc.model_dump(mode="json")
    if row is None:
        row = SiteSetting(id=1, content_json=content)
        session.add(row)
    else:
        row.content_json = content
        row.updated_at = utc_now()
    await session.commit()
    await emit_event("settings.updated", {"keys": list(content.keys())}, actor.id)
    return settings_doc


def _deep_merge(base: dict[str, Any], patch: dict[str, Any]) -> dict[str, Any]:
    merged = dict(base)
    for key, value in patch.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = _deep_merge(merged[key], value)
        else:
            merged[key] = value
    return merged


async def patch_settings(session: AsyncSession, patch: dict[str, Any], actor: User) -> SiteSettings:
    current = await get_settings(session)
    merged = _deep_merge(current.model_dump(mode="json"), patch)
    validated = SiteSettings.model_validate(merged)
    row = await session.get(SiteSetting, 1)
    assert row is not None
    row.content_json = validated.model_dump(mode="json")
    row.updated_at = utc_now()
    await session.commit()
    await emit_event("settings.updated", {"keys": list(patch.keys())}, actor.id)
    return validated


async def list_redirects(session: AsyncSession) -> list[RedirectRead]:
    rows = (
        (await session.execute(select(Redirect).order_by(Redirect.created_at.desc())))
        .scalars()
        .all()
    )
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


async def create_redirect(
    session: AsyncSession, payload: RedirectCreate, actor: User
) -> RedirectRead:
    if await session.scalar(select(Redirect.id).where(Redirect.from_path == payload.from_path)):
        raise ProblemException(
            status=422,
            title="Validation error",
            detail="Ya existe un redirect para esa ruta.",
            type_slug="validation",
            errors=[ProblemField(field="from_path", code="unique", message="Ruta duplicada.")],
        )
    by_url = Redirect(
        id=uuid.uuid4(),
        from_path=payload.from_path,
        to_path=payload.to_path,
        status=payload.status,
    )
    session.add(by_url)
    await session.commit()
    await emit_event(
        "redirect.created",
        {"from_path": by_url.from_path, "to_path": by_url.to_path, "status": by_url.status},
        actor.id,
    )
    return RedirectRead(
        id=by_url.id,
        from_path=by_url.from_path,
        to_path=by_url.to_path,
        status=by_url.status,
        created_at=by_url.created_at,
    )


async def delete_redirect(session: AsyncSession, redirect_id: uuid.UUID) -> None:
    row = await session.get(Redirect, redirect_id)
    if row is None:
        raise ProblemException(status=404, title="Not found", detail="Redirect no encontrado.")
    await session.delete(row)
    await session.commit()
