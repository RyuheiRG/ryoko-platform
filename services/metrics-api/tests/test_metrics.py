from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any, cast

from fastapi.testclient import TestClient
from helpers import fetch_row

SITE_KEY = "test-site-key"


def _now() -> str:
    return datetime.now(tz=UTC).isoformat().replace("+00:00", "Z")


def _event(**overrides: Any) -> dict[str, Any]:
    event = {
        "event_id": str(uuid.uuid4()),
        "type": "PAGE_VIEW",
        "path": "/blog/como-construi-ryoko",
        "session_id": f"s_{uuid.uuid4().hex[:12]}",
        "occurred_at": _now(),
        "post_slug": None,
        "project_slug": None,
        "ad_id": None,
        "referrer": "https://github.com/RyuheiRG?utm_source=private#fragment",
        "properties": {"device": "mobile", "utm_source": "github"},
    }
    event.update(overrides)
    return event


def _track(client: TestClient, event: dict[str, Any]) -> dict[str, Any]:
    response = client.post(
        "/graphql",
        headers={"X-Site-Key": SITE_KEY},
        json={
            "query": """
                mutation Track($input: TrackEventInput!) {
                  trackEvent(input: $input) { ok event_id duplicate }
                }
            """,
            "variables": {"input": event},
        },
    )
    assert response.status_code == 200, response.text
    return cast(dict[str, Any], response.json())


def _dashboard(
    client: TestClient, token: str, query: str, variables: dict[str, Any]
) -> dict[str, Any]:
    response = client.post(
        "/graphql",
        headers={"Authorization": f"Bearer {token}"},
        json={"query": query, "variables": variables},
    )
    assert response.status_code == 200, response.text
    return cast(dict[str, Any], response.json())


def test_health_and_ready(client: TestClient) -> None:
    assert client.get("/health").json()["service"] == "metrics-api"
    ready = client.get("/ready")
    assert ready.status_code == 200
    assert ready.json()["checks"]["database"] == "ok"


def test_track_event_requires_site_key(client: TestClient) -> None:
    response = client.post(
        "/graphql",
        json={
            "query": (
                "mutation Track($input: TrackEventInput!) { trackEvent(input: $input) { ok } }"
            ),
            "variables": {"input": _event()},
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["data"] is None
    assert "X-Site-Key" in body["errors"][0]["message"]


def test_track_event_deduplicates_event_id(client: TestClient, admin_token: str) -> None:
    event = _event(type="POST_VIEW", post_slug="como-construi-ryoko")
    first = _track(client, event)
    assert first["data"]["trackEvent"] == {
        "ok": True,
        "event_id": event["event_id"],
        "duplicate": False,
    }

    second = _track(client, event)
    assert second["data"]["trackEvent"]["duplicate"] is True

    stored = fetch_row(event["event_id"])
    assert stored["event_type"] == "POST_VIEW"
    assert stored["path"] == "/blog/como-construi-ryoko"

    today = datetime.now(tz=UTC).date()
    query = """
      query Dashboard($range: DateRangeInput!) {
        pageViews(range: $range) { total points { date value } }
        topPosts(range: $range, limit: 5) { slug title views }
        projectClicks(range: $range) { slug clicks }
        outboundClicks(range: $range, limit: 10) { url clicks }
        adMetrics(range: $range) { impressions clicks ctr }
        realtime(window_minutes: 5)
      }
    """
    variables = {
        "range": {
            "from": f"{today - timedelta(days=1)}T00:00:00Z",
            "to": f"{today + timedelta(days=1)}T00:00:00Z",
        }
    }
    dashboard = _dashboard(client, admin_token, query, variables)
    assert "errors" not in dashboard
    data = dashboard["data"]
    assert data["pageViews"]["total"] >= 1
    assert any(point["value"] >= 1 for point in data["pageViews"]["points"])
    assert data["topPosts"][0]["slug"] == "como-construi-ryoko"
    assert data["topPosts"][0]["views"] >= 1
    assert data["adMetrics"] == {"impressions": 0, "clicks": 0, "ctr": 0.0}
    assert data["realtime"] >= 1


def test_dashboard_queries_require_admin_jwt(client: TestClient, admin_token: str) -> None:
    today = datetime.now(tz=UTC).date()
    query = (
        'query { pageViews(range: {from: "'
        + f"{today - timedelta(days=1)}T00:00:00Z"
        + '", to: "'
        + f"{today + timedelta(days=1)}T00:00:00Z"
        + '"}) { total } }'
    )

    anonymous = client.post("/graphql", json={"query": query})
    assert anonymous.status_code == 200
    assert anonymous.json()["data"] is None
    assert "access token" in anonymous.json()["errors"][0]["message"]

    viewer_token = admin_token
    authorized = client.post(
        "/graphql",
        headers={"Authorization": f"Bearer {viewer_token}"},
        json={"query": query},
    )
    assert authorized.status_code == 200
    assert authorized.json()["data"]["pageViews"]["total"] >= 0


def test_batch_tracking_and_batch_limit(client: TestClient) -> None:
    events = [
        _event(
            type="OUTBOUND_CLICK",
            project_slug="secureup",
            properties={"url": "https://github.com/RyuheiRG/SecureUP"},
        ),
        _event(type="PROJECT_VIEW", project_slug="secureup"),
    ]
    response = client.post(
        "/graphql",
        headers={"X-Site-Key": SITE_KEY},
        json={
            "query": """
                mutation TrackMany($input: [TrackEventInput!]!) {
                  trackEvents(input: $input) { accepted duplicates }
                }
            """,
            "variables": {"input": events},
        },
    )
    assert response.status_code == 200
    assert response.json()["data"]["trackEvents"] == {"accepted": 2, "duplicates": 0}

    duplicated = client.post(
        "/graphql",
        headers={"X-Site-Key": SITE_KEY},
        json={
            "query": """
                mutation TrackMany($input: [TrackEventInput!]!) {
                  trackEvents(input: $input) { accepted duplicates }
                }
            """,
            "variables": {"input": events},
        },
    )
    assert duplicated.json()["data"]["trackEvents"] == {"accepted": 0, "duplicates": 2}

    too_many = client.post(
        "/graphql",
        headers={"X-Site-Key": SITE_KEY},
        json={
            "query": """
                mutation TrackMany($input: [TrackEventInput!]!) {
                  trackEvents(input: $input) { accepted duplicates }
                }
            """,
            "variables": {"input": [_event() for _ in range(21)]},
        },
    )
    assert too_many.status_code == 200
    assert "20" in too_many.json()["errors"][0]["message"]


def test_occurred_at_window(client: TestClient) -> None:
    old = (datetime.now(tz=UTC) - timedelta(minutes=11)).isoformat().replace("+00:00", "Z")
    body = _track(client, _event(occurred_at=old))
    assert body["data"] is None
    assert "10 minutos" in body["errors"][0]["message"]


def test_privacy_ip_hash_and_referrer_cleaning(client: TestClient) -> None:
    event = _event(referrer="https://example.com/landing?token=secret#section")
    body = _track(client, event)
    assert body["data"]["trackEvent"]["ok"] is True

    stored = fetch_row(event["event_id"])
    ip_hash = str(stored["ip_hash"])
    assert len(ip_hash) == 64
    assert all(character in "0123456789abcdef" for character in ip_hash)
    assert stored["referrer"] == "https://example.com/landing"
    assert "token=secret" not in str(stored["referrer"])


def test_404_for_rest_endpoints(client: TestClient) -> None:
    response = client.get("/v1/public/posts")
    assert response.status_code == 404
