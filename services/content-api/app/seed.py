from __future__ import annotations

import asyncio
import json
import shutil
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import SessionLocal, engine
from app.models import (
    LandingSection,
    Media,
    Post,
    Project,
    ProjectMedia,
    SiteSetting,
    Tag,
    User,
)
from ryoko_common.security import hash_password, verify_password
from ryoko_common.time import utc_now

SEED_FILE = Path(__file__).parent / "seed_data.json"
ASSET_DIR = Path(__file__).parent.parent / "seed" / "assets"
DEFAULT_ADMIN_EMAIL = "hola@ryuheirg.dev"
DEFAULT_ADMIN_PASSWORD = "ryoko-dev-password"
DEFAULT_ADMIN_NAME = "Ricardo Reyes Gómez"
DEFAULT_ADMIN_ALIAS = "Ryoko"
DEFAULT_ADMIN_BIO = "Estudiante de ITID en UPChiapas. Full stack con enfoque en seguridad."
DEFAULT_ADMIN_GITHUB = "https://github.com/RyuheiRG"
DEFAULT_ADMIN_LINKEDIN = "https://www.linkedin.com/in/ryuhei-rg/"

MEDIA_ORIGIN = "https://media.ryuheirg.dev"


def _rewrite(value: Any, base_url: str) -> Any:
    if isinstance(value, str) and value.startswith(MEDIA_ORIGIN):
        return base_url + value[len(MEDIA_ORIGIN) :]
    if isinstance(value, list):
        return [_rewrite(item, base_url) for item in value]
    if isinstance(value, dict):
        return {key: _rewrite(item, base_url) for key, item in value.items()}
    return value


def _dt(value: str | None) -> datetime | None:
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _uuid(value: str) -> uuid.UUID:
    return uuid.UUID(str(value))


def _prepare_local_media() -> None:
    if settings.media_storage != "local":
        return
    target = Path(settings.media_dir) / "mock"
    target.mkdir(parents=True, exist_ok=True)
    for name in ("portrait.jpeg", "secureup.png", "vaca-cubica.png"):
        source = ASSET_DIR / name
        if source.exists():
            shutil.copyfile(source, target / name)


def _media_from_payload(payload: dict[str, Any]) -> Media:
    return Media(
        id=_uuid(payload["id"]),
        url=payload["url"],
        storage_key=f"mock/{Path(payload['url']).name}",
        width=int(payload["width"]),
        height=int(payload["height"]),
        mime_type=payload["mime_type"],
        size_bytes=int(payload["size_bytes"]),
        alt=payload["alt"],
        blurhash=payload.get("blurhash"),
        variants=[],
        created_at=_dt(payload.get("created_at")) or utc_now(),
    )


async def _seed_user(session: AsyncSession, author: dict[str, Any], portrait_id: str) -> User:
    user_id = _uuid(author["id"])
    email = (settings.seed_admin_email or DEFAULT_ADMIN_EMAIL).strip().lower()
    user = await session.get(User, user_id)
    if user is None:
        existing = (
            await session.execute(select(User).where(User.email == email))
        ).scalar_one_or_none()
        user = existing or User(id=user_id)
        if existing is None:
            session.add(user)
    user.email = email
    user.role = "admin"
    user.display_name = settings.seed_admin_name or DEFAULT_ADMIN_NAME
    user.alias = settings.seed_admin_alias or DEFAULT_ADMIN_ALIAS
    user.avatar_media_id = _uuid(portrait_id)
    user.bio = DEFAULT_ADMIN_BIO
    user.github_url = DEFAULT_ADMIN_GITHUB
    user.linkedin_url = DEFAULT_ADMIN_LINKEDIN

    configured = (
        settings.seed_admin_password.get_secret_value()
        if settings.seed_admin_password
        else DEFAULT_ADMIN_PASSWORD
    )
    if not user.password_hash or not verify_password(configured, user.password_hash):
        user.password_hash = hash_password(configured)
    return user


