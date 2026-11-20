"""Export machine-readable API contracts for the platform.

Usage (from the repository root):

    uv run python scripts/export_openapi.py all
    uv run python scripts/export_openapi.py content-api
    uv run python scripts/export_openapi.py webhook-api
    uv run python scripts/export_openapi.py metrics-api

The script is intentionally dependency-free beyond the services themselves so
it can run locally and in CI. Each service is imported in its own process
(from the caller) to avoid ``app`` module name collisions.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

SERVICES = {
    "content-api": ROOT / "docs" / "openapi" / "content-api.json",
    "webhook-api": ROOT / "docs" / "openapi" / "webhook-api.json",
}


def export_openapi(service: str) -> Path:
    sys.path.insert(0, str(ROOT / "services" / service))
    from app.main import app  # noqa: PLC0415 - deliberate late import

    destination = SERVICES[service]
    destination.parent.mkdir(parents=True, exist_ok=True)
    snapshot = app.openapi()
    snapshot["info"]["version"] = snapshot["info"].get("version", "0.1.0")
    destination.write_text(
        json.dumps(snapshot, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return destination


def export_metrics_sdl() -> Path:
    sys.path.insert(0, str(ROOT / "services" / "metrics-api"))
    from strawberry.printer import print_schema  # noqa: PLC0415

    from app.schema import schema  # noqa: PLC0415

    destination = ROOT / "docs" / "metrics-api" / "schema.graphql"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(print_schema(schema) + "\n", encoding="utf-8")
    return destination


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: export_openapi.py <content-api|webhook-api|metrics-api>")
    service = sys.argv[1]
    if service == "metrics-api":
        path = export_metrics_sdl()
    else:
        path = export_openapi(service)
    print(f"wrote {path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
