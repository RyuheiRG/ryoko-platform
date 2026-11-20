from __future__ import annotations

import io
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

import anyio
from PIL import Image, ImageOps
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import Document, Media, Post, Project, ProjectMedia, User
from app.serializers import media_read, slugify
from app.webhooks import emit_event
from ryoko_common.errors import ProblemException, ProblemField

try:  # AVIF support is optional depending on the installed Pillow build.
    import pillow_avif  # noqa: F401
except ImportError:  # pragma: no cover - depends on wheel availability
    pass

try:
    import blurhash
except ImportError:  # pragma: no cover
    blurhash = None

MAX_IMAGE_BYTES = 10 * 1024 * 1024
MAX_DOCUMENT_BYTES = 20 * 1024 * 1024
MAX_DIMENSION = 6000
VARIANT_WIDTHS = (1200, 800, 400)

ALLOWED_IMAGE_FORMATS: dict[str, tuple[str, str]] = {
    "AVIF": ("image/avif", "avif"),
    "WEBP": ("image/webp", "webp"),
    "JPEG": ("image/jpeg", "jpg"),
    "PNG": ("image/png", "png"),
}


def _invalid(field: str, message: str) -> ProblemException:
    return ProblemException(
        status=422,
        title="Validation error",
        detail=message,
        type_slug="validation",
        errors=[ProblemField(field=field, code="invalid", message=message)],
    )


def _blurhash(image: Image.Image) -> str | None:
    if blurhash is None:
        return None
    thumb = image.convert("RGB").resize((32, 32), Image.Resampling.LANCZOS)
    try:
        return str(blurhash.encode(thumb, x_components=4, y_components=3))
    except Exception:  # pragma: no cover - defensive for exotic images
        return None


def _storage_backend() -> str:
    return settings.media_storage


def _s3_client() -> Any:
    import boto3

    return boto3.client(
        "s3",
        endpoint_url=settings.media_s3_endpoint,
        aws_access_key_id=settings.media_access_key,
        aws_secret_access_key=(
            settings.media_secret_key.get_secret_value() if settings.media_secret_key else None
        ),
        region_name="auto",
    )


def _public_url(storage_key: str) -> str:
    return f"{settings.media_public_base_url.rstrip('/')}/{storage_key}"


async def _write_local(storage_key: str, payload: bytes) -> None:
    target = settings.media_dir / storage_key
    target.parent.mkdir(parents=True, exist_ok=True)
    await anyio.to_thread.run_sync(target.write_bytes, payload)


def _write_local_sync(storage_key: str, payload: bytes) -> Path:
    target = settings.media_dir / storage_key
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(payload)
    return target


async def _store(storage_key: str, payload: bytes, content_type: str) -> None:
    if _storage_backend() == "local":
        await _write_local(storage_key, payload)
        return
    client = _s3_client()
    await anyio.to_thread.run_sync(
        lambda: client.put_object(
            Bucket=settings.media_bucket,
            Key=storage_key,
            Body=payload,
            ContentType=content_type,
            CacheControl="public, max-age=31536000, immutable",
        )
    )


async def _delete_stored(storage_key: str) -> None:
    if _storage_backend() == "local":
        target = settings.media_dir / storage_key
        if target.exists():
            await anyio.to_thread.run_sync(target.unlink)
        return
    client = _s3_client()
    await anyio.to_thread.run_sync(
        lambda: client.delete_object(Bucket=settings.media_bucket, Key=storage_key)
    )


def _render_variants(image: Image.Image, fmt: str) -> list[tuple[int, bytes]]:
    rendered: list[tuple[int, bytes]] = []
    for width in VARIANT_WIDTHS:
        if image.width <= width:
            continue
        ratio = width / image.width
        height = max(1, round(image.height * ratio))
        resized = image.resize((width, height), Image.Resampling.LANCZOS)
        buffer = io.BytesIO()
        resized.save(buffer, format=fmt, quality=82, optimize=True)
        rendered.append((width, buffer.getvalue()))
    return rendered


async def save_media(
    session: AsyncSession, *, filename: str, payload: bytes, alt: str, actor: User
) -> Any:
    if not payload:
        raise _invalid("file", "El archivo está vacío.")
    if len(payload) > MAX_IMAGE_BYTES:
        raise _invalid("file", "La imagen supera el límite de 10 MB.")
    if not alt.strip():
        raise _invalid("alt", "El texto alternativo es obligatorio.")

    try:
        probe = Image.open(io.BytesIO(payload))
        probe.verify()
        image: Image.Image = Image.open(io.BytesIO(payload))
        image.load()
    except Exception as exc:
        raise _invalid("file", "El archivo no es una imagen válida.") from exc

    if image.format is None or image.format.upper() not in ALLOWED_IMAGE_FORMATS:
        raise _invalid("file", "Formato no soportado. Usa AVIF, WebP, JPEG o PNG.")
    if image.width > MAX_DIMENSION or image.height > MAX_DIMENSION:
        raise _invalid("file", "Las dimensiones máximas son 6000×6000 píxeles.")

    fmt = image.format.upper()
    mime_type, extension = ALLOWED_IMAGE_FORMATS[fmt]
    image = ImageOps.exif_transpose(image)
    if image.mode not in {"RGB", "RGBA", "L"}:
        image = image.convert("RGB")
    elif fmt in {"JPEG"} and image.mode != "RGB":
        image = image.convert("RGB")

    media_id = uuid.uuid4()
    stem = slugify(Path(filename).stem) or "imagen"
    blur_value = _blurhash(image)

    base_key = f"{media_id}/{stem}.{extension}"
    buffer = io.BytesIO()
    image.save(buffer, format=fmt, quality=88, optimize=True)
    original_payload = buffer.getvalue()
    await _store(base_key, original_payload, mime_type)

    variants: list[dict[str, object]] = []
    for width, blob in _render_variants(image, fmt):
        key = f"{media_id}/{stem}-{width}.{extension}"
        await _store(key, blob, mime_type)
        variants.append({"width": width, "url": _public_url(key)})

    media = Media(
        id=media_id,
        url=_public_url(base_key),
        storage_key=base_key,
        width=image.width,
        height=image.height,
        mime_type=mime_type,
        size_bytes=len(original_payload),
        alt=alt.strip(),
        blurhash=blur_value,
        variants=variants,
    )
    session.add(media)
    await session.commit()
    await session.refresh(media)
    return media


