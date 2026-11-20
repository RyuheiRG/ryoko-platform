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
    "postgresql+asyncpg://ryoko:ryoko@localhost:5432/ryoko_test_metrics",
)
os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ["JWT_SECRET"] = "test-jwt-secret-0123456789abcdef0123456789"
os.environ["JWT_ISSUER"] = "ryoko-content-api"
os.environ["JWT_AUDIENCE"] = "ryoko-admin"
os.environ["SITE_ID"] = "ryoko"
os.environ["SITE_KEY"] = "test-site-key"
os.environ["IP_HASH_SALT"] = "test-ip-salt"
os.environ["SEED_DEMO_EVENTS"] = "false"


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


@pytest.fixture(scope="session")
def client(database: None) -> Iterator[TestClient]:
    from app.main import app

    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture(scope="session")
def admin_token() -> str:
    from app.config import settings
    from ryoko_common.security import create_access_token

    return create_access_token(
        settings, subject="00000000-0000-4000-8000-000000000001", role="admin"
    )
