# ryoko-platform

CMS y plataforma de datos del sitio **Ryoko / Karasu**. Este monorepo contiene las
tres APIs FastAPI, la infraestructura local y el panel de administración React que
consume el frontend Astro de `dev_blog_ryoko`.

El frontend no se modifica desde aquí: la integración se hace con
`CMS_USE_MOCKS=false`, `CMS_API_URL` y el token público `CMS_API_TOKEN`.

## Arquitectura

```
                          ┌────────────────────────────┐
  Astro build ──────────► │  Content API      :8000    │  CRUD admin, lectura pública,
                          │  FastAPI + asyncpg         │  media/documentos, seed
                          └────────────┬───────────────┘
                                       │ eventos firmados (HMAC)
                          ┌────────────▼───────────────┐
                          │  Webhook API      :8001    │  inbox, deduplicación,
                          │  FastAPI + worker          │  reintentos y dead letter
                          └────────────────────────────┘

  Frontend analytics ───► Metrics API       :8002    GraphQL (métricas + tracking)
                          FastAPI + Strawberry

  Admin UI (cms.ryuheirg.dev) ── React 19 + Vite 8 + Tailwind 4 + TanStack Query + Zod
                          └─ nginx: SPA + proxies /v1, /media, /webhook-api, /metrics-api
```

| Servicio      | Puerto | Rol                                                              |
| ------------- | ------ | ---------------------------------------------------------------- |
| Content API   | 8000   | Auth JWT, CRUD editorial, medios, documentos, redirects, seed     |
| Webhook API   | 8001   | Recepción HMAC, deduplicación, cola y reintentos                 |
| Metrics API   | 8002   | GraphQL: tracking de eventos y dashboard                         |
| Admin UI      | 8080   | Panel de administración (nginx en producción, Vite en desarrollo) |
| PostgreSQL 16 | 5432   | Base de datos (`ryoko`)                                          |
| Redis 7       | 6379   | Rate limiting y apoyo a workers                                  |

## Stack

- Python 3.12 gestionado con **uv** (workspace único, sin venv manual).
- FastAPI, Pydantic v2, SQLAlchemy 2.0 async + asyncpg, Alembic.
- PostgreSQL 16 y Redis 7 vía Docker Compose v2 con healthchecks y volúmenes nombrados.
- Ruff + mypy estricto + pytest.
- Admin: React 19, Vite 8, TypeScript estricto, Tailwind 4, TanStack Query 5, Zod 4,
  React Router 7 y **pnpm 12.6.0** (`packageManager`).

## Estructura

```
apps/admin/               Panel React (src/, Dockerfile, vite.config.ts)
packages/common/          Código compartido: settings, errores RFC 7807, JWT, paginación
services/content-api/     API de contenido + migraciones + seed idempotente
services/webhook-api/     API de webhooks + worker + migraciones
services/metrics-api/     API GraphQL + migraciones
infra/                    Dockerfile.python, nginx/admin.conf, init.sql
scripts/                  Utilidades (contratos, smoke test)
docs/                     Contrato, diseño, handoff y snapshots de contrato
```

## Inicio rápido con Docker

Requisitos: Docker Desktop con Compose v2.

```bash
cp .env.example .env
# Ajusta secretos y URLs si hace falta. Nunca commitees .env.

docker compose up --build
```

Servicios resultantes:

- Content API: <http://localhost:8000/health> · docs en `/docs`
- Webhook API: <http://localhost:8001/health>
- Metrics API: <http://localhost:8002/health> · GraphQL en `/graphql`
- Admin UI: <http://localhost:8080>

Credenciales del seed local:

```
email:    hola@ryuheirg.dev
password: ryoko-dev-password
```

El contenedor de Content API ejecuta `alembic upgrade head` y `python -m app.seed`
al arrancar. El seed es idempotente y refleja los mocks del frontend: 3 posts,
3 proyectos, 13 tags, 5 secciones de landing, ajustes del sitio y media local.

## Desarrollo local sin contenedores de aplicación

Los servicios se ejecutan con Python del workspace; solo PostgreSQL y Redis van en Docker.

```bash
cp .env.example .env
docker compose up -d postgres redis
uv sync
```

Prepara la base de datos:

```bash
cd services/content-api
uv run alembic upgrade head
uv run python -m app.seed

cd ../webhook-api
uv run alembic upgrade head

cd ../metrics-api
uv run alembic upgrade head
```

Levanta cada API en su propia terminal:

```bash
# services/content-api
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000

# services/webhook-api
uv run uvicorn app.main:app --host 127.0.0.1 --port 8001

# services/metrics-api
uv run uvicorn app.main:app --host 127.0.0.1 --port 8002
```

Admin en modo desarrollo (proxy Vite hacia `127.0.0.1:8000/8001/8002`):

```bash
cd apps/admin
pnpm install --frozen-lockfile
pnpm dev        # http://localhost:5173
pnpm build      # typecheck estricto + build de producción
```

## Contrato y autenticación

