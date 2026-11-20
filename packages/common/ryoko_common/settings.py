from __future__ import annotations

from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class CommonSettings(BaseSettings):
    """Settings shared by every API in the monorepo.

    Values come from service-local `.env` or the monorepo root `.env`. Docker
    Compose injects the same names as environment variables.
    """

    model_config = SettingsConfigDict(
        env_file=(".env", "../../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    environment: Literal["local", "staging", "production"] = "local"
    log_level: str = "INFO"
    error_base_url: str = "https://api.ryuheirg.dev/errors"

    jwt_secret: SecretStr = Field(min_length=32)
    jwt_algorithm: str = "HS256"
    jwt_issuer: str = "ryoko-content-api"
    jwt_audience: str = "ryoko-admin"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7

    cors_origins: str = "http://localhost:5173,https://cms.ryuheirg.dev"
    redis_url: str = "redis://localhost:6379/0"

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]
