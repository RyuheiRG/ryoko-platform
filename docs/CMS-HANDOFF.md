# CMS-HANDOFF.md — Brief para construir `ryoko-platform`

> Handoff del frontend al agente que construirá el CMS.
> Frontend validado en `dev-blog-ryoko@03f0597` (rama `main`, pnpm 12.6.0).
> El contrato canónico vive en [`docs/API-CONTRACT.md`](./API-CONTRACT.md). Si algo no está ahí, no lo inventes: repórtalo.

## 1. Qué vas a construir

Un monorepo llamado `ryoko-platform` con:

1. **Content API** (FastAPI REST): autenticación, CRUD de contenido, media, publicación y endpoints públicos de solo lectura.
2. **Webhook API** (FastAPI): recibe eventos del CMS con HMAC, los persiste y dispara el rebuild.
3. **Metrics API** (FastAPI + Strawberry GraphQL): ingiere eventos del navegador y expone métricas agregadas.
4. **Admin UI** (`apps/admin`): panel web para editar contenido, administrar media y consultar métricas.

El frontend Astro ya está terminado y consume el contrato contra mocks. **No modifiques el frontend** para adaptarlo a tu implementación. Si encuentras una diferencia de contrato, repórtala y actualiza `docs/API-CONTRACT.md` y los schemas Zod en el mismo cambio.

## 2. Repositorios y carpetas

| Repo             | Contenido                                 | GitHub                                       |
| ---------------- | ----------------------------------------- | -------------------------------------------- |
| `dev-blog-ryoko` | Frontend Astro + documentación y contrato | `https://github.com/RyuheiRG/dev-blog-ryoko` |
| `ryoko-platform` | CMS completo: 3 APIs + Admin UI + infra   | Crear como repo separado                     |

En disco deben ser carpetas hermanas, no una dentro de otra:

```text
AplicacionesWeb/
├── dev-blog-ryoko/     # frontend, ya existe
└── ryoko-platform/     # CMS, lo crea el agente
```

**No copies el código del frontend al CMS.** Comparte el link del repo y la tabla de lectura de la sección 3. Si el agente no tiene acceso a GitHub, copia solo los documentos (`API-CONTRACT.md`, `AGENTS.md`, `PRODUCT.md` y este handoff) a `ryoko-platform/docs/`; nunca copies `src/`.

### Estructura esperada de `ryoko-platform`

```text
ryoko-platform/
├── AGENTS.md
├── README.md
├── docs/
│   ├── API-CONTRACT.md          # copia o link al contrato
│   └── CMS-HANDOFF.md           # este documento
├── services/
│   ├── content-api/
│   ├── webhook-api/
│   └── metrics-api/
├── apps/
│   └── admin/                   # React + Vite + TypeScript
├── packages/
│   └── common/                  # settings, auth, errores, logging, paginación
├── infra/
│   ├── docker-compose.yml
│   └── deploy/
├── pnpm-workspace.yaml          # solo para apps/admin
└── .env.example
```

## 3. Lectura obligatoria antes de codificar

| Archivo en `dev-blog-ryoko`     | Para qué                                                              |
| ------------------------------- | --------------------------------------------------------------------- |
| `docs/API-CONTRACT.md`          | Fuente de verdad: schemas, endpoints, auth, webhooks, GraphQL, tablas |
| `docs/ROADMAP.md`               | Fases 5, 6, 7 y 7.5; criterios de aceptación                          |
| `docs/FRONTEND-ARCHITECTURE.md` | Cómo consume el frontend la API y qué espera del build                |
| `docs/PRODUCT.md`               | Alcance v1 y límites del producto                                     |
| `AGENTS.md`                     | Reglas de trabajo, seguridad y calidad                                |
| `src/data/schemas.ts`           | Contrato ejecutable en Zod: debe coincidir con Pydantic               |
| `src/lib/cms/queries.ts`        | Endpoints y formas de respuesta que el frontend ya llama              |
| `src/lib/cms/client.ts`         | Auth, timeout, reintentos y manejo de errores                         |
| `src/data/mock/`                | **Seed de referencia** y fixtures de prueba                           |
| `src/scripts/analytics.ts`      | Payload real de métricas que envía el navegador                       |
| `.env.example`                  | Variables compartidas entre frontend y CMS                            |

