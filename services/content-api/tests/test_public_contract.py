from __future__ import annotations

from fastapi.testclient import TestClient


def test_public_posts_match_the_frontend_contract(
    client: TestClient, public_headers: dict[str, str]
) -> None:
    response = client.get("/v1/public/posts", headers=public_headers)
    assert response.status_code == 200
    assert response.headers["cache-control"].startswith("private, max-age=60")

    body = response.json()
    assert body["meta"] == {
        "page": 1,
        "limit": 50,
        "total": 3,
        "total_pages": 1,
        "has_next": False,
        "has_prev": False,
    }
    slugs = [post["slug"] for post in body["data"]]
    assert slugs == [
        "como-construi-ryoko",
        "zero-trust-aplicado-a-datos",
        "secureup-verificar-contrasenas-sin-enviarlas",
    ]

    for post in body["data"]:
        assert post["cover"] is None
        assert post["publish_status"] == "published"
        assert post["type"] in {"article", "note"}
        assert isinstance(post["tags"], list)
        assert set(post["seo"]) == {
            "title",
            "description",
            "og_image",
            "canonical_url",
            "noindex",
        }
        assert post["seo"]["og_image"] is None or isinstance(post["seo"]["og_image"], str)
        assert post["published_at"].endswith("Z")
        assert post["updated_at"].endswith("Z")


def test_post_detail_includes_content_and_author(
    client: TestClient, public_headers: dict[str, str]
) -> None:
    response = client.get("/v1/public/posts/como-construi-ryoko", headers=public_headers)
    assert response.status_code == 200
    post = response.json()["data"]
    assert post["slug"] == "como-construi-ryoko"
    assert post["content_md"]
    assert post["author"]["name"] == "Ricardo Reyes Gómez"
    assert post["author"]["avatar"]["url"].startswith("http")


def test_public_tags_only_include_published_counts(
    client: TestClient, public_headers: dict[str, str]
) -> None:
    response = client.get("/v1/public/tags", headers=public_headers)
    assert response.status_code == 200
    tags = response.json()["data"]
    assert len(tags) == 11
    assert all(tag["post_count"] > 0 for tag in tags)
    assert {tag["slug"] for tag in tags} == {
        "android",
        "arquitectura",
        "astro",
        "bayes",
        "cms",
        "datos",
        "fastapi",
        "hibp",
        "kotlin",
        "python",
        "seguridad",
    }

    detail = client.get("/v1/public/tags/astro", headers=public_headers)
    assert detail.status_code == 200
    assert detail.json()["data"]["tag"]["slug"] == "astro"
    assert all(post["publish_status"] == "published" for post in detail.json()["data"]["posts"])


def test_public_projects_and_landing(client: TestClient, public_headers: dict[str, str]) -> None:
    projects = client.get("/v1/public/projects", headers=public_headers)
    assert projects.status_code == 200
    body = projects.json()
    assert body["meta"]["total"] == 3
    assert {project["slug"] for project in body["data"]} == {
        "frame-data-bayes",
        "secureup",
        "vaca-cubica",
    }
    for project in body["data"]:
        assert project["publish_status"] == "published"
        assert project["lifecycle_status"] in {"live", "wip", "archived"}
        assert "github_repo" not in project

    detail = client.get("/v1/public/projects/secureup", headers=public_headers)
    assert detail.status_code == 200
    project = detail.json()["data"]
    assert project["case_study_md"]
    assert isinstance(project["gallery"], list)

    landing = client.get("/v1/public/landing", headers=public_headers)
    assert landing.status_code == 200
    assert set(landing.json()["data"]) == {
        "hero",
        "about",
        "stack",
        "certifications",
        "contact",
    }

    site = client.get("/v1/public/site", headers=public_headers)
    assert site.status_code == 200
    assert site.json()["data"]["site_name"] == "Ryoko"


def test_pagination_meta_and_validation(client: TestClient, public_headers: dict[str, str]) -> None:
    first = client.get("/v1/public/posts?limit=2&page=1", headers=public_headers)
    assert first.status_code == 200
    assert first.json()["meta"] == {
        "page": 1,
        "limit": 2,
        "total": 3,
        "total_pages": 2,
        "has_next": True,
        "has_prev": False,
    }
    assert len(first.json()["data"]) == 2

    second = client.get("/v1/public/posts?limit=2&page=2", headers=public_headers)
    assert second.status_code == 200
    assert second.json()["meta"]["has_next"] is False
    assert second.json()["meta"]["has_prev"] is True
    assert len(second.json()["data"]) == 1

    invalid = client.get("/v1/public/posts?limit=0", headers=public_headers)
    assert invalid.status_code == 422
    assert invalid.headers["content-type"].startswith("application/problem+json")
    assert invalid.json()["errors"]