async def delete_media(session: AsyncSession, media_id: uuid.UUID) -> None:
    media = await session.get(Media, media_id)
    if media is None:
        raise ProblemException(status=404, title="Not found", detail="Media no encontrada.")

    post_use = await session.scalar(
        select(Post.id).where(or_(Post.cover_media_id == media_id, Post.og_media_id == media_id))
    )
    project_use = await session.scalar(
        select(Project.id).where(
            or_(Project.cover_media_id == media_id, Project.og_media_id == media_id)
        )
    )
    gallery_use = await session.scalar(
        select(ProjectMedia.project_id).where(ProjectMedia.media_id == media_id)
    )
    user_use = await session.scalar(select(User.id).where(User.avatar_media_id == media_id))
    if post_use or project_use or gallery_use or user_use:
        raise ProblemException(
            status=409,
            title="Conflict",
            detail="No se puede eliminar una media que está en uso.",
            type_slug="conflict",
        )

    keys = [media.storage_key]
    for variant in media.variants or []:
        url = str(variant.get("url", ""))
        prefix = settings.media_public_base_url.rstrip("/") + "/"
        if url.startswith(prefix):
            keys.append(url[len(prefix) :])
    for key in keys:
        await _delete_stored(key)
    await session.delete(media)
    await session.commit()


async def list_media(
    session: AsyncSession, *, page: int, limit: int, q: str | None
) -> tuple[list[Any], int]:
    from sqlalchemy import func

    filters = []
    if q:
        filters.append(Media.alt.ilike(f"%{q}%"))
    total = int(await session.scalar(select(func.count(Media.id)).where(*filters)) or 0)
    rows = (
        (
            await session.execute(
                select(Media)
                .where(*filters)
                .order_by(Media.created_at.desc())
                .offset((page - 1) * limit)
                .limit(limit)
            )
        )
        .scalars()
        .all()
    )
    return [media_read(row) for row in rows], total


async def update_media_alt(
    session: AsyncSession, media_id: uuid.UUID, alt: str, actor: User
) -> Any:
    media = await session.get(Media, media_id)
    if media is None:
        raise ProblemException(status=404, title="Not found", detail="Media no encontrada.")
    media.alt = alt.strip()
    await session.commit()
    await session.refresh(media)
    await emit_event("media.updated", {"media_id": str(media.id), "url": media.url}, actor.id)
    return media_read(media)


def _document_url(storage_key: str) -> str:
    return f"{settings.media_public_base_url.rstrip('/')}/{storage_key}"


async def save_document(
    session: AsyncSession,
    *,
    filename: str,
    payload: bytes,
    title: str,
    kind: str,
    actor: User,
) -> Document:
    if not payload:
        raise _invalid("file", "El archivo está vacío.")
    if len(payload) > MAX_DOCUMENT_BYTES:
        raise _invalid("file", "El documento supera el límite de 20 MB.")
    if not payload.lstrip().startswith(b"%PDF-"):
        raise _invalid("file", "El archivo debe ser un PDF válido.")
    if not title.strip():
        raise _invalid("title", "El título es obligatorio.")

    document_id = uuid.uuid4()
    stem = slugify(Path(filename).stem) or "documento"
    storage_key = f"documents/{document_id}/{stem}.pdf"
    await _store(storage_key, payload, "application/pdf")
    document = Document(
        id=document_id,
        title=title.strip(),
        kind=kind,
        url=_document_url(storage_key),
        storage_key=storage_key,
        mime_type="application/pdf",
        size_bytes=len(payload),
    )
    session.add(document)
    await session.commit()
    await session.refresh(document)
    await emit_event(
        "document.created",
        {"document_id": str(document.id), "kind": document.kind, "url": document.url},
        actor.id,
    )
    return document


async def delete_document(session: AsyncSession, document_id: uuid.UUID, actor: User) -> None:
    document = await session.get(Document, document_id)
    if document is None:
        raise ProblemException(status=404, title="Not found", detail="Documento no encontrado.")
    kind = document.kind
    await _delete_stored(document.storage_key)
    await session.delete(document)
    await session.commit()
    await emit_event("document.deleted", {"document_id": str(document_id), "kind": kind}, actor.id)


def document_created_at(document: Document) -> datetime:
    return document.created_at