## 4. Stack

### APIs

- Python 3.12+, FastAPI, Pydantic v2.
- SQLAlchemy 2.0 async + asyncpg, PostgreSQL 16, Alembic.
- Redis para rate limiting y cache.
- Ruff (lint/format), mypy (tipos), pytest + httpx.
- Strawberry GraphQL para Metrics API.
- Docker Compose para desarrollo y despliegue.
- Media en S3-compatible (Cloudflare R2 recomendado) o Cloudinary.

### Admin UI

- React + Vite + TypeScript estricto.
- Tailwind CSS 4 con los tokens de `docs/DESIGN.md`.
- TanStack Query para datos remotos.
- Zod para validar formularios y respuestas.
- **pnpm** como package manager (no npm ni yarn); fijar `packageManager` y versionar `pnpm-lock.yaml`.
- SPA estática desplegada en `cms.ryuheirg.dev`.

### Entorno de desarrollo

El owner trabaja en Windows 11 con WSL2 (Ubuntu) y Docker Desktop. `docker compose` está disponible en PowerShell; no hace falta Rancher Desktop ni instalar Docker Engine a mano.

- **Python 3.12** fijado con `uv`. No usar `pip`, `sudo pip`, `uv pip install --system` ni instalaciones globales.
- Cada servicio debe tener su `pyproject.toml`, `uv.lock` y `.venv` local; o un workspace de `uv` documentado.
- `uv sync` crea el entorno; `uv run ...` ejecuta. `ruff`, `mypy` y `pytest` van como dependencias de desarrollo.
- **Node/pnpm** para `apps/admin`; no npm ni yarn. Fijar `packageManager` y versionar `pnpm-lock.yaml`.
- **Docker Compose v2** (`docker compose`), PostgreSQL 16 y Redis 7 con healthchecks y volúmenes nombrados.
- En Dockerfiles: `uv sync --frozen --no-dev`; nunca `pip install`.
- Incluir `.gitignore` para `.venv/`, `__pycache__/`, `.pytest_cache/`, `.mypy_cache/`, `.ruff_cache/`, `*.pyc` y `.env`; incluir `.dockerignore` y `.gitattributes` con LF para `Dockerfile`, `*.sh` y `compose`.

## 5. Content API

### 5.1 Auth

- `POST /v1/auth/token` con `application/x-www-form-urlencoded` (`username`, `password`).
- Access token JWT de 30 min; refresh token de 7 días.
- Hash de contraseñas con **Argon2id**.
- Roles: `admin` y `editor`.
- `POST /v1/auth/refresh`, `POST /v1/auth/logout`, `GET /v1/auth/me`.
- Provisión de usuarios por seed o CLI. **No hay endpoints de gestión de usuarios en v1.**

### 5.2 Endpoints públicos

Todos requieren `Authorization: Bearer <CMS_API_TOKEN>` excepto `health`. Son de solo lectura.

| Método | Ruta                                                      |
| ------ | --------------------------------------------------------- |
| GET    | `/v1/public/site`                                         |
| GET    | `/v1/public/landing`                                      |
| GET    | `/v1/public/posts?page=&limit=&tag=&featured=&q=&sort=`   |
| GET    | `/v1/public/posts/{slug}`                                 |
| GET    | `/v1/public/posts/{slug}/related?limit=`                  |
| GET    | `/v1/public/projects?page=&limit=&featured=&stack=&sort=` |
| GET    | `/v1/public/projects/{slug}`                              |
| GET    | `/v1/public/tags`                                         |
| GET    | `/v1/public/tags/{slug}`                                  |
| GET    | `/v1/public/redirects`                                    |
| GET    | `/v1/public/health`                                       |

Reglas:

- `limit` máximo público: **50**. El frontend usa `limit=50` para paginar todo.
- `/posts/{slug}/related` → `{ "data": [PostSummary] }` sin `meta`.
- `/tags/{slug}` → `{ "data": { "tag": Tag, "posts": [PostSummary] } }`.
- `/redirects` → `{ "data": [Redirect] }`.
- `Cache-Control: private, max-age=60, stale-while-revalidate=300` y `Vary: Authorization`.
- `CMS_API_TOKEN` solo lee; no puede escribir ni entrar a `/v1/admin/*`.

