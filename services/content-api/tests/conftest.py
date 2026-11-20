from __future__ import annotations

import asyncio
import os
import subprocess
import sys
from collections.abc import Iterator
from pathlib import Path

import asyncpg
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.engine import make_url

SERVICE_DIR = Path(__file__).resolve().parents[1]
if str(SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(SERVICE_DIR))

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://ryoko:ryoko@localhost:5432/ryoko_test_content",
)
os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ["JWT_SECRET"] = "test-jwt-secret-0123456789abcdef0123456789"
os.environ["JWT_ISSUER"] = "ryoko-content-api"
os.environ["JWT_AUDIENCE"] = "ryoko-admin"
os.environ["CMS_API_TOKEN"] = "test-cms-api-token-0123456789abcdef"
os.environ["WEBHOOK_SECRET"] = "test-webhook-secret-0123456789abcdef"
os.environ["WEBHOOK_URL"] = "http://127.0.0.1:1/v1/events"
os.environ["ENABLE_SCHEDULER"] = "false"
os.environ["MEDIA_STORAGE"] = "local"
os.environ["MEDIA_DIR"] = str(SERVICE_DIR / "media-test")
os.environ["MEDIA_PUBLIC_BASE_URL"] = "http://testserver/media"
os.environ["SEED_ADMIN_EMAIL"] = "hola@ryuheirg.dev"
os.environ["SEED_ADMIN_PASSWORD"] = "ryoko-dev-password"

ADMIN_EMAIL = "hola@ryuheirg.dev"
ADMIN_PASSWORD = "ryoko-dev-password"


async def _reset_database() -> None:
    url = make_url(TEST_DATABASE_URL)
    database = url.database or ""
    if "test" not in database:
        raise RuntimeError(f"Refusing to reset non-test database: {database}")
    connection = await asyncpg.connect(
        host=url.host or "localhost",
        port=url.port or 5432,
        user=url.username or "ryoko",
        password=url.password or "ryoko",
        database="postgres",
    )
    try:
        await connection.execute(f'DROP DATABASE IF EXISTS "{database}" WITH (FORCE)')
        await connection.execute(f'CREATE DATABASE "{database}"')
    finally:
        await connection.close()


@pytest.fixture(scope="session", autouse=True)
def database() -> None:
    asyncio.run(_reset_database())
    subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=SERVICE_DIR,
        check=True,
        env=os.environ.copy(),
    )

    from app.database import SessionLocal, engine
    from app.seed import seed

    async def run_seed() -> None:
        async with SessionLocal() as session:
            await seed(session)
        await engine.dispose()

    asyncio.run(run_seed())


@pytest.fixture(scope="session")
def client(database: None) -> Iterator[TestClient]:
    from app.main import app

    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture(scope="session")
def public_headers() -> dict[str, str]:
    return {"Authorization": "Bearer test-cms-api-token-0123456789abcdef"}


@pytest.fixture(scope="session")
def admin_token(client: TestClient) -> str:
    response = client.post(
        "/v1/auth/token",
        data={"username": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
    )
    assert response.status_code == 200, response.text
    return str(response.json()["access_token"])


@pytest.fixture(scope="session")
def admin_headers(admin_token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {admin_token}"}
