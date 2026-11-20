from __future__ import annotations

import re
from datetime import datetime
from enum import StrEnum
from typing import Annotated, Literal
from uuid import UUID

from pydantic import AnyHttpUrl, BaseModel, ConfigDict, Field, PlainSerializer, field_validator

from ryoko_common.pagination import PageMeta
from ryoko_common.time import ensure_utc


def _iso(value: datetime) -> str:
    return ensure_utc(value).isoformat().replace("+00:00", "Z")


UTCDateTime = Annotated[datetime, PlainSerializer(_iso, return_type=str, when_used="json")]
SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


class PublishStatus(StrEnum):
    draft = "draft"
    published = "published"
    archived = "archived"


class ProjectLifecycleStatus(StrEnum):
    live = "live"
    wip = "wip"
    archived = "archived"


class UserRole(StrEnum):
    admin = "admin"
    editor = "editor"


class DocumentKind(StrEnum):
    cv = "cv"
    certificate = "certificate"
    other = "other"


class RedirectStatus(StrEnum):
    moved = "301"
    permanent = "308"


class PostType(StrEnum):
    article = "article"
    note = "note"


class Link(BaseModel):
    label: str
    href: str


class ContactLink(BaseModel):
    label: str
    url: str
    icon: str


class CTA(BaseModel):
    label: str
    href: str


class MediaVariant(BaseModel):
    width: int
    url: str


class MediaRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    url: str
    width: int
    height: int
    mime_type: str
    size_bytes: int
    alt: str
    blurhash: str | None = None
    variants: list[MediaVariant] = Field(default_factory=list)
    created_at: UTCDateTime


class Seo(BaseModel):
    title: str | None = Field(default=None, max_length=70)
    description: str | None = Field(default=None, max_length=160)
    og_image: str | None = None
    canonical_url: str | None = None
    noindex: bool = False


class SeoInput(BaseModel):
    title: str | None = Field(default=None, max_length=70)
    description: str | None = Field(default=None, max_length=160)
    og_image_id: UUID | None = None
    canonical_url: AnyHttpUrl | None = None
    noindex: bool = False


class SeoUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=70)
    description: str | None = Field(default=None, max_length=160)
    og_image_id: UUID | None = None
    canonical_url: AnyHttpUrl | None = None
    noindex: bool | None = None


class AuthorRead(BaseModel):
    id: UUID
    name: str
    alias: str | None = None
    avatar: MediaRead | None = None
    bio: str | None = None
    github_url: str | None = None
    linkedin_url: str | None = None


class TagRead(BaseModel):
    id: UUID
    slug: str
    name: str
    description: str | None = None
    post_count: int


class PostSummaryRead(BaseModel):
    id: UUID
    slug: str
    title: str
    excerpt: str
    cover: MediaRead | None
    tags: list[TagRead]
    published_at: UTCDateTime | None
    updated_at: UTCDateTime
    reading_time_minutes: int
    featured: bool
    publish_status: PublishStatus
    type: PostType
    seo: Seo


class PostRead(PostSummaryRead):
    content_md: str
    author: AuthorRead


class GitHubMetadata(BaseModel):
    stars: int
    forks: int
    open_issues: int
    language: str | None = None
    languages: list[dict[str, str | float]]
    last_commit_at: UTCDateTime
    license: str | None = None
    html_url: str
    homepage: str | None = None


class ProjectSummaryRead(BaseModel):
    id: UUID
    slug: str
    title: str
    summary: str
    cover: MediaRead | None
    stack: list[str]
    year: int
    updated_at: UTCDateTime
    publish_status: PublishStatus
    lifecycle_status: ProjectLifecycleStatus
    featured: bool
    repo_url: str | None = None
    demo_url: str | None = None
    sort_order: int
    seo: Seo


class ProjectRead(ProjectSummaryRead):
    case_study_md: str
    gallery: list[MediaRead]
    github: GitHubMetadata | None = None
    role: str | None = None
    team: list[str] = Field(default_factory=list)
    learnings: list[str] = Field(default_factory=list)


