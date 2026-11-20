from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query

from app.deps import DbSession, require_public_token
from app.services import public as public_service
from app.services import taxonomy as taxonomy_service
from ryoko_common.pagination import PageMeta

health_router = APIRouter(prefix="/v1/public", tags=["public"])

router = APIRouter(
    prefix="/v1/public",
    tags=["public"],
    dependencies=[Depends(require_public_token)],
)


@health_router.get("/health")
async def public_health() -> dict[str, Any]:
    return {"data": {"status": "ok"}}


@router.get("/site")
async def site(session: DbSession) -> dict[str, Any]:
    settings_doc = await taxonomy_service.get_settings(session)
    return {"data": settings_doc.model_dump(mode="json")}


@router.get("/landing")
async def landing(session: DbSession) -> dict[str, Any]:
    document = await taxonomy_service.get_landing(session)
    return {"data": document.model_dump(mode="json")}


@router.get("/posts")
async def posts(
    session: DbSession,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    tag: str | None = None,
    featured: bool | None = None,
    q: str | None = None,
    sort: str = "-published_at",
) -> dict[str, Any]:
    items, meta = await public_service.list_public_posts(
        session, page=page, limit=limit, tag=tag, featured=featured, q=q, sort=sort
    )
    return {
        "data": [item.model_dump(mode="json") for item in items],
        "meta": _meta(meta),
    }


@router.get("/posts/{slug}/related")
async def related(
    slug: str,
    session: DbSession,
    limit: Annotated[int, Query(ge=1, le=6)] = 3,
) -> dict[str, Any]:
    items = await public_service.related_posts(session, slug, limit)
    return {"data": [item.model_dump(mode="json") for item in items]}


@router.get("/posts/{slug}")
async def post(slug: str, session: DbSession) -> dict[str, Any]:
    item = await public_service.get_public_post(session, slug)
    return {"data": item.model_dump(mode="json")}


@router.get("/projects")
async def projects(
    session: DbSession,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    featured: bool | None = None,
    stack: str | None = None,
    sort: str = "sort_order",
) -> dict[str, Any]:
    items, meta = await public_service.list_public_projects(
        session, page=page, limit=limit, featured=featured, stack=stack, sort=sort
    )
    return {
        "data": [item.model_dump(mode="json") for item in items],
        "meta": _meta(meta),
    }


@router.get("/projects/{slug}")
async def project(slug: str, session: DbSession) -> dict[str, Any]:
    item = await public_service.get_public_project(session, slug)
    return {"data": item.model_dump(mode="json")}


@router.get("/tags")
async def tags(session: DbSession) -> dict[str, Any]:
    items = await public_service.list_public_tags(session)
    return {"data": [item.model_dump(mode="json") for item in items]}


@router.get("/tags/{slug}")
async def tag(slug: str, session: DbSession) -> dict[str, Any]:
    tag_item, posts_list = await public_service.get_public_tag(session, slug)
    return {
        "data": {
            "tag": tag_item.model_dump(mode="json"),
            "posts": [item.model_dump(mode="json") for item in posts_list],
        }
    }


@router.get("/redirects")
async def redirects(session: DbSession) -> dict[str, Any]:
    items = await public_service.list_public_redirects(session)
    return {"data": [item.model_dump(mode="json") for item in items]}


def _meta(meta: PageMeta) -> dict[str, int | bool]:
    return meta.as_dict()
