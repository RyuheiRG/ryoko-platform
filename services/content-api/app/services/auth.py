from __future__ import annotations

import uuid
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import RefreshToken, User
from app.schemas import AuthorRead
from app.serializers import author_read
from ryoko_common.errors import ProblemException
from ryoko_common.security import (
    create_access_token,
    generate_refresh_token,
    hash_refresh_token,
    verify_password,
)
from ryoko_common.time import utc_now


class AuthSession:
    def __init__(self, access_token: str, refresh_token: str, expires_in: int, user: AuthorRead):
        self.access_token = access_token
        self.refresh_token = refresh_token
        self.expires_in = expires_in
        self.user = user

    def as_dict(self) -> dict[str, object]:
        return {
            "access_token": self.access_token,
            "token_type": "bearer",
            "expires_in": self.expires_in,
            "refresh_token": self.refresh_token,
            "user": self.user.model_dump(mode="json"),
        }


async def _issue(session: AsyncSession, user: User) -> AuthSession:
    access_token = create_access_token(settings, subject=str(user.id), role=user.role)
    refresh_token = generate_refresh_token()
    session.add(
        RefreshToken(
            id=uuid.uuid4(),
            user_id=user.id,
            token_hash=hash_refresh_token(refresh_token),
            expires_at=utc_now() + timedelta(days=settings.refresh_token_expire_days),
        )
    )
    await session.commit()
    return AuthSession(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=settings.access_token_expire_minutes * 60,
        user=author_read(user),
    )


async def login(session: AsyncSession, *, username: str, password: str) -> AuthSession:
    user = (
        await session.execute(select(User).where(User.email == username.strip().lower()))
    ).scalar_one_or_none()
    if user is None or not verify_password(password, user.password_hash):
        raise ProblemException(
            status=401,
            title="Unauthorized",
            detail="Credenciales inválidas.",
            type_slug="unauthorized",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return await _issue(session, user)


async def refresh(session: AsyncSession, token: str) -> AuthSession:
    token_hash = hash_refresh_token(token)
    stored = (
        await session.execute(select(RefreshToken).where(RefreshToken.token_hash == token_hash))
    ).scalar_one_or_none()
    now = utc_now()
    if stored is None or stored.revoked_at is not None or stored.expires_at <= now:
        raise ProblemException(
            status=401,
            title="Unauthorized",
            detail="Refresh token inválido o expirado.",
            type_slug="unauthorized",
        )
    user = await session.get(User, stored.user_id)
    if user is None:
        raise ProblemException(status=401, title="Unauthorized", detail="Usuario no encontrado.")
    stored.revoked_at = now
    return await _issue(session, user)


async def logout(session: AsyncSession, token: str) -> None:
    token_hash = hash_refresh_token(token)
    stored = (
        await session.execute(select(RefreshToken).where(RefreshToken.token_hash == token_hash))
    ).scalar_one_or_none()
    if stored is not None and stored.revoked_at is None:
        stored.revoked_at = utc_now()
        await session.commit()


async def current_user_read(user: User) -> AuthorRead:
    return author_read(user)
