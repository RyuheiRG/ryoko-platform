from __future__ import annotations

import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Query, status
from pydantic import BaseModel

from app.deps import CurrentUser, DbSession
from app.schemas import AdminPost, PostCreate, PostUpdate, PublishInput, ScheduleInput
from app.services import posts as post_service

router = APIRouter(prefix="/v1/admin/posts", tags=["admin:posts"])


def _with_event(post: AdminPost, event_id: uuid.UUID | None) -> dict[str, Any]:
    payload = post.model_dump(mode="json")
    if event_id is not None:
        payload["webhook_event_id"] = str(event_id)
    return {"data": payload}


@router.get("")
async def list_posts(
    session: DbSession,
    _user: CurrentUser,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    publish_status: str | None = None,
    q: str | None = None,
    tag: str | None = None,
    sort: str = "-updated_at",
) -> dict[str, Any]:
    posts, meta = await post_service.list_posts(
        session,
        page=page,
        limit=limit,
        publish_status=publish_status,
        q=q,
        tag=tag,
        sort=sort,
    )
    return {"data": [post.model_dump(mode="json") for post in posts], "meta": meta.as_dict()}


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_post(payload: PostCreate, session: DbSession, user: CurrentUser) -> dict[str, Any]:
    post, event_id = await post_service.create_post(session, payload, user)
    return _with_event(post, event_id)


@router.get("/{post_id}")
async def get_post(post_id: uuid.UUID, session: DbSession, _user: CurrentUser) -> dict[str, Any]:
    post = await post_service.get_admin_post(session, post_id)
    return {"data": post.model_dump(mode="json")}


@router.patch("/{post_id}")
async def update_post(
    post_id: uuid.UUID, payload: PostUpdate, session: DbSession, user: CurrentUser
) -> dict[str, Any]:
    post, event_id = await post_service.update_post(session, post_id, payload, user)
    return _with_event(post, event_id)


@router.delete("/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
async def archive_post(post_id: uuid.UUID, session: DbSession, user: CurrentUser) -> None:
    await post_service.archive_post(session, post_id, user)


@router.post("/{post_id}/publish")
async def publish_post(
    post_id: uuid.UUID,
    session: DbSession,
    user: CurrentUser,
    payload: PublishInput | None = None,
) -> dict[str, Any]:
    published_at = payload.published_at if payload else None
    post, event_id = await post_service.publish_post(session, post_id, user, published_at)
    return _with_event(post, event_id)


@router.post("/{post_id}/unpublish")
async def unpublish_post(
    post_id: uuid.UUID, session: DbSession, user: CurrentUser
) -> dict[str, Any]:
    post = await post_service.unpublish_post(session, post_id, user)
    return {"data": post.model_dump(mode="json")}


@router.post("/{post_id}/schedule")
async def schedule_post(
    post_id: uuid.UUID, payload: ScheduleInput, session: DbSession, _user: CurrentUser
) -> dict[str, Any]:
    post = await post_service.schedule_post(session, post_id, payload.scheduled_at)
    return {"data": post.model_dump(mode="json")}


@router.delete("/{post_id}/schedule")
async def cancel_schedule(
    post_id: uuid.UUID, session: DbSession, _user: CurrentUser
) -> dict[str, Any]:
    post = await post_service.cancel_schedule(session, post_id)
    return {"data": post.model_dump(mode="json")}


@router.post("/{post_id}/duplicate", status_code=status.HTTP_201_CREATED)
async def duplicate_post(
    post_id: uuid.UUID, session: DbSession, user: CurrentUser
) -> dict[str, Any]:
    post = await post_service.duplicate_post(session, post_id, user)
    return {"data": post.model_dump(mode="json")}


class PreviewResponse(BaseModel):
    url: str
    expires_in: int


@router.get("/{post_id}/preview")
async def preview_post(
    post_id: uuid.UUID, session: DbSession, _user: CurrentUser
) -> dict[str, Any]:
    from app.services.posts import _load_post, preview_url

    post = await _load_post(session, post_id)
    return {"data": {"url": preview_url(post), "expires_in": 86400}}
