from __future__ import annotations

import secrets
import uuid
from typing import Annotated

from fastapi import Depends, Request
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_session
from app.models import User
from ryoko_common.errors import ProblemException
from ryoko_common.security import TokenClaims, TokenError, decode_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/v1/auth/token", auto_error=False)


async def get_claims(token: Annotated[str | None, Depends(oauth2_scheme)]) -> TokenClaims:
    if not token:
        raise ProblemException(
            status=401,
            title="Unauthorized",
            detail="Se requiere un access token de administrador.",
            type_slug="unauthorized",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        return decode_token(settings, token, expected_type="access")
    except TokenError as exc:
        raise ProblemException(
            status=401,
            title="Unauthorized",
            detail=str(exc),
            type_slug="unauthorized",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


async def get_current_user(
    claims: Annotated[TokenClaims, Depends(get_claims)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> User:
    try:
        user_id = uuid.UUID(claims.subject)
    except ValueError as exc:
        raise ProblemException(status=401, title="Unauthorized", detail="Token inválido.") from exc
    user = await session.get(User, user_id)
    if user is None:
        raise ProblemException(status=401, title="Unauthorized", detail="Usuario no encontrado.")
    return user


async def get_admin_user(
    user: Annotated[User, Depends(get_current_user)],
) -> User:
    if user.role != "admin":
        raise ProblemException(
            status=403,
            title="Forbidden",
            detail="Esta operación requiere el rol admin.",
            type_slug="forbidden",
        )
    return user


async def require_public_token(request: Request) -> None:
    authorization = request.headers.get("authorization", "")
    scheme, _, token = authorization.partition(" ")
    expected = settings.cms_api_token.get_secret_value()
    if scheme.lower() != "bearer" or not token or not secrets.compare_digest(token, expected):
        raise ProblemException(
            status=401,
            title="Unauthorized",
            detail="Se requiere el token público de lectura.",
            type_slug="unauthorized",
            headers={"WWW-Authenticate": "Bearer"},
        )


CurrentUser = Annotated[User, Depends(get_current_user)]
AdminUser = Annotated[User, Depends(get_admin_user)]
DbSession = Annotated[AsyncSession, Depends(get_session)]
