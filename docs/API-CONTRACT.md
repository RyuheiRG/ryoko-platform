# API-CONTRACT.md — Contrato de las tres APIs

> Fuente de verdad para construir el CMS y el frontend de Ryoko.
> Versión del contrato: **v1**.
> Cualquier cambio incompatible requiere `/v2` o una migración documentada.

## 1. Principios

1. **El CMS no sirve HTML.** Administra contenido y lo expone como datos.
2. **El blog es estático.** Astro consume la Content API en build time; el navegador no consulta contenido.
3. **El webhook no lo consume el navegador.** Es tráfico servidor-a-servidor.
4. **Las métricas son lo único que el navegador envía.** Se envían después del load, sin bloquear la UI.
5. **Contrato primero, implementación después.** El frontend se construye contra mocks con estos mismos schemas.
6. **Nada de secretos en el cliente.** El token de administración vive solo en el CMS.

## 2. Arquitectura

```text
┌──────────────────────────────┐
│ CMS (FastAPI)                │
│                              │
│  Content API (REST)          │──── build time ────┐
│  Webhook API                 │                    │
│  Metrics API (GraphQL)       │◀── eventos ────────┼── navegador
└──────────────┬───────────────┘                    │
               │ publica                            │
               ▼                                    ▼
        n8n / Webhook ──▶ Vercel Deploy Hook ──▶ Astro build ──▶ Vercel CDN
```

Flujo de publicación:

1. El editor publica en el CMS.
2. La Content API cambia el estado y emite un evento a la Webhook API.
3. La Webhook API valida la firma, guarda el evento y llama a n8n.
4. n8n llama al Deploy Hook de Vercel.
5. Vercel ejecuta `pnpm build`.
6. Astro consulta la Content API, valida con Zod y genera el sitio.
7. Vercel publica el nuevo deploy.
8. n8n envía una notificación (Discord/Telegram).

## 3. Convenciones generales

| Tema | Regla |
|---|---|
| Base URLs | `https://api.ryuheirg.dev` (Content), `https://hooks.ryuheirg.dev` (Webhook), `https://metrics.ryuheirg.dev` (Metrics) |
| Versión | Prefijo `/v1` en REST; GraphQL en `/graphql` |
| Formato | JSON UTF-8; `Content-Type: application/json` |
| Fechas | ISO 8601 UTC, con `Z`: `2026-11-15T18:00:00Z` |
| IDs | UUID v4/v7 en strings |
| Nombres JSON | `snake_case` (Pythonic). El frontend los mapea a `camelCase` en su adaptador |
| Dinero | No aplica |
| Booleanos | `true` / `false` |
| Nulos | `null` explícito, nunca omitir campos obligatorios |
| Paginación | `page` (1-based), `limit` (default 10, max 50 público / 100 admin) |
| Orden | `sort=campo` ascendente; `sort=-campo` descendente |
| Orden por defecto | Posts: `-published_at`; proyectos: `sort_order`; tags: `name` |
| Errores | RFC 7807 (`application/problem+json`) |
| Idempotencia | `Idempotency-Key` opcional en POST admin; obligatorio en webhooks y métricas |
| Caché | `ETag` + `Cache-Control` en endpoints públicos |
| CORS | Solo donde se necesita: Metrics API y admin UI. La Content API pública es server-side |
| Rate limit | Ver tabla por API |
| HTTPS | Obligatorio en todos los entornos excepto localhost |

### Formato de error (RFC 7807)

```json
{
  "type": "https://api.ryuheirg.dev/errors/validation",
  "title": "Validation error",
  "status": 422,
  "detail": "El campo slug ya existe.",
  "instance": "/v1/admin/posts",
  "errors": [
    { "field": "slug", "code": "unique", "message": "Ya existe un post con ese slug." }
  ],
  "request_id": "req_01J..."
}
```

### Paginación

```json
{
  "data": [],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 42,
    "total_pages": 5,
    "has_next": true,
    "has_prev": false
  }
}
```

### Envelope

- Listas: `{ "data": [...], "meta": {...} }`
- Recurso individual: `{ "data": {...} }`
- Acción sin cuerpo: `204 No Content`
- Acción con resultado: `{ "data": {...} }`

## 4. Content API

### 4.1 Responsabilidad

Administrar y servir:

- Posts y tags.
- Proyectos y sus medios.
- Landing (hero, about, stack, certificaciones, contacto).
- Site settings.
- Media y documentos.
- Redirects.

No renderiza HTML. No sirve el blog. No recibe métricas.

### 4.2 Autenticación

#### Admin

- `POST /v1/auth/token` con `application/x-www-form-urlencoded`: `username`, `password`.
- Devuelve JWT de acceso (30 min) y refresh token (7 días).
- Hash de contraseñas: **Argon2id**.
- Roles: `admin`, `editor`.
- Header: `Authorization: Bearer <access_token>`.
- Refresh: `POST /v1/auth/refresh` con `{ "refresh_token": "..." }`.
- Logout: `POST /v1/auth/logout` revoca el refresh token.
- `GET /v1/auth/me` devuelve el usuario actual.
- Provisión de usuarios: seed o CLI; no hay endpoints de gestión de usuarios en v1.

#### Público (build)

- Los endpoints `/v1/public/*` (excepto `health`) requieren un token de solo lectura:
  `Authorization: Bearer <CMS_API_TOKEN>`.
- Ese token solo puede leer; no puede escribir ni acceder a `/v1/admin/*`.
- El token vive en Vercel como variable de entorno y nunca llega al navegador.

### 4.3 Modelo de datos

```text
users 1──* posts
posts *──* tags            (post_tags)
posts 1──0..1 media          (cover)
posts 1──0..1 media          (og_image)
projects 1──* project_media *──1 media
projects 1──0..1 media        (cover)
projects 1──0..1 media        (og_image)
landing_sections
site_settings
documents
redirects
```

### 4.4 Enums

| Enum | Valores |
|---|---|
| `PublishStatus` | `draft`, `published`, `archived` (aplica a posts y proyectos) |
| `ProjectLifecycleStatus` | `live`, `wip`, `archived` (estado real del proyecto) |
| `UserRole` | `admin`, `editor` |
| `DocumentKind` | `cv`, `certificate`, `other` |
| `LandingSectionKey` | `hero`, `about`, `stack`, `certifications`, `contact` |
| `RedirectStatus` | `301`, `308` |

### 4.5 Schemas

> **Lectura vs escritura.** Los schemas de esta sección describen responses. En requests de administración se envían IDs (`cover_media_id`, `og_image_id`, `tag_ids`, `gallery_media_ids`); en responses se devuelven objetos resueltos (`cover`, `seo.og_image`, `tags`, `gallery`).
>
> Campos solo de administración: `scheduled_at`, `github_repo`, `tag_ids`, `cover_media_id`, `og_image_id` y `gallery_media_ids`.

#### `SEO`

