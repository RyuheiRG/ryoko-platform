from __future__ import annotations

from typing import Literal

from pydantic import Field, SecretStr

from ryoko_common.settings import CommonSettings


class Settings(CommonSettings):
    database_url: str
    webhook_secret: SecretStr = Field(min_length=32)
    n8n_webhook_url: str | None = None
    n8n_shared_secret: SecretStr | None = None
    vercel_deploy_hook_url: str | None = None
    discord_webhook_url: str | None = None
    max_attempts: int = 5
    worker_enabled: bool = True
    worker_interval_seconds: int = 15
    max_body_bytes: int = 1024 * 1024
    timestamp_tolerance_seconds: int = 300
    retry_schedule_seconds: str = "60,300,900,3600,21600"
    environment: Literal["local", "staging", "production"] = "local"

    @property
    def retry_schedule(self) -> list[int]:
        return [int(value.strip()) for value in self.retry_schedule_seconds.split(",") if value]

    @property
    def delivery_target(self) -> str | None:
        return self.n8n_webhook_url or self.vercel_deploy_hook_url


settings = Settings()
