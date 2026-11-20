"""End-to-end smoke test for the local API stack.

Requires the three services running on 127.0.0.1:8000/8001/8002 and the seeded
admin user. Creates a temporary post, tag and redirect, then cleans up.

Usage:

    uv run python scripts/smoke_admin.py
"""

from __future__ import annotations

import os
import sys

import httpx

CONTENT_API = os.environ.get("CONTENT_API_URL", "http://127.0.0.1:8000")
WEBHOOK_API = os.environ.get("WEBHOOK_API_URL", "http://127.0.0.1:8001")
METRICS_API = os.environ.get("METRICS_API_URL", "http://127.0.0.1:8002")
EMAIL = os.environ.get("SEED_ADMIN_EMAIL", "hola@ryuheirg.dev")
PASSWORD = os.environ.get("SEED_ADMIN_PASSWORD", "ryoko-dev-password")
PUBLIC_TOKEN = os.environ.get("CMS_API_TOKEN", "dev-cms-api-token-0123456789abcdef")

failures: list[str] = []


def check(condition: bool, message: str) -> None:
    status = "ok" if condition else "FAIL"
    print(f"[{status}] {message}")
    if not condition:
        failures.append(message)


def main() -> int:
    with httpx.Client(timeout=20) as client:
        login = client.post(
            f"{CONTENT_API}/v1/auth/token",
            data={"username": EMAIL, "password": PASSWORD},
        )
        check(login.status_code == 200, f"login returns 200 (got {login.status_code})")
        tokens = login.json()
        access = tokens["access_token"]
        refresh = tokens["refresh_token"]
        check(tokens["token_type"] == "bearer", "token_type is bearer")
        check(bool(tokens["user"]["name"]), "login returns user")

        auth = {"Authorization": f"Bearer {access}"}
        me = client.get(f"{CONTENT_API}/v1/auth/me", headers=auth)
        check(me.status_code == 200, f"GET /v1/auth/me (got {me.status_code})")

        posts = client.get(f"{CONTENT_API}/v1/admin/posts?limit=5", headers=auth)
        check(posts.status_code == 200, f"GET admin posts (got {posts.status_code})")
        seeded = posts.json()["data"]

        # Create -> update -> publish -> unpublish -> archive a throwaway post.
        payload = {
            "title": "Smoke test post",
            "slug": f"smoke-test-{os.getpid()}",
            "excerpt": "Temporary post created by scripts/smoke_admin.py",
            "content_md": "# Smoke\n\nHello from the smoke test.",
            "type": "note",
            "tag_ids": [],
            "featured": False,
            "seo": {
                "title": None,
                "description": None,
                "og_image_id": None,
                "canonical_url": None,
                "noindex": True,
            },
        }
        created = client.post(f"{CONTENT_API}/v1/admin/posts", headers=auth, json=payload)
        check(created.status_code == 201, f"create post (got {created.status_code})")
        post = created.json()["data"]
        post_id = post["id"]

        patched = client.patch(
            f"{CONTENT_API}/v1/admin/posts/{post_id}",
            headers=auth,
            json={"title": "Smoke test post (edited)"},
        )
        check(patched.status_code == 200, f"patch post (got {patched.status_code})")

        publish = client.post(f"{CONTENT_API}/v1/admin/posts/{post_id}/publish", headers=auth)
        check(publish.status_code == 200, f"publish post (got {publish.status_code})")
        check(
            isinstance(publish.json()["data"].get("webhook_event_id"), str),
            "publish returns webhook_event_id",
        )

        preview = client.get(f"{CONTENT_API}/v1/admin/posts/{post_id}/preview", headers=auth)
        check(preview.status_code == 200, f"post preview (got {preview.status_code})")

        unpublish = client.post(f"{CONTENT_API}/v1/admin/posts/{post_id}/unpublish", headers=auth)
        check(unpublish.status_code == 200, f"unpublish post (got {unpublish.status_code})")

        archived = client.delete(f"{CONTENT_API}/v1/admin/posts/{post_id}", headers=auth)
        check(archived.status_code == 204, f"archive post (got {archived.status_code})")

        # Tags: create, update, delete.
        tag_slug = f"smoke-tag-{os.getpid()}"
        tag = client.post(
            f"{CONTENT_API}/v1/admin/tags",
            headers=auth,
            json={"name": "Smoke tag", "slug": tag_slug, "description": None},
        )
        check(tag.status_code == 201, f"create tag (got {tag.status_code})")
        tag_id = tag.json()["data"]["id"]
        tag_patch = client.patch(
            f"{CONTENT_API}/v1/admin/tags/{tag_id}",
            headers=auth,
            json={"description": "smoke"},
        )
        check(tag_patch.status_code == 200, f"patch tag (got {tag_patch.status_code})")
        tag_delete = client.delete(f"{CONTENT_API}/v1/admin/tags/{tag_id}", headers=auth)
        check(tag_delete.status_code == 204, f"delete tag (got {tag_delete.status_code})")

        # Redirects: create, list, delete.
        redirect = client.post(
            f"{CONTENT_API}/v1/admin/redirects",
            headers=auth,
            json={
                "from_path": f"/blog/smoke-{os.getpid()}",
                "to_path": "/blog",
                "status": 301,
            },
        )
        check(redirect.status_code == 201, f"create redirect (got {redirect.status_code})")
        redirect_id = redirect.json()["data"]["id"]
        redirect_list = client.get(f"{CONTENT_API}/v1/admin/redirects", headers=auth)
        check(redirect_list.status_code == 200, "list redirects")
        redirect_delete = client.delete(
            f"{CONTENT_API}/v1/admin/redirects/{redirect_id}", headers=auth
        )
        check(redirect_delete.status_code == 204, "delete redirect")

        # Landing and settings round-trip.
        landing = client.get(f"{CONTENT_API}/v1/admin/landing", headers=auth)
        check(landing.status_code == 200, f"GET landing (got {landing.status_code})")
        landing_put = client.put(
            f"{CONTENT_API}/v1/admin/landing", headers=auth, json=landing.json()["data"]
        )
        check(landing_put.status_code == 200, f"PUT landing (got {landing_put.status_code})")

        settings = client.get(f"{CONTENT_API}/v1/admin/settings", headers=auth)
        check(settings.status_code == 200, f"GET settings (got {settings.status_code})")
        settings_put = client.put(
            f"{CONTENT_API}/v1/admin/settings", headers=auth, json=settings.json()["data"]
        )
        check(settings_put.status_code == 200, f"PUT settings (got {settings_put.status_code})")

        # Catalog reads.
        for path in ("/v1/admin/media?limit=5", "/v1/admin/documents", "/v1/admin/redirects"):
            response = client.get(f"{CONTENT_API}{path}", headers=auth)
            check(response.status_code == 200, f"GET {path} (got {response.status_code})")

        # Public contract reads (read-only token from the frontend build).
        public = {"Authorization": f"Bearer {PUBLIC_TOKEN}"}
        for path in (
            "/v1/public/posts",
            "/v1/public/projects",
            "/v1/public/tags",
            "/v1/public/landing",
            "/v1/public/site",
            "/v1/public/redirects",
        ):
            response = client.get(f"{CONTENT_API}{path}", headers=public)
            check(response.status_code == 200, f"GET {path} (got {response.status_code})")

        # Webhook inbox.
        events = client.get(f"{WEBHOOK_API}/v1/admin/events?limit=5", headers=auth)
        check(events.status_code == 200, f"GET webhook events (got {events.status_code})")
        if events.status_code == 200 and events.json()["data"]:
            event_id = events.json()["data"][0]["event_id"]
            detail = client.get(f"{WEBHOOK_API}/v1/admin/events/{event_id}", headers=auth)
            check(detail.status_code == 200, "GET webhook event detail")
            retry = client.post(f"{WEBHOOK_API}/v1/admin/events/{event_id}/retry", headers=auth)
            check(retry.status_code in (200, 202), f"retry webhook (got {retry.status_code})")

        # Metrics GraphQL with the same admin JWT.
        from datetime import UTC, datetime, timedelta

        now = datetime.now(UTC)
        metrics = client.post(
            f"{METRICS_API}/graphql",
            headers=auth,
            json={
                "query": (
                    "query($range: DateRangeInput!) {"
                    " pageViews(range: $range) { total points { date value } }"
                    " realtime(window_minutes: 60)"
                    " }"
                ),
                "variables": {
                    "range": {
                        "from": (now - timedelta(days=7)).isoformat().replace("+00:00", "Z"),
                        "to": now.isoformat().replace("+00:00", "Z"),
                    }
                },
            },
        )
        check(metrics.status_code == 200, f"metrics GraphQL (got {metrics.status_code})")
        check(
            "errors" not in metrics.json(), f"metrics GraphQL has no errors: {metrics.text[:400]}"
        )

        # Refresh + logout.
        refreshed = client.post(f"{CONTENT_API}/v1/auth/refresh", json={"refresh_token": refresh})
        check(refreshed.status_code == 200, f"refresh token (got {refreshed.status_code})")
        logout = client.post(
            f"{CONTENT_API}/v1/auth/logout",
            json={"refresh_token": refreshed.json()["refresh_token"]},
        )
        check(logout.status_code in (200, 204), f"logout (got {logout.status_code})")

        check(len(seeded) >= 3, "seed exposes at least 3 posts")

    if failures:
        print(f"\n{len(failures)} check(s) failed")
        return 1
    print("\nAll smoke checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