### 5.3 Endpoints de administración

Todos requieren JWT con rol `admin` o `editor`. Prefijo `/v1/admin`.

| Grupo       | Rutas principales                                                                                          |
| ----------- | ---------------------------------------------------------------------------------------------------------- |
| Posts       | `GET/POST /v1/admin/posts`, `GET/PATCH/DELETE /v1/admin/posts/{id}`                                        |
| Publicación | `POST .../publish`, `POST .../unpublish`, `POST .../schedule`, `DELETE .../schedule`, `POST .../duplicate` |
| Proyectos   | `GET/POST /v1/admin/projects`, `GET/PATCH/DELETE /v1/admin/projects/{id}`, `PUT .../gallery`               |
| Tags        | `GET/POST /v1/admin/tags`, `PATCH/DELETE /v1/admin/tags/{id}`                                              |
| Landing     | `GET/PUT /v1/admin/landing`, `PATCH /v1/admin/landing/{section}`                                           |
| Media       | `GET/POST /v1/admin/media`, `PATCH/DELETE /v1/admin/media/{id}`                                            |
| Documentos  | `GET/POST /v1/admin/documents`, `DELETE /v1/admin/documents/{id}`                                          |
| Settings    | `GET/PUT/PATCH /v1/admin/settings`                                                                         |
| Redirects   | `GET/POST /v1/admin/redirects`, `DELETE /v1/admin/redirects/{id}`                                          |

La lista completa, los requests y las reglas están en `docs/API-CONTRACT.md` §4.6.

### 5.4 Publicación y eventos

- `draft → published`: setea `published_at` y emite `post.published`.
- `published → draft`: emite `post.unpublished`.
- `PATCH` sobre publicado: emite `post.updated`.
- Cambiar el slug de un post o proyecto publicado crea un redirect 301.
- `DELETE` sobre publicado archiva y emite `*.unpublished`.

## 6. Webhook API

Endpoint: `POST /v1/events` (servidor a servidor, no navegador).

Headers:

| Header               | Valor                      |
| -------------------- | -------------------------- |
| `X-Ryoko-Event-Id`   | UUID del evento            |
| `X-Ryoko-Event-Type` | Ej. `post.published`       |
| `X-Ryoko-Timestamp`  | Unix timestamp en segundos |
| `X-Ryoko-Signature`  | `sha256=<hex>`             |

Firma:

```text
signature = HMAC_SHA256(secret, timestamp + "." + raw_body)
```

Validación:

- Comparación en tiempo constante.
- Rechazar si `abs(now - timestamp) > 300`.
- Rechazar si los headers no coinciden con `event_id` y `type` del body.
- `event_id` duplicado: responder `202` sin reprocesar.
- Body máximo: 1 MB.

Entrega:

- Responder `202` en menos de 500 ms.
- Persistir antes de llamar a n8n.
- Reintentos: 1 min, 5 min, 15 min, 1 h, 6 h; después `dead_letter`.
- Fallback directo a `VERCEL_DEPLOY_HOOK_URL` si n8n falla.
- Eventos: `post.*`, `project.*`, `tag.*`, `document.*`, `landing.updated`, `settings.updated`, `media.updated`, `redirect.created`.
- Admin: `GET /v1/admin/events`, `GET /v1/admin/events/{id}`, `POST /v1/admin/events/{id}/retry`.

## 7. Metrics API

Endpoint: `POST /graphql` con Strawberry.

- `trackEvent` y `trackEvents` requieren `X-Site-Key` y CORS.
- Queries del dashboard requieren JWT con rol `admin`.
- `JWT_SECRET`, issuer y algoritmo deben ser los mismos que en Content API.
- Idempotencia por `event_id`; hash de IP con `IP_HASH_SALT`; retención de 90 días.
- No guardar PII.

Queries:

```graphql
pageViews(range: DateRangeInput!, path: String): TimeSeries!
topPosts(range: DateRangeInput!, limit: Int = 10): [TopPost!]!
projectViews(range: DateRangeInput!): [ProjectViews!]!
projectClicks(range: DateRangeInput!): [ProjectClicks!]!
outboundClicks(range: DateRangeInput!, limit: Int = 20): [OutboundClick!]!
adMetrics(range: DateRangeInput!, ad_id: String): AdMetrics!
realtime(window_minutes: Int = 5): Int!
```