| Campo | Tipo | Requerido | Notas |
|---|---|---|---|
| `title` | string(70) | no | Si falta, se usa el título del recurso |
| `description` | string(160) | no | Si falta, se usa el excerpt |
| `og_image` | Media \| null | no | 1200×630 recomendado |
| `canonical_url` | string(url) \| null | no | Default: se calcula en el frontend (`/blog/{slug}` o `/proyectos/{slug}`) |
| `noindex` | boolean | no | Default `false` |

#### `Media`

| Campo | Tipo | Requerido | Notas |
|---|---|---|---|
| `id` | UUID | sí | |
| `url` | string(url) | sí | Absoluta, HTTPS |
| `width` | int | sí | Píxeles |
| `height` | int | sí | Píxeles |
| `mime_type` | string | sí | `image/avif`, `image/webp`, `image/jpeg`, `image/png` |
| `size_bytes` | int | sí | |
| `alt` | string(200) | sí | Accesibilidad |
| `blurhash` | string \| null | no | Placeholder |
| `variants` | `{ width: int, url: string }[]` | no | Variantes 400/800/1200; si falta, usar `url` |
| `created_at` | datetime | sí | |

#### `Tag`

| Campo | Tipo | Requerido |
|---|---|---|
| `id` | UUID | sí |
| `slug` | string | sí |
| `name` | string | sí |
| `description` | string \| null | no |
| `post_count` | int | sí (solo en listados públicos) |

#### `Author`

| Campo | Tipo | Requerido |
|---|---|---|
| `id` | UUID | sí |
| `name` | string | sí |
| `alias` | string \| null | no |
| `avatar` | Media \| null | no |
| `bio` | string \| null | no |
| `github_url` | string(url) \| null | no |
| `linkedin_url` | string(url) \| null | no |

#### `PostSummary`

| Campo | Tipo | Requerido | Notas |
|---|---|---|---|
| `id` | UUID | sí | |
| `slug` | string | sí | Único, kebab-case |
| `title` | string(120) | sí | |
| `excerpt` | string(240) | sí | |
| `cover` | Media \| null | no | 16:10 recomendado |
| `tags` | Tag[] | sí | Puede ser vacío |
| `published_at` | datetime | sí | |
| `updated_at` | datetime | sí | |
| `reading_time_minutes` | int | sí | Calculado en el CMS |
| `featured` | boolean | sí | |
| `publish_status` | `PublishStatus` | sí | En endpoints públicos siempre es `published` |
| `type` | `article` \| `note` | sí | Default `article` |
| `seo` | SEO | sí | |

#### `Post`

`PostSummary` +:

| Campo | Tipo | Requerido | Notas |
|---|---|---|---|
| `content_md` | string | sí | Markdown, máximo 200 KB |
| `author` | Author | sí | Canonical y noindex viven solo en `seo` |

#### `ProjectSummary`

| Campo | Tipo | Requerido | Notas |
|---|---|---|---|
| `id` | UUID | sí | |
| `slug` | string | sí | |
| `title` | string(120) | sí | |
| `summary` | string(240) | sí | |
| `cover` | Media \| null | no | 16:10 |
| `stack` | string[] | sí | Ej. `["Python", "FastAPI"]` |
| `year` | int | sí | |
| `updated_at` | datetime | sí | Para `lastmod` del sitemap |
| `publish_status` | `PublishStatus` | sí | En endpoints públicos siempre es `published` |
| `lifecycle_status` | `ProjectLifecycleStatus` | sí | Estado real del proyecto; no confundir con `publish_status` |
| `featured` | boolean | sí | |
| `repo_url` | string(url) \| null | no | |
| `demo_url` | string(url) \| null | no | |
| `sort_order` | int | sí | Menor primero |
| `seo` | SEO | sí | |

#### `Project`

`ProjectSummary` +:

| Campo | Tipo | Requerido | Notas |
|---|---|---|---|
| `case_study_md` | string | sí | Markdown |
| `gallery` | Media[] | sí | Puede ser vacío |
| `github` | GitHubMetadata \| null | no | Enriquecido en build |
| `role` | string \| null | no | Ej. "Full stack" |
| `team` | string[] | no | Nombres o "Individual" |
| `learnings` | string[] | no | Bullets para el cierre |

> `github_repo` (`owner/repo`) es un campo de administración que se usa para enriquecer `github` en build. No se incluye en la respuesta pública. `canonical_url` y `noindex` viven solo en `seo`.

#### `GitHubMetadata`

| Campo | Tipo |
|---|---|
| `stars` | int |
| `forks` | int |
| `open_issues` | int |
| `language` | string \| null |
| `languages` | `{ name: string, percent: number }[]` |
| `last_commit_at` | datetime |
| `license` | string \| null |
| `html_url` | string(url) |
| `homepage` | string(url) \| null |

> Regla de UI: si `stars < 3`, no mostrar estrellas. Mostrar stack y estado.

#### `SiteSettings`

| Campo | Tipo | Requerido | Notas |
|---|---|---|---|
| `site_name` | string | sí | "Ryoko" |
| `tagline` | string | sí | |
| `description` | string(160) | sí | SEO default |
| `url` | string(url) | sí | `https://ryuheirg.dev` |
| `locale` | string | sí | `es-MX` |
| `author` | Author | sí | |
| `socials` | `{ label, url, icon }[]` | sí | |
| `nav` | `{ label, href }[]` | sí | |
| `footer` | `{ note, links }` | sí | |
| `seo_defaults` | SEO | sí | |
| `features` | `{ ads_enabled: boolean }` | sí | v1: `false` |

#### `Landing`

| Campo | Tipo | Notas |
|---|---|---|
| `hero.eyebrow` | string | "Full Stack + Security" |
| `hero.title` | string | "Ricardo Reyes Gómez" |
| `hero.alias` | string | "Ryoko" |
| `hero.statement` | string | 1–2 líneas |
| `hero.primary_cta` | `{ label, href }` | |
| `hero.secondary_cta` | `{ label, href }` | |
| `hero.portrait` | Media | |
| `about.title` | string | |
| `about.body_md` | string | Markdown corto |
| `about.photo` | Media | |
| `about.highlights` | string[] | Bullets |
| `about.facts` | `{ label: string, value: string }[]` | Datos rápidos (universidad, semestre, ubicación) |
| `about.timeline` | `{ year: int, title: string, description?: string }[]` | Hitos de la página Sobre mí |
| `stack` | `{ category, items: { name, icon }[] }[]` | |
| `certifications` | `{ title, issuer, date, url }[]` | |
| `contact` | `{ title, body, email, links }` | |

#### `Document`

| Campo | Tipo |
|---|---|
| `id` | UUID |
| `title` | string |
| `kind` | `cv` \| `certificate` \| `other` |
| `url` | string(url) |
| `mime_type` | string |
| `size_bytes` | int |
| `created_at` | datetime |

#### `Redirect`

| Campo | Tipo |
|---|---|
| `id` | UUID |
| `from_path` | string |
| `to_path` | string |
| `status` | `301` \| `308` |
| `created_at` | datetime |

### 4.6 Endpoints de administración

Todos requieren JWT con rol `admin` o `editor`. Prefijo `/v1/admin`.

