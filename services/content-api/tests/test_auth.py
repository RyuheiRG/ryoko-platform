from __future__ import annotations

from fastapi.testclient import TestClient


def test_health_and_ready(client: TestClient) -> None:
    health = client.get("/health")
    assert health.status_code == 200
    assert health.json()["service"] == "content-api"

    ready = client.get("/ready")
    assert ready.status_code == 200
    assert ready.json()["checks"]["database"] == "ok"


def test_public_health_is_open(client: TestClient) -> None:
    response = client.get("/v1/public/health")
    assert response.status_code == 200
    assert response.json() == {"data": {"status": "ok"}}


def test_public_endpoints_require_the_public_token(client: TestClient) -> None:
    response = client.get("/v1/public/site")
    assert response.status_code == 401
    assert response.headers["content-type"].startswith("application/problem+json")
    assert response.json()["title"] == "Unauthorized"


def test_public_token_cannot_access_admin(
    client: TestClient, public_headers: dict[str, str]
) -> None:
    read = client.get("/v1/admin/posts", headers=public_headers)
    assert read.status_code == 401

    write = client.post(
        "/v1/admin/posts",
        headers=public_headers,
        json={"title": "No permitido", "excerpt": "x", "content_md": "x"},
    )
    assert write.status_code == 401


def test_admin_jwt_cannot_read_public_api(
    client: TestClient, admin_headers: dict[str, str]
) -> None:
    response = client.get("/v1/public/site", headers=admin_headers)
    assert response.status_code == 401


def test_login_refresh_logout_flow(client: TestClient) -> None:
    bad = client.post(
        "/v1/auth/token",
        data={"username": "hola@ryuheirg.dev", "password": "incorrect-password"},
    )
    assert bad.status_code == 401
    assert bad.headers["content-type"].startswith("application/problem+json")

    login = client.post(
        "/v1/auth/token",
        data={"username": "hola@ryuheirg.dev", "password": "ryoko-dev-password"},
    )
    assert login.status_code == 200
    body = login.json()
    assert set(body) == {"access_token", "token_type", "expires_in", "refresh_token", "user"}
    assert body["token_type"] == "bearer"
    assert body["user"]["name"] == "Ricardo Reyes Gómez"

    me = client.get("/v1/auth/me", headers={"Authorization": f"Bearer {body['access_token']}"})
    assert me.status_code == 200
    assert me.json()["data"]["alias"] == "Ryoko"

    refreshed = client.post("/v1/auth/refresh", json={"refresh_token": body["refresh_token"]})
    assert refreshed.status_code == 200
    rotated = refreshed.json()

    reused = client.post("/v1/auth/refresh", json={"refresh_token": body["refresh_token"]})
    assert reused.status_code == 401

    logout = client.post("/v1/auth/logout", json={"refresh_token": rotated["refresh_token"]})
    assert logout.status_code == 204

    after_logout = client.post("/v1/auth/refresh", json={"refresh_token": rotated["refresh_token"]})
    assert after_logout.status_code == 401
