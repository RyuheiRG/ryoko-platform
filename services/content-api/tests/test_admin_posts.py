from __future__ import annotations

import uuid

from fastapi.testclient import TestClient


def _post_payload(slug: str) -> dict[str, object]:
    return {
        "title": "Post de prueba",
        "slug": slug,
        "excerpt": "Excerpt de prueba para el flujo de publicación.",
        "content_md": "## Contenido\n\nTexto de prueba.",
        "featured": False,
    }


def test_admin_post_lifecycle(client: TestClient, admin_headers: dict[str, str]) -> None:
    slug = f"post-prueba-{uuid.uuid4().hex[:8]}"
    created = client.post("/v1/admin/posts", headers=admin_headers, json=_post_payload(slug))
    assert created.status_code == 201, created.text
    post = created.json()["data"]
    post_id = post["id"]
    assert post["publish_status"] == "draft"
    assert post["published_at"] is None
    assert post["reading_time_minutes"] >= 1

    hidden = client.get(
        f"/v1/public/posts/{slug}",
        headers={"Authorization": "Bearer test-cms-api-token-0123456789abcdef"},
    )
    assert hidden.status_code == 404

    published = client.post(f"/v1/admin/posts/{post_id}/publish", headers=admin_headers)
    assert published.status_code == 200, published.text
    published_body = published.json()["data"]
    assert published_body["publish_status"] == "published"
    assert published_body["published_at"].endswith("Z")
    assert "webhook_event_id" in published_body

    visible = client.get(
        f"/v1/public/posts/{slug}",
        headers={"Authorization": "Bearer test-cms-api-token-0123456789abcdef"},
    )
    assert visible.status_code == 200

    renamed = f"{slug}-renombrado"
    patched = client.patch(
        f"/v1/admin/posts/{post_id}", headers=admin_headers, json={"slug": renamed}
    )
    assert patched.status_code == 200, patched.text

    redirects = client.get("/v1/admin/redirects", headers=admin_headers)
    assert redirects.status_code == 200
    redirect_pairs = {(item["from_path"], item["to_path"]) for item in redirects.json()["data"]}
    assert (f"/blog/{slug}", f"/blog/{renamed}") in redirect_pairs

    unpublished = client.post(f"/v1/admin/posts/{post_id}/unpublish", headers=admin_headers)
    assert unpublished.status_code == 200
    assert unpublished.json()["data"]["publish_status"] == "draft"
    hidden_again = client.get(
        f"/v1/public/posts/{renamed}",
        headers={"Authorization": "Bearer test-cms-api-token-0123456789abcdef"},
    )
    assert hidden_again.status_code == 404

    archived = client.delete(f"/v1/admin/posts/{post_id}", headers=admin_headers)
    assert archived.status_code == 204
    archived_read = client.get(f"/v1/admin/posts/{post_id}", headers=admin_headers)
    assert archived_read.status_code == 200
    assert archived_read.json()["data"]["publish_status"] == "archived"


def test_publish_requires_title_excerpt_and_content(
    client: TestClient, admin_headers: dict[str, str]
) -> None:
    created = client.post(
        "/v1/admin/posts",
        headers=admin_headers,
        json={"title": "Incompleto", "slug": f"incompleto-{uuid.uuid4().hex[:8]}"},
    )
    assert created.status_code == 201
    post_id = created.json()["data"]["id"]

    failed = client.post(f"/v1/admin/posts/{post_id}/publish", headers=admin_headers)
    assert failed.status_code == 422
    assert failed.headers["content-type"].startswith("application/problem+json")
    fields = {item["field"] for item in failed.json()["errors"]}
    assert {"excerpt", "content_md"} <= fields

    client.delete(f"/v1/admin/posts/{post_id}", headers=admin_headers)


def test_admin_pagination(client: TestClient, admin_headers: dict[str, str]) -> None:
    response = client.get("/v1/admin/posts?limit=2&page=2", headers=admin_headers)
    assert response.status_code == 200
    meta = response.json()["meta"]
    assert meta["page"] == 2
    assert meta["limit"] == 2
    assert meta["total"] >= 3
    assert meta["total_pages"] >= 2
    assert meta["has_prev"] is True


def test_schedule_and_duplicate(client: TestClient, admin_headers: dict[str, str]) -> None:
    slug = f"programado-{uuid.uuid4().hex[:8]}"
    created = client.post("/v1/admin/posts", headers=admin_headers, json=_post_payload(slug))
    post_id = created.json()["data"]["id"]

    scheduled = client.post(
        f"/v1/admin/posts/{post_id}/schedule",
        headers=admin_headers,
        json={"scheduled_at": "2030-01-01T12:00:00Z"},
    )
    assert scheduled.status_code == 200, scheduled.text
    assert scheduled.json()["data"]["scheduled_at"].startswith("2030-01-01T12:00:00")

    cancelled = client.delete(f"/v1/admin/posts/{post_id}/schedule", headers=admin_headers)
    assert cancelled.status_code == 200
    assert cancelled.json()["data"]["scheduled_at"] is None

    duplicated = client.post(f"/v1/admin/posts/{post_id}/duplicate", headers=admin_headers)
    assert duplicated.status_code == 201
    copy = duplicated.json()["data"]
    assert copy["publish_status"] == "draft"
    assert copy["id"] != post_id
    assert copy["slug"].startswith(f"{slug}-copia")

    client.delete(f"/v1/admin/posts/{post_id}", headers=admin_headers)
    client.delete(f"/v1/admin/posts/{copy['id']}", headers=admin_headers)


def test_seed_is_idempotent(client: TestClient, public_headers: dict[str, str]) -> None:
    import os
    import subprocess
    import sys
    from pathlib import Path

    service_dir = Path(__file__).resolve().parents[1]
    for _ in range(2):
        subprocess.run(
            [sys.executable, "-m", "app.seed"],
            cwd=service_dir,
            check=True,
            env=os.environ.copy(),
            capture_output=True,
        )

    posts = client.get("/v1/public/posts", headers=public_headers)
    assert posts.json()["meta"]["total"] == 3
    tags = client.get("/v1/public/tags", headers=public_headers)
    assert len(tags.json()["data"]) == 11
    projects = client.get("/v1/public/projects", headers=public_headers)
    assert projects.json()["meta"]["total"] == 3