#### Auth

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/v1/auth/token` | Login (form) |
| POST | `/v1/auth/refresh` | Renovar access token |
| POST | `/v1/auth/logout` | Revocar refresh token |
| GET | `/v1/auth/me` | Usuario actual |

#### Posts

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/v1/admin/posts` | Listar todos los estados. Query: `publish_status`, `q`, `tag`, `page`, `limit`, `sort` |
| POST | `/v1/admin/posts` | Crear post |
| GET | `/v1/admin/posts/{id}` | Obtener post completo |
| PATCH | `/v1/admin/posts/{id}` | Actualizar campos |
| DELETE | `/v1/admin/posts/{id}` | Archivar (soft delete) |
| POST | `/v1/admin/posts/{id}/publish` | Publicar ahora |
| POST | `/v1/admin/posts/{id}/unpublish` | Volver a draft |
| POST | `/v1/admin/posts/{id}/schedule` | Programar publicación (`scheduled_at`) |
| DELETE | `/v1/admin/posts/{id}/schedule` | Cancelar programación |
| POST | `/v1/admin/posts/{id}/duplicate` | Duplicar como draft |
| GET | `/v1/admin/posts/{id}/preview` | URL/token de preview |

**Crear post — request**

```json
{
  "title": "Cómo construí Ryoko",
  "slug": "como-construi-ryoko",
  "excerpt": "Astro, FastAPI y un CMS propio para publicar sin fricción.",
  "content_md": "## Contexto\n\n...",
  "cover_media_id": "6f1c2a8e-...",
  "tag_ids": ["3a1b...", "9c2d..."],
  "publish_status": "draft",
  "featured": true,
  "seo": {
    "title": "Cómo construí Ryoko — Astro + FastAPI",
    "description": "Arquitectura de un blog estático con CMS propio.",
    "og_image_id": null,
    "canonical_url": null,
    "noindex": false
  }
}
```

**Crear post — response `201`**

```json
{
  "data": {
    "id": "0b7f3c2e-...",
    "slug": "como-construi-ryoko",
    "publish_status": "draft",
    "created_at": "2026-11-15T18:00:00Z",
    "updated_at": "2026-11-15T18:00:00Z"
  }
}
```

**Publicar — response `200`**

```json
{
  "data": {
    "id": "0b7f3c2e-...",
    "publish_status": "published",
    "published_at": "2026-11-15T18:05:00Z",
    "webhook_event_id": "8f3c1e9a-4b2d-4f6a-9c7e-1d2f3a4b5c6d"
  }
}
```

Reglas:

- `slug` único; si cambia después de publicar, se crea un redirect automático.
- `published_at` se setea al publicar si no existe.
- `updated_at` cambia en cada PATCH.
- `reading_time_minutes` se calcula con 200 palabras/minuto.
- No se permite publicar sin `title`, `slug`, `excerpt` y `content_md`.
- `cover` es opcional en v1. Si es `null`, el frontend genera una portada tipográfica; no es un error de contrato.
- `DELETE` sobre un post publicado lo archiva y emite `post.unpublished` para retirarlo del build.

#### Projects

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/v1/admin/projects` | Listar. Query: `publish_status`, `lifecycle_status`, `featured`, `page`, `limit`, `sort` |
| POST | `/v1/admin/projects` | Crear |
| GET | `/v1/admin/projects/{id}` | Obtener |
| PATCH | `/v1/admin/projects/{id}` | Actualizar |
| DELETE | `/v1/admin/projects/{id}` | Archivar |
| POST | `/v1/admin/projects/{id}/publish` | Publicar |
| POST | `/v1/admin/projects/{id}/unpublish` | Draft |
| PUT | `/v1/admin/projects/{id}/gallery` | Reemplazar galería (`media_ids[]` ordenados) |

**Crear proyecto — request**

```json
{
  "title": "SecureUP",
  "slug": "secureup",
  "summary": "Verificar contraseñas filtradas sin exponerlas.",
  "case_study_md": "## Problema\n\n...",
  "cover_media_id": "a1b2...",
  "gallery_media_ids": ["c3d4...", "e5f6..."],
  "stack": ["Kotlin", "Jetpack Compose", "Room", "Retrofit", "ML Kit"],
  "year": 2026,
  "publish_status": "published",
  "lifecycle_status": "live",
  "featured": true,
  "repo_url": "https://github.com/RyuheiRG/SecureUP",
  "demo_url": null,
  "github_repo": "RyuheiRG/SecureUP",
  "sort_order": 2,
  "role": "Desarrollo Android",
  "team": ["Individual"],
  "learnings": [
    "El k-anonimato permite verificar sin enviar la contraseña.",
    "Room y StateFlow simplifican el historial reactivo."
  ],
  "seo": {
    "title": "SecureUP — seguridad móvil sin exponer contraseñas",
    "description": "Case study de una app Android con k-anonimato, QR y Room."
  }
}
```

Reglas:

- `publish_status` controla la visibilidad; `lifecycle_status` describe el estado real del proyecto.
- `DELETE` sobre un proyecto publicado lo archiva y emite `project.unpublished`.
- Cambiar el slug de un proyecto publicado crea un redirect.
- `github_repo` es solo de administración.

#### Tags

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/v1/admin/tags` | Listar |
| POST | `/v1/admin/tags` | Crear `{ name, slug, description }` |
| PATCH | `/v1/admin/tags/{id}` | Actualizar |
| DELETE | `/v1/admin/tags/{id}` | Eliminar si no tiene posts |

#### Landing

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/v1/admin/landing` | Obtener todas las secciones |
| PUT | `/v1/admin/landing` | Reemplazar el documento completo |
| PATCH | `/v1/admin/landing/{section}` | Actualizar una sección (`hero`, `about`, `stack`, `certifications`, `contact`) |

`GET` response:

```json
{
  "data": {
    "hero": {
      "eyebrow": "Full Stack + Security",
      "title": "Ricardo Reyes Gómez",
      "alias": "Ryoko",
      "statement": "Construyo software con mentalidad Zero Trust: verifico cada capa y documento las decisiones.",
      "primary_cta": { "label": "Ver proyectos", "href": "/proyectos" },
      "secondary_cta": { "label": "Leer el blog", "href": "/blog" },
      "portrait": { "...": "Media" }
    },
    "about": { "...": "..." },
    "stack": [],
    "certifications": [],
    "contact": { "...": "..." }
  }
}
```

#### Media

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/v1/admin/media` | Listar. Query: `q`, `page`, `limit` |
| POST | `/v1/admin/media` | Subir archivo (`multipart/form-data`: `file`, `alt`) |
| PATCH | `/v1/admin/media/{id}` | Actualizar `alt` |
| DELETE | `/v1/admin/media/{id}` | Eliminar si no está en uso |

Reglas:

- Formatos: AVIF, WebP, JPEG, PNG.
- Tamaño máximo: 10 MB.
- Dimensiones máximas: 6000×6000.
- Validar MIME real, no solo extensión.
- Generar variantes: `original`, `1200w`, `800w`, `400w`.
- Guardar `width`, `height`, `alt`, `blurhash`.
- Almacenamiento: S3-compatible (Cloudflare R2) o Cloudinary.
- URLs absolutas HTTPS.

