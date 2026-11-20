from __future__ import annotations

import uuid
from typing import Annotated, Any

from fastapi import APIRouter, File, Form, Query, UploadFile, status
from sqlalchemy import select

from app.deps import CurrentUser, DbSession
from app.models import Document
from app.schemas import (
    DocumentKind,
    DocumentRead,
    Landing,
    MediaRead,
    MediaUpdate,
    RedirectCreate,
    SettingsPatch,
    SiteSettings,
    TagCreate,
    TagUpdate,
)
from app.services import media as media_service
from app.services import taxonomy as taxonomy_service
from ryoko_common.errors import ProblemException
from ryoko_common.pagination import page_meta

router = APIRouter(prefix="/v1/admin", tags=["admin:catalog"])


@router.get("/tags")
async def list_tags(session: DbSession, _user: CurrentUser) -> dict[str, Any]:
    tags = await taxonomy_service.list_tags(session, published_only=False)
    return {"data": [tag.model_dump(mode="json") for tag in tags]}


@router.post("/tags", status_code=status.HTTP_201_CREATED)
async def create_tag(payload: TagCreate, session: DbSession, user: CurrentUser) -> dict[str, Any]:
    tag = await taxonomy_service.create_tag(
        session,
        name=payload.name,
        slug=payload.slug,
        description=payload.description,
        actor=user,
    )
    return {"data": tag.model_dump(mode="json")}


@router.patch("/tags/{tag_id}")
async def update_tag(
    tag_id: uuid.UUID, payload: TagUpdate, session: DbSession, user: CurrentUser
) -> dict[str, Any]:
    tag = await taxonomy_service.update_tag(
        session,
        tag_id,
        name=payload.name,
        slug=payload.slug,
        description=payload.description,
        actor=user,
    )
    return {"data": tag.model_dump(mode="json")}