async def seed(session: AsyncSession) -> dict[str, int]:
    payload = _rewrite(
        json.loads(SEED_FILE.read_text(encoding="utf-8")),
        settings.media_public_base_url.rstrip("/"),
    )
    _prepare_local_media()

    media_ids: dict[str, str] = {}
    for key in ("portrait", "secureup", "vacaCubica"):
        item = payload["media"][key]
        media_ids[key] = item["id"]
        await session.merge(_media_from_payload(item))
    await session.flush()

    tags: dict[str, Tag] = {}
    for item in payload["tags"]:
        tag = await session.merge(
            Tag(
                id=_uuid(item["id"]),
                slug=item["slug"],
                name=item["name"],
                description=item.get("description"),
            )
        )
        tags[tag.slug] = tag
    await session.flush()

    user = await _seed_user(session, payload["media"]["author"], media_ids["portrait"])
    await session.flush()

    posts_count = 0
    for item in payload["posts"]:
        created = _dt(item.get("published_at")) or _dt(item["updated_at"]) or utc_now()
        post = Post(
            id=_uuid(item["id"]),
            slug=item["slug"],
            title=item["title"],
            excerpt=item["excerpt"],
            content_md=item["content_md"],
            cover_media_id=None,
            publish_status=item["publish_status"],
            type=item["type"],
            featured=bool(item["featured"]),
            published_at=_dt(item.get("published_at")),
            scheduled_at=None,
            reading_time_minutes=int(item["reading_time_minutes"]),
            author_id=user.id,
            seo_title=(item.get("seo") or {}).get("title"),
            seo_description=(item.get("seo") or {}).get("description"),
            og_media_id=None,
            canonical_url=(item.get("seo") or {}).get("canonical_url"),
            noindex=bool((item.get("seo") or {}).get("noindex", False)),
            created_at=created,
            updated_at=_dt(item["updated_at"]) or created,
        )
        merged = await session.merge(post)
        merged.tags = [tags[tag["slug"]] for tag in item["tags"]]
        await session.flush()
        posts_count += 1

    projects_count = 0
    for item in payload["projects"]:
        cover_id = item.get("cover", {}).get("id") if item.get("cover") else None
        project = Project(
            id=_uuid(item["id"]),
            slug=item["slug"],
            title=item["title"],
            summary=item["summary"],
            case_study_md=item["case_study_md"],
            cover_media_id=_uuid(cover_id) if cover_id else None,
            stack=list(item.get("stack", [])),
            year=int(item["year"]),
            publish_status=item["publish_status"],
            lifecycle_status=item["lifecycle_status"],
            featured=bool(item["featured"]),
            sort_order=int(item["sort_order"]),
            repo_url=item.get("repo_url"),
            demo_url=item.get("demo_url"),
            github_repo=None,
            role=item.get("role"),
            team=list(item.get("team", [])),
            learnings=list(item.get("learnings", [])),
            seo_title=(item.get("seo") or {}).get("title"),
            seo_description=(item.get("seo") or {}).get("description"),
            og_media_id=None,
            canonical_url=(item.get("seo") or {}).get("canonical_url"),
            noindex=bool((item.get("seo") or {}).get("noindex", False)),
            published_at=_dt(item.get("updated_at")),
            created_at=_dt(item.get("updated_at")) or utc_now(),
            updated_at=_dt(item.get("updated_at")) or utc_now(),
        )
        await session.merge(project)
        await session.flush()
        await session.execute(delete(ProjectMedia).where(ProjectMedia.project_id == project.id))
        gallery = item.get("gallery") or []
        for index, media in enumerate(gallery):
            session.add(
                ProjectMedia(
                    project_id=project.id,
                    media_id=_uuid(media["id"]),
                    role="gallery",
                    sort_order=index,
                )
            )
        projects_count += 1
    await session.flush()

    landing = payload["landing"]
    sections = {
        "hero": landing["hero"],
        "about": landing["about"],
        "stack": landing["stack"],
        "certifications": landing["certifications"],
        "contact": landing["contact"],
    }
    for key, content in sections.items():
        await session.merge(LandingSection(key=key, content_json=content))
    await session.merge(SiteSetting(id=1, content_json=payload["site"]))
    await session.commit()

    return {
        "media": 3,
        "tags": len(tags),
        "posts": posts_count,
        "projects": projects_count,
        "landing_sections": len(sections),
        "site_settings": 1,
        "users": 1,
    }


async def main() -> None:
    async with SessionLocal() as session:
        summary = await seed(session)
    await engine.dispose()
    print("Seed completado: " + ", ".join(f"{key}={value}" for key, value in summary.items()))


if __name__ == "__main__":
    asyncio.run(main())
