from __future__ import annotations

import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Query, status

from app.deps import CurrentUser, DbSession
from app.schemas import AdminProject, GalleryInput, ProjectCreate, ProjectUpdate
from app.services import projects as project_service

router = APIRouter(prefix="/v1/admin/projects", tags=["admin:projects"])


def _with_event(project: AdminProject, event_id: uuid.UUID | None) -> dict[str, Any]:
    payload = project.model_dump(mode="json")
    if event_id is not None:
        payload["webhook_event_id"] = str(event_id)
    return {"data": payload}


@router.get("")
async def list_projects(
    session: DbSession,
    _user: CurrentUser,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    publish_status: str | None = None,
    lifecycle_status: str | None = None,
    featured: bool | None = None,
    sort: str = "sort_order",
) -> dict[str, Any]:
    projects, meta = await project_service.list_projects(
        session,
        page=page,
        limit=limit,
        publish_status=publish_status,
        lifecycle_status=lifecycle_status,
        featured=featured,
        sort=sort,
    )
    return {
        "data": [project.model_dump(mode="json") for project in projects],
        "meta": meta.as_dict(),
    }


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_project(
    payload: ProjectCreate, session: DbSession, user: CurrentUser
) -> dict[str, Any]:
    project, event_id = await project_service.create_project(session, payload, user)
    return _with_event(project, event_id)


@router.get("/{project_id}")
async def get_project(
    project_id: uuid.UUID, session: DbSession, _user: CurrentUser
) -> dict[str, Any]:
    project = await project_service.get_admin_project(session, project_id)
    return {"data": project.model_dump(mode="json")}


@router.patch("/{project_id}")
async def update_project(
    project_id: uuid.UUID, payload: ProjectUpdate, session: DbSession, user: CurrentUser
) -> dict[str, Any]:
    project, event_id = await project_service.update_project(session, project_id, payload, user)
    return _with_event(project, event_id)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def archive_project(project_id: uuid.UUID, session: DbSession, user: CurrentUser) -> None:
    await project_service.archive_project(session, project_id, user)


@router.post("/{project_id}/publish")
async def publish_project(
    project_id: uuid.UUID, session: DbSession, user: CurrentUser
) -> dict[str, Any]:
    project, event_id = await project_service.publish_project(session, project_id, user)
    return _with_event(project, event_id)


@router.post("/{project_id}/unpublish")
async def unpublish_project(
    project_id: uuid.UUID, session: DbSession, user: CurrentUser
) -> dict[str, Any]:
    project = await project_service.unpublish_project(session, project_id, user)
    return {"data": project.model_dump(mode="json")}


@router.put("/{project_id}/gallery")
async def replace_gallery(
    project_id: uuid.UUID, payload: GalleryInput, session: DbSession, user: CurrentUser
) -> dict[str, Any]:
    project = await project_service.replace_gallery(session, project_id, payload.media_ids, user)
    return {"data": project.model_dump(mode="json")}
