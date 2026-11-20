from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, Field

from app.deps import CurrentUser, DbSession
from app.services import auth as auth_service
from app.services.auth import AuthSession
from ryoko_common.errors import ProblemException
from ryoko_common.security import hash_password, verify_password

router = APIRouter(prefix="/v1/auth", tags=["auth"])


class RefreshInput(BaseModel):
    refresh_token: str = Field(min_length=16)
    grant_type: str | None = None


class LogoutInput(BaseModel):
    refresh_token: str = Field(min_length=16)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    refresh_token: str
    user: dict[str, object]


def _response(session: AuthSession) -> TokenResponse:
    return TokenResponse(**session.as_dict())


@router.post("/token", response_model=TokenResponse)
async def token(
    form: Annotated[OAuth2PasswordRequestForm, Depends()],
    session: DbSession,
) -> TokenResponse:
    result = await auth_service.login(session, username=form.username, password=form.password)
    return _response(result)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(payload: RefreshInput, session: DbSession) -> TokenResponse:
    result = await auth_service.refresh(session, payload.refresh_token)
    return _response(result)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(payload: LogoutInput, session: DbSession) -> None:
    await auth_service.logout(session, payload.refresh_token)


@router.get("/me")
async def me(user: CurrentUser) -> dict[str, object]:
    return {"data": (await auth_service.current_user_read(user)).model_dump(mode="json")}


class PasswordChange(BaseModel):
    current_password: str = Field(min_length=1)
    new_password: str = Field(min_length=12, max_length=200)


@router.post("/password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(
    payload: PasswordChange,
    user: CurrentUser,
    session: DbSession,
) -> None:
    if not verify_password(payload.current_password, user.password_hash):
        raise ProblemException(
            status=401,
            title="Unauthorized",
            detail="La contraseña actual no coincide.",
            type_slug="unauthorized",
        )
    user.password_hash = hash_password(payload.new_password)
    await session.commit()
