from __future__ import annotations

from typing import Literal

from pydantic import Field, SecretStr

from ryoko_common.settings import CommonSettings


class Settings(CommonSettings):
    database_url: str
    site_id: str = "ryoko"
    site_key: str = Field(min_length=8)
    ip_hash_salt: SecretStr
    retention_days: int = 90
    cors_origins: str = (
        "https://ryuheirg.dev,"
        "https://www.ryuheirg.dev,"
        "https://cms.ryuheirg.dev,"
        "http://localhost:4321,"
        "http://localhost:5173"
    )
    environment: Literal["local", "staging", "production"] = "local"
    seed_demo_events: bool = False


settings = Settings()