**Subir media — response `201`**

```json
{
  "data": {
    "id": "6f1c2a8e-...",
    "url": "https://media.ryuheirg.dev/posts/ryoko/cover.avif",
    "width": 1600,
    "height": 1000,
    "mime_type": "image/avif",
    "size_bytes": 184320,
    "alt": "Portada del post Cómo construí Ryoko",
    "blurhash": "LKO2?U%2Tw=w]~RBVZRi};RPxuwH",
    "variants": [
      { "width": 1200, "url": "https://media.ryuheirg.dev/posts/ryoko/cover-1200.avif" },
      { "width": 800, "url": "https://media.ryuheirg.dev/posts/ryoko/cover-800.avif" },
      { "width": 400, "url": "https://media.ryuheirg.dev/posts/ryoko/cover-400.avif" }
    ],
    "created_at": "2026-11-15T18:00:00Z"
  }
}
```

#### Documents

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/v1/admin/documents` | Listar |
| POST | `/v1/admin/documents` | Subir PDF (`file`, `title`, `kind`) |
| DELETE | `/v1/admin/documents/{id}` | Eliminar |

Formatos: PDF. Tamaño máximo: 20 MB.

#### Settings

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/v1/admin/settings` | Obtener |
| PUT | `/v1/admin/settings` | Reemplazar |
| PATCH | `/v1/admin/settings` | Actualizar campos |

#### Redirects

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/v1/admin/redirects` | Listar |
| POST | `/v1/admin/redirects` | Crear `{ from_path, to_path, status }` |
| DELETE | `/v1/admin/redirects/{id}` | Eliminar |

### 4.7 Endpoints públicos

Requieren `Authorization: Bearer <CMS_API_TOKEN>` todos los endpoints excepto `/v1/public/health`. Solo lectura. `Cache-Control: private, max-age=60, stale-while-revalidate=300` y `Vary: Authorization`.

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/v1/public/site` | Site settings + navegación |
| GET | `/v1/public/landing` | Landing completa |
| GET | `/v1/public/posts` | Posts publicados. Query: `page`, `limit`, `tag`, `featured`, `q`, `sort` |
| GET | `/v1/public/posts/{slug}` | Post completo por slug |
| GET | `/v1/public/posts/{slug}/related` | Relacionados. Query: `limit` (default 3, max 6) |
| GET | `/v1/public/projects` | Proyectos publicados. Query: `page`, `limit`, `featured`, `stack`, `sort` |
| GET | `/v1/public/projects/{slug}` | Proyecto completo |
| GET | `/v1/public/tags` | Tags con `post_count` |
| GET | `/v1/public/tags/{slug}` | Tag + posts publicados |
| GET | `/v1/public/redirects` | Redirects para generar configuración de Vercel |
| GET | `/v1/public/health` | Health check público |

Formas de respuesta:

- `/v1/public/posts/{slug}/related` → `{ "data": [PostSummary] }` (sin `meta`).
- `/v1/public/tags/{slug}` → `{ "data": { "tag": Tag, "posts": [PostSummary] } }`.
- `/v1/public/redirects` → `{ "data": [Redirect] }`.

#### `GET /v1/public/posts?page=1&limit=10&tag=astro` — response

```json
{
  "data": [
    {
      "id": "0b7f3c2e-...",
      "slug": "como-construi-ryoko",
      "title": "Cómo construí Ryoko",
      "excerpt": "Astro, FastAPI y un CMS propio para publicar sin fricción.",
      "cover": {
        "id": "6f1c2a8e-...",
        "url": "https://media.ryuheirg.dev/posts/ryoko/cover.avif",
        "width": 1600,
        "height": 1000,
        "mime_type": "image/avif",
        "size_bytes": 184320,
        "alt": "Portada del post",
        "blurhash": "LKO2?U%2Tw=w]~RBVZRi};RPxuwH",
        "created_at": "2026-11-15T18:00:00Z"
      },
      "tags": [
        { "id": "3a1b...", "slug": "astro", "name": "Astro", "description": null, "post_count": 1 }
      ],
      "published_at": "2026-11-15T18:05:00Z",
      "updated_at": "2026-11-15T18:05:00Z",
      "reading_time_minutes": 8,
      "featured": true,
      "publish_status": "published",
      "type": "article",
      "seo": {
        "title": "Cómo construí Ryoko — Astro + FastAPI",
        "description": "Arquitectura de un blog estático con CMS propio.",
        "og_image": null,
        "canonical_url": null,
        "noindex": false
      }
    }
  ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 1,
    "total_pages": 1,
    "has_next": false,
    "has_prev": false
  }
}
```

#### `GET /v1/public/posts/como-construi-ryoko` — response

````json
{
  "data": {
    "id": "0b7f3c2e-...",
    "slug": "como-construi-ryoko",
    "title": "Cómo construí Ryoko",
    "excerpt": "Astro, FastAPI y un CMS propio para publicar sin fricción.",
    "content_md": "## Contexto\n\nRyoko es mi sitio personal...\n\n```ts\nconst site = 'ryuheirg.dev';\n```\n",
    "cover": { "...": "Media" },
    "tags": [{ "...": "Tag" }],
    "published_at": "2026-11-15T18:05:00Z",
    "updated_at": "2026-11-15T18:05:00Z",
    "reading_time_minutes": 8,
    "featured": true,
    "publish_status": "published",
    "type": "article",
    "author": {
      "id": "1a2b...",
      "name": "Ricardo Reyes Gómez",
      "alias": "Ryoko",
      "avatar": { "...": "Media" },
      "bio": "Estudiante de ITID en UPChiapas...",
      "github_url": "https://github.com/RyuheiRG",
      "linkedin_url": "https://www.linkedin.com/in/ryuhei-rg/"
    },
    "seo": { "...": "SEO" }
  }
}
````

#### `GET /v1/public/landing` — response

```json
{
  "data": {
    "hero": {
      "eyebrow": "Full Stack + Security",
      "title": "Ricardo Reyes Gómez",
      "alias": "Ryoko",
      "statement": "Construyo software con mentalidad Zero Trust: verifico cada capa y documento las decisiones.",
      "primary_cta": { "label": "Ver proyectos", "href": "/proyectos" },
      "secondary_cta": { "label": "Leer el blog", "href": "/blog" },
      "portrait": { "...": "Media" }
    },
    "about": {
      "title": "Sobre mí",
      "body_md": "Soy Ricardo...",
      "photo": { "...": "Media" },
      "highlights": ["Full stack", "Security first", "Clean code"],
      "facts": [
        { "label": "Universidad", "value": "UPChiapas" },
        { "label": "Semestre", "value": "4.º cuatrimestre" },
        { "label": "Ubicación", "value": "Chiapas, México" }
      ],
      "timeline": [
        { "year": 2025, "title": "Inicio en UPChiapas" },
        { "year": 2026, "title": "Frame-Data-Bayes, SecureUP, Vaca Cúbica" }
      ]
    },
    "stack": [
      {
        "category": "Lenguajes",
        "items": [
          { "name": "TypeScript", "icon": "typescript" },
          { "name": "Python", "icon": "python" }
        ]
      }
    ],
    "certifications": [
      {
        "title": "AWS Academy Graduate - Cloud Foundations",
        "issuer": "Amazon Web Services",
        "date": "2025-11-21",
        "url": null
      }
    ],
    "contact": {
      "title": "Hablemos",
      "body": "¿Tienes una idea o una pregunta?",
      "email": "hola@ryuheirg.dev",
      "links": [
        { "label": "GitHub", "url": "https://github.com/RyuheiRG" },
        { "label": "LinkedIn", "url": "https://www.linkedin.com/in/ryuhei-rg/" }
      ]
    }
  }
}
```