Mutaciones:

```graphql
trackEvent(input: TrackEventInput!): TrackEventPayload!
trackEvents(input: [TrackEventInput!]!): TrackEventsPayload!
```

El frontend ya envía:

```graphql
mutation Track($input: TrackEventInput!) {
  trackEvent(input: $input) {
    ok
    event_id
    duplicate
  }
}
```

Debe funcionar el preflight CORS para `https://ryuheirg.dev` y los previews de Vercel.

## 8. Admin UI (Fase 7.5)

Vive en `apps/admin` y se despliega en `cms.ryuheirg.dev`. No forma parte del sitio público.

### Pantallas mínimas

- **Login** contra `POST /v1/auth/token`, refresh automático y logout.
- **Dashboard**: page views, top posts, clicks de proyectos, outbound clicks y realtime.
- **Posts**: listado con filtros, editor Markdown, tags, portada opcional, SEO y publicación (preview si entra en v1).
- **Proyectos**: listado, editor de case study, galería, stack, estados, URLs y SEO.
- **Tags**, **Landing**, **Settings** y **Redirects**.
- **Media**: subida, alt, variantes y eliminación.
- **Documentos**: CV y certificados.
- **Webhooks**: bandeja de eventos, detalle de intentos y reintento manual.

### Requisitos de UI

- Mismos tokens de `docs/DESIGN.md`: oscuro editorial, negro + carmesí, bordes de 1 px, radios ≤ 2 px.
- Responsive en escritorio y móvil.
- Foco visible, navegación por teclado y estados vacíos/errores.
- Errores RFC 7807 mostrados con mensaje útil, no solo JSON crudo.
- Confirmación antes de publicar, archivar o eliminar.
- El token público del frontend **no** sirve para entrar al panel.

## 9. Seed: contenido inicial

Un **seed** es la carga inicial de la base de datos después de aplicar migraciones. No es un backup ni solo un fixture de tests: es el contenido con el que arranca el CMS para que el sitio se vea igual que hoy.

Debe replicar exactamente el contenido actual de `src/data/mock/`:

- 3 posts publicados, con `cover: null` y portada tipográfica generada por el frontend.
- 3 proyectos publicados.
- Tags y sus relaciones con posts.
- Landing completa: hero, about, stack, certificaciones y contacto.
- Site settings: navegación, footer, SEO defaults y socials.
- Un usuario administrador inicial (email y password por variable de entorno o CLI; nunca hardcodeados en el repo).

Reglas del seed:

- Idempotente: se puede ejecutar dos veces sin duplicar filas.
- Ejecutable en local y en Docker con un comando documentado.
- Las fechas deben ser ISO 8601 UTC con `Z`.
- Los IDs pueden ser UUID fijos para que el seed sea reproducible.
- Las imágenes locales de `src/assets/images/` (`portrait.jpeg`, `secureup.png`, `vaca-cubica.png`) deben subirse a R2 o sustituirse por URLs de media válidas. Los posts no necesitan portada.
- Revisa `src/data/mock/media.ts` y `src/lib/images.ts` para el mapeo de IDs y archivos.
- No inventes proyectos nuevos ni métricas.

## 10. Reglas de contrato

- JSON en `snake_case`.
- Fechas ISO 8601 UTC con `Z`.
- IDs UUID.
- Respuestas: `{ "data": ... }` o `{ "data": ..., "meta": ... }`.
- Errores RFC 7807 (`application/problem+json`).
- Paginación: `page`, `limit`, `total`, `total_pages`, `has_next`, `has_prev`.
- `publish_status` (`draft`, `published`, `archived`) controla visibilidad.
- `lifecycle_status` (`live`, `wip`, `archived`) describe el estado real del proyecto. **No son lo mismo.**
- `cover` es opcional en v1. `null` es válido y el frontend genera portada tipográfica.
- Cambios incompatibles: `/v2` o migración documentada.
- Cualquier cambio de schema se actualiza en `API-CONTRACT.md`, Pydantic y Zod a la vez.