class Social(BaseModel):
    label: str
    url: str
    icon: str


class Footer(BaseModel):
    note: str
    links: list[Link]


class Features(BaseModel):
    ads_enabled: bool = False


class SiteSettings(BaseModel):
    site_name: str
    tagline: str
    description: str = Field(max_length=160)
    url: str
    locale: str
    author: AuthorRead
    socials: list[Social]
    nav: list[Link]
    footer: Footer
    seo_defaults: Seo
    features: Features


class HeroSection(BaseModel):
    eyebrow: str
    title: str
    alias: str
    statement: str
    primary_cta: CTA
    secondary_cta: CTA
    portrait: MediaRead | None = None


class TimelineEntry(BaseModel):
    year: int
    title: str
    description: str | None = None


class Fact(BaseModel):
    label: str
    value: str


class AboutSection(BaseModel):
    title: str
    body_md: str
    photo: MediaRead | None = None
    highlights: list[str]
    facts: list[Fact]
    timeline: list[TimelineEntry]


class StackItem(BaseModel):
    name: str
    icon: str | None = None


class StackCategory(BaseModel):
    category: str
    items: list[StackItem]


class Certification(BaseModel):
    title: str
    issuer: str
    date: str
    url: str | None = None


class ContactSection(BaseModel):
    title: str
    body: str
    email: str
    links: list[ContactLink]


class Landing(BaseModel):
    hero: HeroSection
    about: AboutSection
    stack: list[StackCategory]
    certifications: list[Certification]
    contact: ContactSection


class DocumentRead(BaseModel):
    id: UUID
    title: str
    kind: DocumentKind
    url: str
    mime_type: str
    size_bytes: int
    created_at: UTCDateTime


class RedirectRead(BaseModel):
    id: UUID
    from_path: str
    to_path: str
    status: Literal[301, 308]
    created_at: UTCDateTime


class PageMetaRead(BaseModel):
    page: int
    limit: int
    total: int
    total_pages: int
    has_next: bool
    has_prev: bool

    @classmethod
    def from_meta(cls, meta: PageMeta) -> PageMetaRead:
        return cls(
            page=meta.page,
            limit=meta.limit,
            total=meta.total,
            total_pages=meta.total_pages,
            has_next=meta.has_next,
            has_prev=meta.has_prev,
        )


class AdminPost(PostRead):
    cover_media_id: UUID | None = None
    tag_ids: list[UUID] = Field(default_factory=list)
    og_image_id: UUID | None = None
    scheduled_at: UTCDateTime | None = None
    created_at: UTCDateTime


class AdminProject(ProjectRead):
    cover_media_id: UUID | None = None
    og_image_id: UUID | None = None
    gallery_media_ids: list[UUID] = Field(default_factory=list)
    github_repo: str | None = None
    created_at: UTCDateTime


class PostCreate(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    slug: str | None = Field(default=None, max_length=200)
    excerpt: str = Field(default="", max_length=240)
    content_md: str = Field(default="", max_length=200_000)
    cover_media_id: UUID | None = None
    tag_ids: list[UUID] = Field(default_factory=list)
    publish_status: PublishStatus = PublishStatus.draft
    type: PostType = PostType.article
    featured: bool = False
    scheduled_at: datetime | None = None
    seo: SeoInput = Field(default_factory=SeoInput)

    @field_validator("slug")
    @classmethod
    def validate_slug(cls, value: str | None) -> str | None:
        if value is not None and not SLUG_RE.fullmatch(value):
            raise ValueError("El slug debe estar en kebab-case.")
        return value


class PostUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=120)
    slug: str | None = Field(default=None, max_length=200)
    excerpt: str | None = Field(default=None, max_length=240)
    content_md: str | None = Field(default=None, max_length=200_000)
    cover_media_id: UUID | None = None
    tag_ids: list[UUID] | None = None
    type: PostType | None = None
    featured: bool | None = None
    scheduled_at: datetime | None = None
    seo: SeoUpdate | None = None

    @field_validator("slug")
    @classmethod
    def validate_slug(cls, value: str | None) -> str | None:
        if value is not None and not SLUG_RE.fullmatch(value):
            raise ValueError("El slug debe estar en kebab-case.")
        return value