### 4.8 Reglas de Markdown

- CommonMark + GFM: tablas, tachado, task lists, autolinks, footnotes.
- HTML crudo **prohibido**. El frontend sanitiza con `rehype-sanitize`.
- El título va en `title`, no en `content_md`. El contenido empieza en `##`.
- Bloques de código con lenguaje: ```` ```ts ````.
- Imágenes: `![alt](https://media.ryuheirg.dev/...)`. Si hay título, se usa como caption:
  `![Diagrama de arquitectura](https://... "Arquitectura del CMS")`.
- Enlaces externos: el frontend agrega `rel="noopener noreferrer"` y `target="_blank"` (con icono).
- Callouts v1: blockquote con negrita al inicio.
  ```md
  > **Nota:** el webhook reintenta hasta 5 veces.
  ```
- No iframes, no scripts, no formularios, no HTML embebido.
- Tamaño máximo de `content_md`: 200 KB.
- Reading time: 200 palabras/minuto, mínimo 1.

### 4.9 Publicación, preview y redirects

- `draft` → `published`: setea `published_at`, dispara webhook `post.published`.
- `published` → `draft`: `post.unpublished`, dispara rebuild para retirarlo.
- `PATCH` sobre publicado: `post.updated`, dispara rebuild.
- Cambios de slug en posts y proyectos publicados crean un redirect; los tags no generan redirect en v1.
- `scheduled_at`: un job (APScheduler o cron de n8n) publica a la hora; dispara el mismo webhook.
- Preview:
  - `GET /v1/admin/posts/{id}/preview` devuelve `{ "url": "https://preview.ryuheirg.dev/blog/slug?token=..." }`.
  - El token es firmado, expira en 24 h, solo permite leer drafts.
  - El build de preview usa `CMS_PREVIEW_TOKEN`; el token se pasa al build, no se valida en runtime porque el sitio es estático.
- Redirects:
  - Si cambia un slug publicado, el CMS crea un registro en `redirects` con `status: 301`.
  - `GET /v1/public/redirects` devuelve la lista.
  - En v1 el build genera páginas estáticas de redirección con `astro.config` `redirects` (meta refresh + canonical). No son 301 reales.
  - Para 301 reales en Vercel se mantiene `vercel.json` en el repo o se automatiza su commit vía GitHub API; queda como v1.1.

### 4.10 Rate limits

| Ámbito | Límite |
|---|---|
| Público (token de build) | 120 req/min |
| Admin (JWT) | 600 req/min |
| Login | 10 intentos/min por IP |
| Media upload | 30 req/min |

Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `Retry-After` en 429.

## 5. Webhook API

### 5.1 Responsabilidad

Recibir eventos del CMS, validarlos, persistirlos y disparar automatizaciones (n8n → Vercel). No es una API pública para el navegador.

### 5.2 Endpoint

`POST https://hooks.ryuheirg.dev/v1/events`

Headers:

| Header | Valor |
|---|---|
| `Content-Type` | `application/json` |
| `X-Ryoko-Event-Id` | UUID único del evento |
| `X-Ryoko-Event-Type` | Ej. `post.published` |
| `X-Ryoko-Timestamp` | Unix timestamp en segundos |
| `X-Ryoko-Signature` | `sha256=<hex>` |

Firma:

```text
signature = HMAC_SHA256(secret, timestamp + "." + raw_body)
```

Validación:

- Comparar en tiempo constante.
- Rechazar si `abs(now - timestamp) > 300` segundos.
- Rechazar si `X-Ryoko-Event-Id` no coincide con `event_id` del body, o si `X-Ryoko-Event-Type` no coincide con `type`.
- Si `event_id` ya existe, no reprocesar y responder `202` (idempotente).
- Body máximo: 1 MB.

Respuesta:

```json
{
  "data": {
    "event_id": "8f3c1e9a-4b2d-4f6a-9c7e-1d2f3a4b5c6d",
    "status": "accepted",
    "received_at": "2026-11-15T18:05:00Z"
  }
}
```

Códigos:

| Código | Significado |
|---|---|
| 202 | Aceptado y encolado |
| 400 | JSON inválido o headers faltantes |
| 401 | Firma inválida |
| 429 | Rate limit |
| 500 | Error interno |

### 5.3 Envelope

```json
{
  "event_id": "8f3c1e9a-4b2d-4f6a-9c7e-1d2f3a4b5c6d",
  "type": "post.published",
  "occurred_at": "2026-11-15T18:05:00Z",
  "api_version": "v1",
  "data": {
    "post_id": "0b7f3c2e-...",
    "slug": "como-construi-ryoko",
    "publish_status": "published",
    "published_at": "2026-11-15T18:05:00Z",
    "url": "https://ryuheirg.dev/blog/como-construi-ryoko"
  },
  "metadata": {
    "actor_id": "1a2b...",
    "source": "content-api"
  }
}
```

Regla: el payload incluye lo mínimo para decidir y notificar. El receptor puede consultar la Content API para obtener el recurso completo.

### 5.4 Tipos de evento

| Evento | Cuándo | `data` |
|---|---|---|
| `post.published` | Post pasa a published | `post_id`, `slug`, `publish_status`, `published_at`, `url` |
| `post.updated` | PATCH sobre published | `post_id`, `slug`, `publish_status`, `updated_at`, `url` |
| `post.unpublished` | Published → draft/archived | `post_id`, `slug`, `publish_status`, `url` |
| `project.published` | Proyecto pasa a published | `project_id`, `slug`, `publish_status`, `lifecycle_status`, `url` |
| `project.updated` | PATCH sobre published | `project_id`, `slug`, `publish_status`, `lifecycle_status`, `updated_at`, `url` |
| `project.unpublished` | Published → draft/archived | `project_id`, `slug`, `publish_status`, `url` |
| `tag.created` | Nuevo tag | `tag_id`, `slug`, `name` |
| `tag.updated` | Cambia nombre, slug o descripción | `tag_id`, `slug`, `name` |
| `tag.deleted` | Tag eliminado | `tag_id`, `slug` |
| `document.created` | Se sube un documento (CV) | `document_id`, `kind`, `url` |
| `document.deleted` | Se elimina un documento | `document_id`, `kind` |
| `landing.updated` | Cambia cualquier sección de landing | `sections`: string[] |
| `settings.updated` | Cambia site settings | `keys`: string[] |
| `media.updated` | Cambia alt/metadata de media usada | `media_id`, `url` |
| `redirect.created` | Nuevo redirect | `from_path`, `to_path`, `status` |

`tag.*`, `document.*`, `landing.updated`, `settings.updated`, `media.updated` y `redirect.created` también disparan rebuild porque cambian páginas, assets o configuración del sitio.

### 5.5 Entrega y reintentos

- Responder `202` en < 500 ms.
- Persistir el evento antes de llamar a n8n.
- Reintentos: 5 intentos con backoff exponencial: 1 min, 5 min, 15 min, 1 h, 6 h.
- Después de 5 fallos: `dead_letter`.
- Idempotencia por `event_id`.
- Log de cada intento: `attempt`, `status_code`, `error`, `duration_ms`.
- Si n8n falla, fallback directo a `VERCEL_DEPLOY_HOOK_URL`.
- Si Vercel falla, notificar a Discord/Telegram y marcar `failed`.

### 5.6 Flujo n8n

1. La Webhook API llama a n8n después de persistir el evento.
2. n8n verifica `event_id` y un secreto compartido; no revalida la firma HMAC del CMS.
3. Switch por `type`.
4. HTTP Request al Deploy Hook de Vercel.
5. Opcional: consultar Vercel API para confirmar deploy.
6. Notificación a Discord/Telegram con slug, URL y estado.
7. Error workflow: reintentar y avisar.

### 5.7 Endpoints de administración

Requieren JWT de administrador con el mismo `JWT_SECRET`, issuer y algoritmo que la Content API.

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/v1/admin/events` | Listar eventos. Query: `status`, `type`, `page`, `limit` |
| GET | `/v1/admin/events/{id}` | Detalle + intentos |
| POST | `/v1/admin/events/{id}/retry` | Reintentar manualmente |

`WebhookEvent`:

| Campo | Tipo |
|---|---|
| `id` | UUID |
| `event_id` | UUID |
| `type` | string |
| `status` | `queued` \| `processing` \| `delivered` \| `failed` \| `dead_letter` |
| `attempts` | int |
| `last_error` | string \| null |
| `received_at` | datetime |
| `processed_at` | datetime \| null |
| `payload` | object |

`WebhookAttempt`:

| Campo | Tipo |
|---|---|
| `attempt` | int |
| `status_code` | int \| null |
| `error` | string \| null |
| `duration_ms` | int |
| `created_at` | datetime |

### 5.8 Seguridad

- HMAC SHA-256 con secreto de 32+ bytes.
- Timestamp anti-replay.
- Rate limit: 60 req/min por IP.
- IP allowlist opcional para la IP del CMS.
- CORS solo para `https://cms.ryuheirg.dev` en endpoints admin; `/v1/events` es servidor-a-servidor.
- No loggear el body completo si contiene datos sensibles.
- HTTPS obligatorio.

## 6. Metrics API (GraphQL)

### 6.1 Responsabilidad

Ingerir eventos del blog y exponer consultas agregadas para el dashboard del CMS. No es una API de contenido.

Endpoint: `POST https://metrics.ryuheirg.dev/graphql`

### 6.2 Auth

| Operación | Auth |
|---|---|
| `trackEvent`, `trackEvents` | Header `X-Site-Key: <public_site_key>` + CORS |
| Queries del dashboard | `Authorization: Bearer <JWT>` con rol `admin` |

`X-Site-Key` no es un secreto crítico: identifica el sitio y permite rate limiting. No permite leer datos. El servidor resuelve el `site_id` a partir de esta key; el cliente no puede elegir el sitio.

Los JWT del dashboard los emite la Content API con el **mismo** `JWT_SECRET`, issuer y algoritmo que la Metrics API, para que un token de administrador sirva en ambas.

### 6.3 Schema SDL

```graphql
scalar DateTime
scalar Date
scalar UUID
scalar JSON

enum EventType {
  PAGE_VIEW
  POST_VIEW
  PROJECT_VIEW
  OUTBOUND_CLICK
  AD_IMPRESSION
  AD_CLICK
}

input TrackEventInput {
  event_id: UUID!
  type: EventType!
  path: String!
  post_slug: String
  project_slug: String
  ad_id: String
  referrer: String
  session_id: String!
  occurred_at: DateTime!
  properties: JSON
}

type TrackEventPayload {
  ok: Boolean!
  event_id: UUID!
  duplicate: Boolean!
}

type TrackEventsPayload {
  accepted: Int!
  duplicates: Int!
}

input DateRangeInput {
  from: DateTime!
  to: DateTime!
}

type TimeSeriesPoint {
  date: Date!
  value: Int!
}

type TimeSeries {
  total: Int!
  points: [TimeSeriesPoint!]!
}

type TopPost {
  slug: String!
  title: String
  views: Int!
}

type ProjectClicks {
  slug: String!
  clicks: Int!
}

type OutboundClick {
  url: String!
  clicks: Int!
}

type AdMetrics {
  impressions: Int!
  clicks: Int!
  ctr: Float!
}

type Query {
  pageViews(range: DateRangeInput!, path: String): TimeSeries!
  topPosts(range: DateRangeInput!, limit: Int = 10): [TopPost!]!
  projectClicks(range: DateRangeInput!): [ProjectClicks!]!
  outboundClicks(range: DateRangeInput!, limit: Int = 20): [OutboundClick!]!
  adMetrics(range: DateRangeInput!, ad_id: String): AdMetrics!
  realtime(window_minutes: Int = 5): Int!
}

type Mutation {
  trackEvent(input: TrackEventInput!): TrackEventPayload!
  trackEvents(input: [TrackEventInput!]!): TrackEventsPayload!
}
```

### 6.4 Ejemplo de mutación

```graphql
mutation Track($input: TrackEventInput!) {
  trackEvent(input: $input) {
    ok
    event_id
    duplicate
  }
}
```

```json
{
  "input": {
    "event_id": "5e2f7c1a-...",
    "type": "PAGE_VIEW",
    "path": "/blog/como-construi-ryoko",
    "post_slug": "como-construi-ryoko",
    "project_slug": null,
    "ad_id": null,
    "referrer": "https://github.com/RyuheiRG",
    "session_id": "s_9f2c...",
    "occurred_at": "2026-11-15T18:10:00Z",
    "properties": {
      "device": "mobile",
      "utm_source": "github"
    }
  }
}
```

Response:

```json
{
  "data": {
    "trackEvent": {
      "ok": true,
      "event_id": "5e2f7c1a-...",
      "duplicate": false
    }
  }
}
```

### 6.5 Ejemplo de query

```graphql
query Dashboard($range: DateRangeInput!) {
  pageViews(range: $range) {
    total
    points { date value }
  }
  topPosts(range: $range, limit: 5) {
    slug
    title
    views
  }
  projectClicks(range: $range) {
    slug
    clicks
  }
  outboundClicks(range: $range, limit: 10) {
    url
    clicks
  }
  adMetrics(range: $range) {
    impressions
    clicks
    ctr
  }
}
```

### 6.6 Eventos que envía el blog

| Evento | Cuándo | Campos |
|---|---|---|
| `PAGE_VIEW` | Load de cualquier página | `path` |
| `POST_VIEW` | Load de un post | `path`, `post_slug` |
| `PROJECT_VIEW` | Load de un proyecto | `path`, `project_slug` |
| `OUTBOUND_CLICK` | Click a GitHub, LinkedIn, demo, fuente externa | `path`, `project_slug` (si aplica), `properties.url` |
| `AD_IMPRESSION` | Solo si `features.ads_enabled` | `ad_id` |
| `AD_CLICK` | Solo si `features.ads_enabled` | `ad_id` |

`projectClicks` cuenta `OUTBOUND_CLICK` con `project_slug`; `PROJECT_VIEW` se consulta con `pageViews(path: "/proyectos/{slug}")`.

Implementación frontend:

- `fetch(..., { keepalive: true, mode: "cors" })` como mecanismo principal, para no bloquear la navegación.
- No usar `navigator.sendBeacon`: no permite enviar el header `X-Site-Key`.
- No enviar si `navigator.doNotTrack === "1"` o `navigator.connection?.saveData === true`.
- `session_id` aleatorio en `sessionStorage`, no cookie.
- `event_id` UUID generado en cliente.
- No enviar PII, ni query strings con datos personales.
- Reintentar una vez si falla; luego descartar.

### 6.7 Privacidad

- Sin cookies.
- Sin fingerprinting.
- IP no se guarda en crudo: se hashea con SHA-256 + salt diario, o se descarta.
- `referrer` se trunca a 200 caracteres y se limpia de query strings sensibles.
- `occurred_at` se valida contra la hora del servidor (±10 min); los agregados usan `received_at`.
- `country` opcional desde header del CDN; no ciudad.
- Retención de eventos crudos: 90 días.
- Agregados: 2 años.
- No se comparte con terceros.
- Página `/privacidad` si se requiere; con analytics sin cookies no se necesita banner.

### 6.8 Rate limits

| Ámbito | Límite |
|---|---|
| Ingesta por sesión/IP | 120 eventos/min |
| Batch | máximo 20 eventos por request |
| Dashboard | 60 req/min por usuario |

### 6.9 CORS

Orígenes permitidos:

- `https://ryuheirg.dev`
- `https://www.ryuheirg.dev`
- `https://cms.ryuheirg.dev` (dashboard)
- `https://*.vercel.app` (solo previews del proyecto)
- `http://localhost:4321` (solo desarrollo)

Métodos: `POST`, `OPTIONS`. Headers: `Content-Type`, `X-Site-Key`, `Authorization`.

## 7. Cross-cutting

### 7.1 Matriz de consumo

| Funcionalidad | API | Momento |
|---|---|---|
| Home, blog, proyectos, about | Content API `/v1/public/*` | Build |
| CMS admin | Content API `/v1/admin/*` + Auth | Runtime admin |
| Publicar/actualizar | Webhook API `/v1/events` | Runtime CMS |
| Rebuild | n8n → Vercel Deploy Hook | Runtime webhook |
| Page views y clicks | Metrics API `trackEvent` | Navegador |
| Dashboard de métricas | Metrics API `Query` | Runtime admin |

### 7.2 Variables de entorno

#### Frontend

| Variable | Ejemplo | Secreto |
|---|---|---|
| `CMS_API_URL` | `https://api.ryuheirg.dev` | no |
| `CMS_API_TOKEN` | `...` | sí |
| `CMS_PREVIEW_TOKEN` | `...` | sí |
| `CMS_USE_MOCKS` | `false` | no |
| `METRICS_API_URL` | `https://metrics.ryuheirg.dev/graphql` | no |
| `METRICS_SITE_KEY` | `...` | no (público) |
| `METRICS_DEBUG` | `false` | no |
| `GITHUB_TOKEN` | `ghp_...` | sí |
| `PUBLIC_SITE_URL` | `https://ryuheirg.dev` | no |

#### CMS / Content API

| Variable | Ejemplo | Secreto |
|---|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://...` | sí |
| `JWT_SECRET` | 32+ bytes | sí |
| `JWT_ALGORITHM` | `HS256` | no |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `30` | no |
| `REFRESH_TOKEN_EXPIRE_DAYS` | `7` | no |
| `CMS_API_TOKEN` | `...` | sí |
| `WEBHOOK_URL` | `https://hooks.ryuheirg.dev/v1/events` | no |
| `WEBHOOK_SECRET` | 32+ bytes | sí |
| `MEDIA_BUCKET` | `ryoko-media` | no |
| `MEDIA_ENDPOINT` | `https://...r2.cloudflarestorage.com` | no |
| `MEDIA_ACCESS_KEY` | `...` | sí |
| `MEDIA_SECRET_KEY` | `...` | sí |
| `CORS_ORIGINS` | `https://cms.ryuheirg.dev` | no |
| `REDIS_URL` | `redis://...` | sí |

> `CMS_API_TOKEN` es el mismo token de solo lectura que usa el frontend en build. No puede escribir ni acceder a `/v1/admin/*`.

#### Webhook API

| Variable | Ejemplo | Secreto |
|---|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://...` | sí |
| `JWT_SECRET` | 32+ bytes | sí (mismo que Content API) |
| `WEBHOOK_SECRET` | 32+ bytes | sí |
| `N8N_WEBHOOK_URL` | `https://n8n.../webhook/...` | sí |
| `N8N_SHARED_SECRET` | 32+ bytes | sí |
| `VERCEL_DEPLOY_HOOK_URL` | `https://api.vercel.com/v1/integrations/deploy/...` | sí |
| `DISCORD_WEBHOOK_URL` | `https://discord.com/api/webhooks/...` | sí |
| `CORS_ORIGINS` | `https://cms.ryuheirg.dev` | no |
| `REDIS_URL` | `redis://...` | sí |
| `MAX_ATTEMPTS` | `5` | no |

#### Metrics API

| Variable | Ejemplo | Secreto |
|---|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://...` | sí |
| `JWT_SECRET` | 32+ bytes | sí (mismo valor que Content API) |
| `SITE_ID` | `ryoko` | no |
| `SITE_KEY` | `...` | no (público) |
| `IP_HASH_SALT` | `...` | sí |
| `CORS_ORIGINS` | `https://ryuheirg.dev,...` | no |
| `REDIS_URL` | `redis://...` | sí |
| `RETENTION_DAYS` | `90` | no |

#### Secretos compartidos

| Secreto | Servicios que deben usar el mismo valor |
|---|---|
| `JWT_SECRET` | Content API, Webhook API, Metrics API |
| `WEBHOOK_SECRET` | Content API, Webhook API |
| `CMS_API_TOKEN` | Content API, build del frontend |
| `SITE_KEY` | Metrics API, frontend (es público) |

> En el frontend la variable se llama `METRICS_SITE_KEY`; su valor es exactamente el mismo que `SITE_KEY` en la Metrics API. `SITE_ID` solo existe en la Metrics API y no lo envía el cliente.

### 7.3 Tablas PostgreSQL

#### Content API

```sql
users (id uuid pk, email citext unique, password_hash text, role text,
       display_name text null, alias text null, avatar_media_id uuid null, bio text null,
       github_url text null, linkedin_url text null, created_at timestamptz)
posts (id uuid pk, slug citext unique, title text, excerpt text, content_md text,
       cover_media_id uuid null, publish_status text, type text, featured bool, published_at timestamptz,
       scheduled_at timestamptz null, reading_time_minutes int, author_id uuid,
       seo_title text, seo_description text, og_media_id uuid null,
       canonical_url text null, noindex bool, created_at timestamptz, updated_at timestamptz)
tags (id uuid pk, slug citext unique, name text, description text null)
post_tags (post_id uuid, tag_id uuid, pk(post_id, tag_id))
projects (id uuid pk, slug citext unique, title text, summary text, case_study_md text,
          cover_media_id uuid null, stack text[], year int, publish_status text,
          lifecycle_status text,
          featured bool, sort_order int, repo_url text null, demo_url text null,
          github_repo text null, role text null, team text[], learnings text[],
          seo_title text, seo_description text, og_media_id uuid null,
          canonical_url text null, noindex bool, created_at timestamptz, updated_at timestamptz)
project_media (project_id uuid, media_id uuid, role text, sort_order int, pk(project_id, media_id, role))
media (id uuid pk, url text, storage_key text, width int, height int, mime_type text,
       size_bytes bigint, alt text, blurhash text null, created_at timestamptz)
documents (id uuid pk, title text, kind text, url text, storage_key text, mime_type text,
           size_bytes bigint, created_at timestamptz)
landing_sections (key text pk, content_json jsonb, updated_at timestamptz)
site_settings (id int pk default 1, content_json jsonb, updated_at timestamptz)
redirects (id uuid pk, from_path text unique, to_path text, status int, created_at timestamptz)
refresh_tokens (id uuid pk, user_id uuid, token_hash text, expires_at timestamptz, revoked_at timestamptz null)
```

#### Webhook API

```sql
webhook_events (id uuid pk, event_id uuid unique, event_type text, payload_json jsonb,
                status text, attempts int, last_error text null, received_at timestamptz,
                processed_at timestamptz null)
webhook_attempts (id bigserial pk, event_id uuid, attempt int, status_code int null,
                  error text null, duration_ms int, created_at timestamptz)
```

#### Metrics API

```sql
metrics_events (id bigserial pk, event_id uuid unique, site_id text, event_type text,
                path text, post_slug text null, project_slug text null, ad_id text null,
                referrer text null, session_id text, country text null,
                occurred_at timestamptz, received_at timestamptz, properties_json jsonb)
CREATE INDEX ON metrics_events (occurred_at);
CREATE INDEX ON metrics_events (event_type, occurred_at);
CREATE INDEX ON metrics_events (post_slug, occurred_at);
CREATE INDEX ON metrics_events (project_slug, occurred_at);
```

### 7.4 Deployment

| Servicio | Opción recomendada | Alternativas |
|---|---|---|
| Frontend | Vercel | Cloudflare Pages |
| Content API | Render / Railway / Fly.io | VPS + Docker + Nginx |
| Webhook API | Render / Railway / Fly.io | VPS |
| Metrics API | Render / Railway / Fly.io | VPS |
| PostgreSQL | Neon / Supabase | RDS, Railway |
| Redis (rate limit) | Upstash | Redis local |
| Media | Cloudflare R2 | S3, Cloudinary |
| n8n | Railway / Fly.io | Self-hosted Docker |

Reglas:

- Cada servicio con `/health` y `/ready`.
- HTTPS obligatorio.
- Variables de entorno por entorno (`local`, `staging`, `production`).
- No usar la misma base de datos para staging y producción.
- Redis (Upstash) para rate limiting; en local se puede usar memoria, en producción no.
- Migraciones Alembic al deploy.
- Backups diarios de PostgreSQL.
- Logs JSON con `request_id`.

### 7.5 Testing

- `pytest` + `httpx.AsyncClient`.
- Base de datos de test con Testcontainers o Postgres local.
- Cobertura mínima: 80% en rutas críticas.
- Tests de:
  - Auth y roles.
  - CRUD de posts/proyectos.
  - Publicación y webhook.
  - Firma HMAC (válida, inválida, replay).
  - Idempotencia.
  - GraphQL: mutación, query, rate limit.
  - Validación de media.
- Contract tests: comparar responses con los schemas de este documento.
- OpenAPI snapshot en CI.
- GraphQL schema snapshot en CI.

### 7.6 Checklist de seguridad

- [ ] HTTPS en todos los entornos.
- [ ] JWT con secreto fuerte y expiración corta.
- [ ] Refresh tokens hasheados en DB.
- [ ] Argon2id para contraseñas.
- [ ] Rate limiting en login, público y métricas.
- [ ] CORS restringido.
- [ ] Validación de entrada con Pydantic.
- [ ] Sanitización de Markdown en frontend.
- [ ] Validación de MIME real en uploads.
- [ ] Límite de tamaño en uploads.
- [ ] GraphQL: deshabilitar introspection en producción o restringirla a admin.
- [ ] SSRF protection si se aceptan URLs remotas.
- [ ] No secrets en logs.
- [ ] No secrets en el frontend.
- [ ] Backups y restauración probada.
- [ ] Dependencias auditadas (`pip-audit`, `npm audit`).

### 7.7 Checklist de aceptación del contrato

- [ ] El frontend puede construir todas las páginas con mocks que cumplen estos schemas.
- [ ] El CMS puede publicar un post y disparar el webhook.
- [ ] El webhook dispara el deploy de Vercel.
- [ ] El blog envía `PAGE_VIEW` y `POST_VIEW` a Metrics API.
- [ ] El dashboard consulta `pageViews` y `topPosts`.
- [ ] Un cambio de slug genera redirect.
- [ ] Un post despublicado desaparece del build.
- [ ] Un evento duplicado no se cuenta dos veces.
- [ ] Un intento de escritura sin JWT devuelve 401.
- [ ] Un intento de leer admin con token público devuelve 401.

## 8. Decisiones abiertas para el agente del CMS

1. ¿Monorepo `ryoko-platform` o tres repos? Recomendación: monorepo.
2. ¿Strawberry GraphQL o Ariadne? Recomendación: Strawberry.
3. ¿Cloudflare R2 o Cloudinary? Recomendación: R2.
4. ¿n8n como orquestador principal o solo notificador? Recomendación: principal con fallback directo.
5. ¿Preview de drafts en v1 o v1.1? Recomendación: v1.1 si el tiempo aprieta.
6. ¿Scheduled publishing en v1 o v1.1? Recomendación: schema sí, UI después.

## 9. Referencias rápidas

- Content API OpenAPI: `https://api.ryuheirg.dev/docs` (solo staging/dev).
- Metrics GraphQL Playground: `https://metrics.ryuheirg.dev/graphql` (solo staging/dev).
- Webhook health: `https://hooks.ryuheirg.dev/health`.
- Frontend: `https://ryuheirg.dev`.
