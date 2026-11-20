from __future__ import annotations

import hashlib
import hmac
import time
import uuid
from typing import Any

from fastapi.testclient import TestClient

SECRET = "test-webhook-secret-0123456789abcdef"


def _envelope(event_id: str | None = None) -> dict[str, Any]:
    return {
        "event_id": event_id or str(uuid.uuid4()),
        "type": "post.published",
        "occurred_at": "2026-11-18T12:00:00Z",
        "api_version": "v1",
        "data": {"post_id": str(uuid.uuid4()), "slug": "hola-mundo", "url": "https://example.com"},
        "metadata": {"actor_id": "00000000-0000-4000-8000-000000000002", "source": "content-api"},
    }


def _sign(body: bytes, timestamp: str) -> str:
    digest = hmac.new(SECRET.encode(), timestamp.encode() + b"." + body, hashlib.sha256).hexdigest()
    return f"sha256={digest}"


def _headers(
    envelope: dict[str, Any], *, timestamp: str | None = None, signature: str | None = None
) -> tuple[dict[str, str], bytes]:
    import json

    body = json.dumps(envelope, separators=(",", ":")).encode()
    stamp = timestamp or str(int(time.time()))
    headers = {
        "Content-Type": "application/json",
        "X-Ryoko-Event-Id": envelope["event_id"],
        "X-Ryoko-Event-Type": envelope["type"],
        "X-Ryoko-Timestamp": stamp,
        "X-Ryoko-Signature": signature or _sign(body, stamp),
    }
    return headers, body


def test_health_and_ready(client: TestClient) -> None:
    health = client.get("/health")
    assert health.status_code == 200
    assert health.json()["service"] == "webhook-api"
    ready = client.get("/ready")
    assert ready.status_code == 200
    assert ready.json()["checks"]["database"] == "ok"


def test_ingest_is_authenticated_and_idempotent(
    client: TestClient, admin_headers: dict[str, str]
) -> None:
    envelope = _envelope()
    headers, body = _headers(envelope)

    accepted = client.post("/v1/events", content=body, headers=headers)
    assert accepted.status_code == 202, accepted.text
    payload = accepted.json()["data"]
    assert payload["event_id"] == envelope["event_id"]
    assert payload["duplicate"] is False

    duplicate = client.post("/v1/events", content=body, headers=headers)
    assert duplicate.status_code == 202
    assert duplicate.json()["data"]["duplicate"] is True

    events = client.get(
        "/v1/admin/events", headers=admin_headers, params={"type": "post.published", "limit": 100}
    )
    assert events.status_code == 200
    matching = [item for item in events.json()["data"] if item["event_id"] == envelope["event_id"]]
    assert len(matching) == 1
    assert matching[0]["status"] == "delivered"
    assert matching[0]["attempts"] == 1

    detail = client.get(f"/v1/admin/events/{envelope['event_id']}", headers=admin_headers)
    assert detail.status_code == 200
    attempts_log = detail.json()["data"]["attempts_log"]
    assert len(attempts_log) == 1
    assert attempts_log[0]["attempt"] == 1


def test_ingest_rejects_bad_signature_and_stale_timestamp(client: TestClient) -> None:
    envelope = _envelope()
    headers, body = _headers(envelope, signature="sha256=" + "0" * 64)
    bad_signature = client.post("/v1/events", content=body, headers=headers)
    assert bad_signature.status_code == 401
    assert bad_signature.headers["content-type"].startswith("application/problem+json")

    stale_headers, stale_body = _headers(envelope, timestamp=str(int(time.time()) - 301))
    stale = client.post("/v1/events", content=stale_body, headers=stale_headers)
    assert stale.status_code == 401
    assert "Timestamp" in stale.json()["detail"]


def test_ingest_rejects_missing_headers_and_mismatched_envelope(client: TestClient) -> None:
    envelope = _envelope()
    headers, body = _headers(envelope)
    del headers["X-Ryoko-Event-Type"]
    missing = client.post("/v1/events", content=body, headers=headers)
    assert missing.status_code == 400

    changed = {**envelope, "type": "post.updated"}
    changed_headers, changed_body = _headers(changed)
    changed_headers["X-Ryoko-Event-Type"] = envelope["type"]
    mismatch = client.post("/v1/events", content=changed_body, headers=changed_headers)
    assert mismatch.status_code == 400

    envelope["api_version"] = "v2"
    headers, body = _headers(envelope)
    invalid = client.post("/v1/events", content=body, headers=headers)
    assert invalid.status_code == 400


def test_ingest_rejects_payloads_over_one_megabyte(client: TestClient) -> None:
    envelope = _envelope()
    envelope["data"] = {"blob": "x" * (1024 * 1024 + 10)}
    headers, body = _headers(envelope)
    response = client.post("/v1/events", content=body, headers=headers)
    assert response.status_code == 413
    assert response.json()["type"].endswith("payload-too-large")


def test_admin_endpoints_require_admin_jwt(
    client: TestClient, admin_headers: dict[str, str]
) -> None:
    assert client.get("/v1/admin/events").status_code == 401
    assert client.get("/v1/admin/events", headers=admin_headers).status_code == 200


def test_retry_and_dead_letter(
    client: TestClient, admin_headers: dict[str, str], monkeypatch: Any
) -> None:
    from app import delivery
    from app.config import settings

    async def failing_delivery(payload: bytes) -> tuple[bool, int | None, str | None, int]:
        return False, 503, "simulated upstream failure", 10

    monkeypatch.setattr(delivery, "_try_targets", failing_delivery)
    monkeypatch.setattr(settings, "max_attempts", 1)

    envelope = _envelope()
    headers, body = _headers(envelope)
    accepted = client.post("/v1/events", content=body, headers=headers)
    assert accepted.status_code == 202

    detail = client.get(f"/v1/admin/events/{envelope['event_id']}", headers=admin_headers)
    assert detail.status_code == 200
    event = detail.json()["data"]
    assert event["status"] == "dead_letter"
    assert event["last_error"] == "simulated upstream failure"

    async def successful_delivery(payload: bytes) -> tuple[bool, int | None, str | None, int]:
        return True, 200, None, 5

    monkeypatch.setattr(delivery, "_try_targets", successful_delivery)
    retried = client.post(f"/v1/admin/events/{envelope['event_id']}/retry", headers=admin_headers)
    assert retried.status_code == 200, retried.text

    after = client.get(f"/v1/admin/events/{envelope['event_id']}", headers=admin_headers)
    assert after.json()["data"]["status"] == "delivered"
    assert len(after.json()["data"]["attempts_log"]) == 2
