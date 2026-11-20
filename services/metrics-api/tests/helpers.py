from __future__ import annotations

import asyncio
import os

import asyncpg

TEST_DATABASE_URL = os.environ["DATABASE_URL"]


def fetch_row(event_id: str) -> dict[str, object]:
    async def query() -> dict[str, object]:
        dsn = TEST_DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")
        connection = await asyncpg.connect(dsn)
        try:
            row = await connection.fetchrow(
                "SELECT ip_hash, referrer, event_type, path, country FROM metrics_events"
                " WHERE event_id = $1",
                event_id,
            )
        finally:
            await connection.close()
        if row is None:
            raise AssertionError("event not stored")
        return dict(row)

    return asyncio.run(query())
