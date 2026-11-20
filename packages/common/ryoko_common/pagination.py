from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass(frozen=True)
class PageMeta:
    page: int
    limit: int
    total: int
    total_pages: int
    has_next: bool
    has_prev: bool

    def as_dict(self) -> dict[str, int | bool]:
        return {
            "page": self.page,
            "limit": self.limit,
            "total": self.total,
            "total_pages": self.total_pages,
            "has_next": self.has_next,
            "has_prev": self.has_prev,
        }


def page_meta(*, page: int, limit: int, total: int) -> PageMeta:
    total_pages = max(1, math.ceil(total / limit)) if limit else 1
    safe_page = min(max(page, 1), total_pages)
    return PageMeta(
        page=safe_page,
        limit=limit,
        total=total,
        total_pages=total_pages,
        has_next=safe_page < total_pages,
        has_prev=safe_page > 1,
    )