- JSON en `snake_case`; fechas ISO 8601 UTC con sufijo `Z`; IDs UUID.
- Errores RFC 7807 (`application/problem+json`).
- Listados paginados con `{ "data": [...], "meta": { ... } }`.
- `publish_status` (`draft` / `published` / `archived`) y `lifecycle_status`
  (`live` / `wip` / `archived`) son estados independientes.
- **Admin**: JWT de acceso + refresh rotativo.
  - Login: `POST /v1/auth/token` (`application/x-www-form-urlencoded`).
  - El token de acceso habilita `/v1/admin/*` y la Metrics API.
- **Público**: `GET /v1/public/*` (excepto `health`) requiere
  `Authorization: Bearer <CMS_API_TOKEN>`. Es solo lectura y no puede entrar a
  `/v1/admin/*`.
- **Webhooks**: firma HMAC `X-Ryoko-Signature`, timestamp con tolerancia y
  deduplicación por `event_id`. Los eventos fallidos se reintentan con backoff y
  quedan visibles en el inbox del admin.
- **Métricas**: los resolvers de consulta exigen JWT de administrador. El tracking
  público anónimo usa la `site_key` del frontend y no persiste PII.

Detalle completo en [`docs/API-CONTRACT.md`](docs/API-CONTRACT.md). Tokens visuales
del admin en [`docs/DESIGN.md`](docs/DESIGN.md).

## Pruebas y calidad

```bash
# Ruff (raíz del repo)
uv run ruff format --check .
uv run ruff check .

# mypy estricto (un proceso por servicio: cada uno define su propio paquete `app`)
uv run mypy packages/common/ryoko_common

cd services/content-api
uv run mypy app tests
cd ../webhook-api
uv run mypy app tests
cd ../metrics-api
uv run mypy app tests

# Tests de cada servicio
cd services/content-api && uv run pytest -q
cd ../webhook-api && uv run pytest -q
cd ../metrics-api && uv run pytest -q

# Admin
cd apps/admin && pnpm typecheck && pnpm build
```

Los tests usan bases de datos dedicadas (`ryoko_test_content`,
`ryoko_test_webhook`, `ryoko_test_metrics`), aplican Alembic y siembran cuando
corresponde. Requieren PostgreSQL/Redis locales levantados.

Smoke test end-to-end con las tres APIs corriendo:

```bash
uv run python scripts/smoke_admin.py
```

Cubre login/refresh/logout, CRUD de posts y tags, redirects, landing, settings,
media, documentos, inbox de webhooks con reintento y GraphQL de métricas.

## Contratos versionados

Los snapshots viven en:

- `docs/openapi/content-api.json`
- `docs/openapi/webhook-api.json`
- `docs/metrics-api/schema.graphql`

Regeneración:

```bash
uv run python scripts/export_openapi.py content-api
uv run python scripts/export_openapi.py webhook-api
uv run python scripts/export_openapi.py metrics-api
```

## Integración con el frontend Astro

En el repo `dev_blog_ryoko`:

```dotenv
CMS_USE_MOCKS=false
CMS_API_URL=http://localhost:8000
CMS_API_TOKEN=dev-cms-api-token-0123456789abcdef
METRICS_API_URL=http://localhost:8002/graphql
METRICS_SITE_KEY=dev-site-key
```

```bash
pnpm build
```

El build debe generar las 24 páginas (3 posts, 3 proyectos, tags publicados y
redirects) sin errores de Zod. El token público solo se usa en build; no debe
exponerse en el cliente.

## Operación y despliegue

- `infra/nginx/admin.conf` sirve el SPA y proxya `/v1/`, `/media/`,
  `/webhook-api/` y `/metrics-api/` hacia los contenedores. El dominio previsto es
  `cms.ryuheirg.dev` (TLS fuera de este compose, en el proxy del host).
- Las variables `VITE_*` del admin se inyectan en **build time**; cambiar el
  entorno del contenedor no altera el bundle. Compose ya pasa los valores
  same-origin necesarios.
- `MEDIA_PUBLIC_BASE_URL` debe apuntar a la URL pública del Content API para que
  el frontend resuelva las imágenes. En producción, cambia el default local por
  la URL real.
- El scheduler de posts programados corre cada 60 s en Content API, protegido por
  un advisory lock de PostgreSQL (`ENABLE_SCHEDULER=false` lo desactiva).
- El worker de webhooks reintenta con backoff (`RETRY_SCHEDULE_SECONDS`) y expone
  el estado en `/v1/admin/events`.

## Seguridad

- Nunca commitear `.env`, tokens, claves HMAC ni certificados.
- Rotar `JWT_SECRET`, `CMS_API_TOKEN`, `WEBHOOK_SECRET`, `SITE_KEY` e
  `IP_HASH_SALT` en cada entorno.
- El token público no puede escribir ni acceder a rutas admin.
- Los webhooks rechazan firmas inválidas, timestamps viejos y eventos duplicados.
- El panel guarda la sesión en `localStorage` con refresh rotativo; el logout
  revoca el refresh token en el servidor.
