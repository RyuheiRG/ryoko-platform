from __future__ import annotations

from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr

from ryoko_common.settings import CommonSettings


class Settings(CommonSettings):
    database_url: str
    cms_api_token: SecretStr = Field(min_length=16)
    webhook_url: str = "http://localhost:8001/v1/events"
    webhook_secret: SecretStr = Field(min_length=32)

    media_storage: Literal["local", "s3"] = "local"
    media_dir: Path = Path("media")
    media_public_base_url: str = "http://localhost:8000/media"
    media_s3_endpoint: str | None = None
    media_bucket: str | None = None
    media_access_key: str | None = None
    media_secret_key: SecretStr | None = None

    public_site_url: str = "https://ryuheirg.dev"
    preview_base_url: str = "https://preview.ryuheirg.dev"
    enable_scheduler: bool = True
    seed_admin_email: str | None = None
    seed_admin_password: SecretStr | None = None
    seed_admin_name: str = "Ricardo Reyes Gómez"
    seed_admin_alias: str = "Ryoko"


settings = Settings()