## 11. Seguridad

- Nunca commitear `.env`, tokens ni claves.
- `CMS_API_TOKEN` es de solo lectura y vive solo en el build del frontend.
- `JWT_SECRET` es el mismo en los tres servicios.
- `WEBHOOK_SECRET` es el mismo en Content API y Webhook API.
- `METRICS_SITE_KEY` del frontend es el mismo valor que `SITE_KEY` de Metrics API; es público y no permite leer datos.
- CORS restringido a `https://ryuheirg.dev`, previews de Vercel y `https://cms.ryuheirg.dev`.
- Rate limiting en login, endpoints públicos, admin, media y métricas.
- Validar MIME real en uploads y limitar tamaño.
- Logs JSON con `request_id`, sin secretos ni PII.

## 12. Entregables

- [ ] Monorepo `ryoko-platform` con los tres servicios y `apps/admin`.
- [ ] `packages/common` con settings, errores, logging, auth y paginación.
- [ ] Migraciones Alembic que apliquen desde cero.
- [ ] Seed con el contenido de `src/data/mock/`.
- [ ] OpenAPI de Content API y Webhook API.
- [ ] Snapshot SDL de Metrics API.
- [ ] Docker Compose con PostgreSQL y Redis.
- [ ] `.env.example` por servicio.
- [ ] `uv.lock` y `.python-version` versionados; `pnpm-lock.yaml` y `packageManager` en `apps/admin`.
- [ ] Tests de contrato, auth, HMAC/replay/duplicados y métricas.
- [ ] `/health` y `/ready` en cada servicio.
- [ ] Admin UI funcional en `cms.ryuheirg.dev`.
- [ ] Documentación de arranque y deploy.

## 13. Criterios de aceptación

- Todos los endpoints del contrato existen y responden con la forma documentada.
- Un token público no puede escribir ni entrar a `/v1/admin/*`.
- Publicar un post dispara un evento y el webhook lo entrega.
- Un evento duplicado no se procesa dos veces.
- Un `PAGE_VIEW` se registra una sola vez.
- Las queries de métricas requieren JWT.
- Las migraciones aplican desde cero en una base vacía.
- El seed deja el sitio igual que los mocks.
- El panel permite iniciar sesión, publicar un post y ver métricas.
- Un admin puede reintentar un webhook fallido.
- **Smoke test:** con `CMS_USE_MOCKS=false`, `CMS_API_URL` apuntando al Content API local y `CMS_API_TOKEN` válido, `pnpm build` del frontend genera las 24 páginas sin errores de Zod.

## 14. Decisiones ya cerradas

- `cover: null` está permitido; no bloquees la publicación por eso.
- El seed usa los mocks actuales; no se cambian los 3 proyectos por otros.
- El panel de administración **sí entra** en la entrega.
- Preview de drafts y UI de programación: el schema y las tablas sí; la UI puede quedar para v1.1 si el tiempo aprieta.
- Python se gestiona con `uv` y Node con pnpm; no se usan `pip` global, npm ni yarn.
- Redirects reales 301 en Vercel: v1.1. En v1 se generan páginas estáticas de redirección.
- No hay ads, comentarios, newsletter, búsqueda ni multiidioma en v1.
- No hay endpoints de gestión de usuarios en v1.

## 15. Cómo usar este documento

Si eres el agente del CMS:

1. Clona `dev-blog-ryoko` o pide acceso de lectura.
2. Lee los archivos de la sección 3 en ese orden.
3. Crea `ryoko-platform` como repo hermano.
4. Copia este handoff y el contrato a `ryoko-platform/docs/` solo si no tienes acceso al repo del frontend; conserva el commit de referencia.
5. Implementa por fases: Content API → Webhook API → Metrics API → Admin UI.
6. Al terminar cada fase, corre los tests y actualiza el contrato si cambió algo.

Si eres Ricardo:

1. Crea el repo vacío `ryoko-platform` en GitHub.
2. Pásale al agente el link de `dev-blog-ryoko`, este documento y el contrato.
3. No copies `src/` ni `node_modules/` al CMS.
4. Pide como primera entrega el esqueleto del monorepo, migraciones y seed; después las APIs y al final el panel.