class PublishInput(BaseModel):
    published_at: datetime | None = None


class ScheduleInput(BaseModel):
    scheduled_at: datetime


class ProjectCreate(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    slug: str | None = Field(default=None, max_length=200)
    summary: str = Field(default="", max_length=240)
    case_study_md: str = Field(default="", max_length=200_000)
    cover_media_id: UUID | None = None
    gallery_media_ids: list[UUID] = Field(default_factory=list)
    stack: list[str] = Field(default_factory=list)
    year: int = Field(ge=2000, le=2100)
    publish_status: PublishStatus = PublishStatus.draft
    lifecycle_status: ProjectLifecycleStatus = ProjectLifecycleStatus.wip
    featured: bool = False
    repo_url: AnyHttpUrl | None = None
    demo_url: AnyHttpUrl | None = None
    github_repo: str | None = None
    sort_order: int = 0
    role: str | None = None
    team: list[str] = Field(default_factory=list)
    learnings: list[str] = Field(default_factory=list)
    seo: SeoInput = Field(default_factory=SeoInput)

    @field_validator("slug")
    @classmethod
    def validate_slug(cls, value: str | None) -> str | None:
        if value is not None and not SLUG_RE.fullmatch(value):
            raise ValueError("El slug debe estar en kebab-case.")
        return value


class ProjectUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=120)
    slug: str | None = Field(default=None, max_length=200)
    summary: str | None = Field(default=None, max_length=240)
    case_study_md: str | None = Field(default=None, max_length=200_000)
    cover_media_id: UUID | None = None
    stack: list[str] | None = None
    year: int | None = Field(default=None, ge=2000, le=2100)
    lifecycle_status: ProjectLifecycleStatus | None = None
    featured: bool | None = None
    repo_url: AnyHttpUrl | None = None
    demo_url: AnyHttpUrl | None = None
    github_repo: str | None = None
    sort_order: int | None = None
    role: str | None = None
    team: list[str] | None = None
    learnings: list[str] | None = None
    seo: SeoUpdate | None = None

    @field_validator("slug")
    @classmethod
    def validate_slug(cls, value: str | None) -> str | None:
        if value is not None and not SLUG_RE.fullmatch(value):
            raise ValueError("El slug debe estar en kebab-case.")
        return value


class GalleryInput(BaseModel):
    media_ids: list[UUID]


class TagCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    slug: str = Field(max_length=100)
    description: str | None = None

    @field_validator("slug")
    @classmethod
    def validate_slug(cls, value: str) -> str:
        if not SLUG_RE.fullmatch(value):
            raise ValueError("El slug debe estar en kebab-case.")
        return value


class TagUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    slug: str | None = Field(default=None, max_length=100)
    description: str | None = None

    @field_validator("slug")
    @classmethod
    def validate_slug(cls, value: str | None) -> str | None:
        if value is not None and not SLUG_RE.fullmatch(value):
            raise ValueError("El slug debe estar en kebab-case.")
        return value


class MediaUpdate(BaseModel):
    alt: str = Field(min_length=1, max_length=200)


class RedirectCreate(BaseModel):
    from_path: str = Field(min_length=1, max_length=500)
    to_path: str = Field(min_length=1, max_length=500)
    status: Literal[301, 308] = 301

    @field_validator("from_path", "to_path")
    @classmethod
    def validate_path(cls, value: str) -> str:
        if not value.startswith("/"):
            raise ValueError("La ruta debe iniciar con /.")
        return value


class SettingsPatch(BaseModel):
    model_config = ConfigDict(extra="allow")
