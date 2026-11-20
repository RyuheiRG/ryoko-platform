from __future__ import annotations

import hashlib
import secrets
from dataclasses import dataclass
from datetime import timedelta
from typing import Any

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

from ryoko_common.settings import CommonSettings
from ryoko_common.time import utc_now

_password_hasher = PasswordHasher(
    time_cost=3,
    memory_cost=65536,
    parallelism=4,
    hash_len=32,
    salt_len=16,
)


class TokenError(Exception):
    """Raised when a JWT is absent, malformed, expired or of the wrong type."""


@dataclass(frozen=True)
class TokenClaims:
    subject: str
    role: str
    token_type: str
    jti: str
    expires_at: int


def hash_password(password: str) -> str:
    return _password_hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _password_hasher.verify(password_hash, password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def password_needs_rehash(password_hash: str) -> bool:
    try:
        return _password_hasher.check_needs_rehash(password_hash)
    except InvalidHashError:
        return True


def _encode(settings: CommonSettings, payload: dict[str, Any]) -> str:
    return jwt.encode(
        payload,
        settings.jwt_secret.get_secret_value(),
        algorithm=settings.jwt_algorithm,
    )


def create_access_token(settings: CommonSettings, *, subject: str, role: str) -> str:
    now = utc_now()
    expires = now + timedelta(minutes=settings.access_token_expire_minutes)
    return _encode(
        settings,
        {
            "sub": subject,
            "role": role,
            "type": "access",
            "iss": settings.jwt_issuer,
            "aud": settings.jwt_audience,
            "iat": int(now.timestamp()),
            "nbf": int(now.timestamp()),
            "exp": int(expires.timestamp()),
            "jti": secrets.token_urlsafe(18),
        },
    )


def create_signed_token(
    settings: CommonSettings,
    *,
    subject: str,
    role: str,
    token_type: str,
    expires_delta: timedelta,
    extra: dict[str, Any] | None = None,
) -> str:
    now = utc_now()
    expires = now + expires_delta
    payload: dict[str, Any] = {
        "sub": subject,
        "role": role,
        "type": token_type,
        "iss": settings.jwt_issuer,
        "aud": settings.jwt_audience,
        "iat": int(now.timestamp()),
        "nbf": int(now.timestamp()),
        "exp": int(expires.timestamp()),
        "jti": secrets.token_urlsafe(18),
    }
    if extra:
        payload.update(extra)
    return _encode(settings, payload)


def decode_token(
    settings: CommonSettings,
    token: str,
    *,
    expected_type: str = "access",
) -> TokenClaims:
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret.get_secret_value(),
            algorithms=[settings.jwt_algorithm],
            audience=settings.jwt_audience,
            issuer=settings.jwt_issuer,
            options={"require": ["sub", "role", "type", "iss", "aud", "exp", "jti"]},
        )
    except jwt.PyJWTError as exc:
        raise TokenError("Token inválido o expirado.") from exc

    if payload.get("type") != expected_type:
        raise TokenError("Tipo de token inválido.")
    return TokenClaims(
        subject=str(payload["sub"]),
        role=str(payload["role"]),
        token_type=str(payload["type"]),
        jti=str(payload["jti"]),
        expires_at=int(payload["exp"]),
    )


def generate_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