@router.delete("/tags/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tag(tag_id: uuid.UUID, session: DbSession, user: CurrentUser) -> None:
    await taxonomy_service.delete_tag(session, tag_id, user)


@router.get("/landing")
async def get_landing(session: DbSession, _user: CurrentUser) -> dict[str, Any]:
    landing = await taxonomy_service.get_landing(session)
    return {"data": landing.model_dump(mode="json")}


@router.put("/landing")
async def put_landing(payload: Landing, session: DbSession, user: CurrentUser) -> dict[str, Any]:
    landing = await taxonomy_service.put_landing(session, payload, user)
    return {"data": landing.model_dump(mode="json")}


@router.patch("/landing/{section}")
async def patch_landing(
    section: str, payload: dict[str, Any], session: DbSession, user: CurrentUser
) -> dict[str, Any]:
    landing = await taxonomy_service.patch_landing_section(session, section, payload, user)
    return {"data": landing.model_dump(mode="json")}


@router.get("/settings")
async def get_settings(session: DbSession, _user: CurrentUser) -> dict[str, Any]:
    settings_doc = await taxonomy_service.get_settings(session)
    return {"data": settings_doc.model_dump(mode="json")}


@router.put("/settings")
async def put_settings(
    payload: SiteSettings, session: DbSession, user: CurrentUser
) -> dict[str, Any]:
    settings_doc = await taxonomy_service.put_settings(session, payload, user)
    return {"data": settings_doc.model_dump(mode="json")}


@router.patch("/settings")
async def patch_settings(
    payload: SettingsPatch, session: DbSession, user: CurrentUser
) -> dict[str, Any]:
    patch = payload.model_dump(exclude_unset=True)
    settings_doc = await taxonomy_service.patch_settings(session, patch, user)
    return {"data": settings_doc.model_dump(mode="json")}


@router.get("/redirects")
async def list_redirects(session: DbSession, _user: CurrentUser) -> dict[str, Any]:
    redirects = await taxonomy_service.list_redirects(session)
    return {"data": [item.model_dump(mode="json") for item in redirects]}


@router.post("/redirects", status_code=status.HTTP_201_CREATED)
async def create_redirect(
    payload: RedirectCreate, session: DbSession, user: CurrentUser
) -> dict[str, Any]:
    redirect = await taxonomy_service.create_redirect(session, payload, user)
    return {"data": redirect.model_dump(mode="json")}


@router.delete("/redirects/{redirect_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_redirect(redirect_id: uuid.UUID, session: DbSession, _user: CurrentUser) -> None:
    await taxonomy_service.delete_redirect(session, redirect_id)


async def _read_upload(file: UploadFile, max_bytes: int) -> bytes:
    chunks: list[bytes] = []
    total = 0
    while chunk := await file.read(1024 * 256):
        total += len(chunk)
        if total > max_bytes:
            raise ProblemException(
                status=413,
                title="Payload too large",
                detail=f"El archivo supera el límite de {max_bytes // (1024 * 1024)} MB.",
                type_slug="payload-too-large",
            )
        chunks.append(chunk)
    return b"".join(chunks)


@router.get("/media")
async def list_media(
    session: DbSession,
    _user: CurrentUser,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 24,
    q: str | None = None,
) -> dict[str, Any]:
    items, total = await media_service.list_media(session, page=page, limit=limit, q=q)
    meta = page_meta(page=page, limit=limit, total=total)
    return {"data": [item.model_dump(mode="json") for item in items], "meta": meta.as_dict()}


@router.post("/media", status_code=status.HTTP_201_CREATED)
async def upload_media(
    session: DbSession,
    user: CurrentUser,
    file: Annotated[UploadFile, File()],
    alt: Annotated[str, Form()] = "",
) -> dict[str, Any]:
    payload = await _read_upload(file, media_service.MAX_IMAGE_BYTES)
    media = await media_service.save_media(
        session,
        filename=file.filename or "imagen",
        payload=payload,
        alt=alt,
        actor=user,
    )
    read = MediaRead.model_validate(media)
    return {"data": read.model_dump(mode="json")}


@router.patch("/media/{media_id}")
async def update_media(
    media_id: uuid.UUID, payload: MediaUpdate, session: DbSession, user: CurrentUser
) -> dict[str, Any]:
    media = await media_service.update_media_alt(session, media_id, payload.alt, user)
    return {"data": media.model_dump(mode="json")}


@router.delete("/media/{media_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_media(media_id: uuid.UUID, session: DbSession, _user: CurrentUser) -> None:
    await media_service.delete_media(session, media_id)


def _document_read(document: Document) -> DocumentRead:
    return DocumentRead(
        id=document.id,
        title=document.title,
        kind=DocumentKind(document.kind),
        url=document.url,
        mime_type=document.mime_type,
        size_bytes=document.size_bytes,
        created_at=document.created_at,
    )


@router.get("/documents")
async def list_documents(session: DbSession, _user: CurrentUser) -> dict[str, Any]:
    rows = (
        (await session.execute(select(Document).order_by(Document.created_at.desc())))
        .scalars()
        .all()
    )
    return {"data": [_document_read(item).model_dump(mode="json") for item in rows]}


@router.post("/documents", status_code=status.HTTP_201_CREATED)
async def upload_document(
    session: DbSession,
    user: CurrentUser,
    file: Annotated[UploadFile, File()],
    title: Annotated[str, Form(min_length=1, max_length=200)],
    kind: Annotated[str, Form(pattern="^(cv|certificate|other)$")] = "other",
) -> dict[str, Any]:
    payload = await _read_upload(file, media_service.MAX_DOCUMENT_BYTES)
    document = await media_service.save_document(
        session,
        filename=file.filename or "documento.pdf",
        payload=payload,
        title=title,
        kind=kind,
        actor=user,
    )
    return {"data": _document_read(document).model_dump(mode="json")}


@router.delete("/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(document_id: uuid.UUID, session: DbSession, user: CurrentUser) -> None:
    await media_service.delete_document(session, document_id, user)
