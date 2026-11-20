# FRONTEND-ARCHITECTURE.md — Arquitectura del frontend Astro

## 1. Stack

| Pieza | Elección | Motivo |
|---|---|---|
| Framework | Astro 5 | Sitio estático, cero JS por defecto, content-first |
| Lenguaje | TypeScript estricto | Seguridad de tipos en el contrato |
| Estilos | Tailwind CSS 4 + tokens CSS | Velocidad + consistencia |
| Animación | Motion One / GSAP ScrollTrigger | Hero cinematográfico sin Three.js |
| Markdown | `marked` o `remark` + `rehype-sanitize` + Shiki | Contenido del CMS seguro y con código |
| Validación | Zod | Validar respuestas del CMS |
| SEO | `@astrojs/sitemap` + `@astrojs/rss` | Sitemap y feed |
| Testing | Vitest + Playwright | Unitarias y E2E |
| Calidad | Lighthouse CI + axe | Performance y accesibilidad |
| Imágenes | `astro:assets` + `sharp` | Optimización AVIF/WebP |
| Package manager | pnpm | Consistencia y velocidad |
| Deploy | Vercel | Preview deployments, dominio, deploy hook |

> **Package manager: pnpm.** Es una decisión cerrada del proyecto, no una sugerencia. No usar npm ni yarn ni generar `package-lock.json` o `yarn.lock`. La versión está fijada en `package.json` con `packageManager`.

## 2. Estructura del repositorio

```text
dev-blog-ryoko/
├── AGENTS.md
├── README.md
├── astro.config.mjs
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── public/
│   ├── favicon.svg
│   ├── og-default.png
│   └── fonts/
├── scripts/
│   ├── fetch-github.ts
│   ├── download-media.ts
│   └── generate-og.ts
├── src/
│   ├── assets/
│   │   ├── images/
│   │   └── crow/
│   ├── components/
│   │   ├── ui/
│   │   │   ├── Button.astro
│   │   │   ├── Container.astro
│   │   │   ├── SectionLabel.astro
│   │   │   ├── Tag.astro
│   │   │   ├── LinkArrow.astro
│   │   │   ├── Figure.astro
│   │   │   └── SkipLink.astro
│   │   ├── layout/
│   │   │   ├── SiteHeader.astro
│   │   │   ├── SiteFooter.astro
│   │   │   └── MobileMenu.astro
│   │   ├── blog/
│   │   │   ├── PostRow.astro
│   │   │   ├── PostCard.astro
│   │   │   ├── TOC.astro
│   │   │   ├── Prose.astro
│   │   │   ├── CodeBlock.astro
│   │   │   └── RelatedPosts.astro
│   │   ├── projects/
│   │   │   ├── ProjectRow.astro
│   │   │   ├── ProjectCard.astro
│   │   │   ├── ProjectMeta.astro
│   │   │   └── ProjectGallery.astro
│   │   └── hero/
│   │       ├── Hero.astro
│   │       ├── HeroStage.astro
│   │       └── CrowLayer.astro
│   ├── data/
│   │   ├── mock/
│   │   │   ├── posts.ts
│   │   │   ├── projects.ts
│   │   │   ├── tags.ts
│   │   │   ├── landing.ts
│   │   │   └── settings.ts
│   │   └── github-cache.json
│   ├── layouts/
│   │   ├── BaseLayout.astro
│   │   ├── BlogLayout.astro
│   │   ├── ProjectLayout.astro
│   │   └── PageLayout.astro
│   ├── lib/
│   │   ├── cms/
│   │   │   ├── client.ts
│   │   │   ├── schemas.ts
│   │   │   ├── queries.ts
│   │   │   ├── mappers.ts
│   │   │   └── errors.ts
│   │   ├── markdown.ts
│   │   ├── seo.ts
│   │   ├── jsonld.ts
│   │   ├── reading-time.ts
│   │   ├── github.ts
│   │   ├── analytics.ts
│   │   ├── dates.ts
│   │   └── constants.ts
│   ├── pages/
│   │   ├── index.astro
│   │   ├── blog/
│   │   │   ├── index.astro
│   │   │   ├── page/
│   │   │   │   └── [page].astro
│   │   │   └── [slug].astro
│   │   ├── proyectos/
│   │   │   ├── index.astro
│   │   │   └── [slug].astro
│   │   ├── etiquetas/
│   │   │   └── [tag].astro
│   │   ├── sobre-mi.astro
│   │   ├── privacidad.astro
│   │   ├── rss.xml.ts
│   │   ├── robots.txt.ts
│   │   ├── og/
│   │   │   └── [...slug].png.ts
│   │   └── 404.astro
│   ├── styles/
│   │   ├── global.css
│   │   ├── tokens.css
│   │   └── prose.css
│   └── env.d.ts
├── tests/
│   ├── e2e/
│   └── unit/
└── docs/
    ├── PRODUCT.md
    ├── API-CONTRACT.md
    ├── DESIGN.md
    ├── FRONTEND-ARCHITECTURE.md
    ├── CONTENT.md
    └── ROADMAP.md
```

## 3. Flujo de datos

```text
Content API ──fetch──▶ Zod ──▶ mappers ──▶ páginas Astro ──▶ HTML estático
                                      │
GitHub API ──fetch──▶ cache ──────────┘
```

Reglas:

- **Build time only.** El navegador nunca llama a la Content API.
- Si `CMS_USE_MOCKS=true`, el cliente devuelve los datos de `src/data/mock/`.
- Si `CMS_USE_MOCKS=true` y el entorno es producción, el build se completa con un warning y sirve los mocks. Es una excepción temporal mientras el CMS no está desplegado (ver §15); al integrar la Content API debe configurarse `CMS_USE_MOCKS=false`.
- Si la API falla en producción, el build falla y Vercel mantiene el deploy anterior.
- Los errores de validación Zod deben ser claros: indicar endpoint, campo y valor recibido.
- No hacer `fetch` dentro de componentes de UI; solo en `lib/cms/queries.ts`.

## 4. Capa CMS

### `client.ts`

```ts
type FetchOptions = {
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  token?: string;
  signal?: AbortSignal;
};

export async function cmsFetch<T>(options: FetchOptions): Promise<T> {
  // 1. Construir URL con URLSearchParams
  // 2. Agregar Authorization: Bearer <CMS_API_TOKEN>
  // 3. fetch con timeout (AbortSignal.timeout)
  // 4. Si !res.ok, lanzar CmsError con status y problem+json
  // 5. Devolver JSON
}
```

- Timeout: 10 s.
- Reintentos: 2 con backoff de 500 ms para 5xx y network errors.
- No reintentar 4xx.
- `CMS_API_URL` sin slash final.
- `CMS_API_TOKEN` obligatorio en producción.

### `schemas.ts`

Zod debe reflejar exactamente `API-CONTRACT.md`:

```ts
export const MediaSchema = z.object({
  id: z.string().uuid(),
  url: z.string().url(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  mime_type: z.string(),
  size_bytes: z.number().int().nonnegative(),
  alt: z.string(),
  blurhash: z.string().nullable(),
  variants: z
    .array(z.object({ width: z.number().int().positive(), url: z.string().url() }))
    .optional(),
  created_at: z.string().datetime(),
});

export const PostSummarySchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  title: z.string(),
  excerpt: z.string(),
  cover: MediaSchema.nullable(),
  tags: z.array(TagSchema),
  published_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  reading_time_minutes: z.number().int().positive(),
  featured: z.boolean(),
  publish_status: z.enum(["draft", "published", "archived"]),
  type: z.enum(["article", "note"]),
  seo: SeoSchema,
});

export const ProjectSummarySchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  title: z.string(),
  summary: z.string(),
  cover: MediaSchema.nullable(),
  stack: z.array(z.string()),
  year: z.number().int(),
  updated_at: z.string().datetime(),
  publish_status: z.enum(["draft", "published", "archived"]),
  lifecycle_status: z.enum(["live", "wip", "archived"]),
  featured: z.boolean(),
  repo_url: z.string().url().nullable(),
  demo_url: z.string().url().nullable(),
  sort_order: z.number().int(),
  seo: SeoSchema,
});
```

- Exportar tipos inferidos: `export type Post = z.infer<typeof PostSchema>;`
- No usar `any`.
- Si el CMS agrega campos, tolerarlos con `.passthrough()` solo en recursos no críticos.

### `mappers.ts`

- Convierte `snake_case` a `camelCase`.
- Normaliza fechas a `Date` o a string formateado.
- No muta los datos originales.
- Ejemplo:

```ts
export function mapPostSummary(input: PostSummaryDTO): PostSummary {
  return {
    id: input.id,
    slug: input.slug,
    title: input.title,
    excerpt: input.excerpt,
    cover: input.cover ? mapMedia(input.cover) : null,
    tags: input.tags.map(mapTag),
    publishedAt: new Date(input.published_at),
    updatedAt: new Date(input.updated_at),
    readingTimeMinutes: input.reading_time_minutes,
    featured: input.featured,
    publishStatus: input.publish_status,
    type: input.type,
    seo: mapSeo(input.seo),
  };
}
```

`ProjectSummary` mapea `publish_status` → `publishStatus` y `lifecycle_status` → `lifecycleStatus`. La UI usa `lifecycleStatus` para el badge del proyecto (`live`, `wip`, `archived`).

### `queries.ts`

```ts
export async function getSiteSettings(): Promise<SiteSettings>
export async function getLanding(): Promise<Landing>
export async function getPosts(params?: PostQuery): Promise<Paginated<PostSummary>>
export async function getAllPosts(): Promise<PostSummary[]>
export async function getPostBySlug(slug: string): Promise<Post>
export async function getRelatedPosts(slug: string, limit?: number): Promise<PostSummary[]>
export async function getProjects(params?: ProjectQuery): Promise<Paginated<ProjectSummary>>
export async function getAllProjects(): Promise<ProjectSummary[]>
export async function getProjectBySlug(slug: string): Promise<Project>
export async function getTags(): Promise<Tag[]>
export async function getTagBySlug(slug: string): Promise<{ tag: Tag; posts: PostSummary[] }>
export async function getRedirects(): Promise<Redirect[]>
```

- `getAllPosts` y `getAllProjects` se usan en `getStaticPaths` y deben recorrer todas las páginas (`limit=50`) hasta que `has_next` sea `false`.
- Cache en memoria durante el build: `const cache = new Map()`.
- No cachear entre builds.

### Mock strategy

- `CMS_USE_MOCKS=true` en `.env.development`.
- Los mocks deben cumplir los schemas Zod.
- Los mocks cubren:
  - 4 posts (3 publicados, 1 draft).
  - 3 proyectos publicados + 2 secundarios.
  - 4 tags.
  - Landing completa.
  - Settings.
  - Un post sin cover.
  - Un proyecto sin galería.
- El post draft solo se expone si `CMS_PREVIEW_TOKEN` está definido; en build normal se filtra.
- Un script `pnpm validate:mocks` valida los mocks contra Zod.

## 5. Markdown

### Pipeline

1. `content_md` del CMS.
2. `remark-parse` + `remark-gfm` + `remark-rehype`.
3. `rehype-sanitize` con schema estricto.
4. `rehype-slug` para IDs de headings.
5. `rehype-autolink-headings` para anchors.
6. Shiki para code blocks.
7. `rehype-stringify`.
8. Se inyecta en `<Prose />`.

Alternativa: `marked` + `marked-gfm-heading-id` + `sanitize-html` + Shiki. Elegir una y documentarla. Recomendación: `remark`/`rehype` por control y ecosistema.

### Reglas

- HTML crudo prohibido.
- `script`, `iframe`, `style`, `form`, `input` prohibidos.
- El schema de `rehype-sanitize` permite solo `id` en headings, `className` en `code`/`pre` y `data-language`; nada más.
- Enlaces externos: `rel="noopener noreferrer"` y `target="_blank"`.
- Imágenes: `<figure>` + `<figcaption>` si hay title.
- Headings: IDs slugificados; duplicados con sufijo `-2`.
- Tablas: wrapper con `overflow-x: auto`.
- Code blocks: `data-language`, botón copiar, `tabindex="0"` para scroll.
- Footnotes: estilos al final.
- Callouts: blockquote con `**Nota:**`; el CSS detecta `blockquote` y aplica borde rojo.
- Reading time calculado en el CMS; el frontend puede recalcular como fallback.

### Shiki

- Tema personalizado basado en `vesper` o `poimandres`.
- Fondo `#0D0F12`, texto `#E6E6E6`.
- Keywords rojo suave `#F07178`, strings `#C3E88D`, comentarios `#6B7280`.
- No usar rojo saturado para todo el código.
- Botón copiar con estado "Copiado" por 1.5 s.

## 6. Páginas y rutas

### `index.astro`

- `getLanding()`, `getSiteSettings()`, `getPosts({ limit: 3 })`, `getProjects({ featured: true, limit: 3 })`.
- Renderiza Hero, Statement, SelectedWork, LatestPosts, AboutStrip, Footer.
- JSON-LD `WebSite` + `Person`.
- OG default.

### `blog/index.astro`

- `getPosts({ page: 1, limit: 10 })`, `getTags()`.
- Los filtros por tag enlazan a `/etiquetas/[tag]`; no usar query params en un sitio estático.
- Mostrar destacado solo en la página 1.
- Paginación con `has_next`/`has_prev`.
- JSON-LD `Blog`.

### `blog/page/[page].astro`

- `getStaticPaths` genera páginas 2..`total_pages` con `getPosts({ page, limit: 10 })`.
- Misma lista que el índice, sin destacado.
- Canonical a `/blog/page/{page}` y enlaces anterior/siguiente.
- `getStaticPaths` debe excluir la página 1 para no duplicar `/blog`.

### `blog/[slug].astro`

- `getStaticPaths` con `getAllPosts()`.
- `getPostBySlug(slug)`.
- `getRelatedPosts(slug, 3)`.
- TOC generado desde headings del Markdown.
- JSON-LD `BlogPosting`.
- OG dinámico.
- `article:published_time`, `article:modified_time`, `article:tag`.
- Prev/next post.
- Botón copiar link.

### `proyectos/index.astro`

- `getProjects()`.
- Separar destacados y "otros".
- Sin filtro por stack en v1; el stack se muestra como metadata.
- JSON-LD `CollectionPage`.

### `proyectos/[slug].astro`

- `getStaticPaths` con `getAllProjects()`.
- `getProjectBySlug(slug)`.
- Ficha + case study + galería + siguiente proyecto.
- JSON-LD `CreativeWork` con `codeRepository`.
- OG dinámico.

### `etiquetas/[tag].astro`

- `getStaticPaths` con `getTags()`.
- `getTagBySlug(tag)` devuelve `{ tag, posts }`.
- JSON-LD `CollectionPage`.

### `sobre-mi.astro`

- `getLanding()`, `getSiteSettings()`.
- Bio, foto, stack, timeline, certificaciones, contacto.
- JSON-LD `Person` con `sameAs`.

### `rss.xml.ts`

- `getAllPosts()`.
- `@astrojs/rss`.
- `title`, `description`, `site`, `items`.
- Incluir `content` si es posible; si no, `description`.
- `customData` para `language: es-MX`.

### `robots.txt.ts`

- `User-agent: *`
- `Allow: /`
- `Sitemap: https://ryuheirg.dev/sitemap-index.xml`
- Bloquear `/api/` si existiera.

### `404.astro`

- Diseño con cuervo/ojo rojo.
- Links a home, blog, proyectos.

## 7. SEO

### `BaseLayout.astro`

Props:

```ts
type SeoProps = {
  title: string;
  description: string;
  canonical?: string;
  image?: string;
  type?: "website" | "article";
  publishedTime?: string;
  modifiedTime?: string;
  tags?: string[];
  noindex?: boolean;
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
};
```

Genera:

- `<title>{title} — Ryoko</title>` (o título completo en home).
- `<meta name="description">`.
- `<link rel="canonical">`.
- Open Graph: `og:type`, `og:title`, `og:description`, `og:image`, `og:url`, `og:site_name`, `og:locale`.
- Twitter: `summary_large_image`.
- `article:published_time`, `article:modified_time`, `article:tag`.
- `<html lang="es-MX">`.
- JSON-LD.

### JSON-LD

- Home: `WebSite` + `Person`.
- Blog index: `Blog`.
- Post: `BlogPosting` con `author`, `datePublished`, `dateModified`, `image`, `publisher`.
- Proyecto: `CreativeWork` con `codeRepository`, `programmingLanguage`, `author`.
- About: `Person` con `sameAs` GitHub/LinkedIn.

### Sitemap

- `@astrojs/sitemap` con `site: "https://ryuheirg.dev"`.
- Excluir `404`, `og`, `rss`.
- `lastmod` desde `updated_at`.

### Redirects

- `getRedirects()` en build.
- Astro `redirects` genera páginas estáticas con meta refresh y canonical; en output estático no son 301 reales.
- Para 301 reales en Vercel, mantener `vercel.json` en el repo o automatizar su commit vía GitHub API (v1.1).
- v1: los cambios de slug se revisan manualmente antes de publicar.
- No redirigir el dominio viejo desde el repo nuevo; se hace en el repo viejo.

## 8. Imágenes

- `astro:assets` para imágenes locales.
- Para imágenes remotas del CMS:
  - Configurar `image.domains` con `media.ryuheirg.dev`.
  - Usar `<Image src={url} width height format="avif" />` si Astro lo soporta para remotas; si no, descargar en build a `src/assets/generated/` con un script.
- Recomendación robusta: script `scripts/download-media.ts` que descarga covers a `src/assets/generated/` durante el build y genera un manifest. Así Astro optimiza localmente.
- `width` y `height` obligatorios.
- `sizes` para responsive.
- `loading="lazy"` excepto hero y cover above-the-fold.
- `decoding="async"`.
- `alt` desde el CMS; si falta, build warning.

## 9. GitHub metadata

`scripts/fetch-github.ts`:

1. Lee los proyectos del CMS (o de los mocks si `CMS_USE_MOCKS=true`).
2. Filtra los que tienen `github_repo`.
3. Consulta `https://api.github.com/repos/{owner}/{repo}` con `GITHUB_TOKEN`.
4. Consulta lenguajes con `/languages`.
5. Escribe `src/data/github-cache.json` con timestamp.
6. Si falla, usa el cache anterior; si no hay, omite metadata.

Reglas:

- No llamar a GitHub desde el navegador.
- No mostrar estrellas si `< 3`.
- No bloquear el build si GitHub falla.
- Cache válido por 24 h.

## 10. Analytics

`src/lib/analytics.ts`:

```ts
type EventType =
  | "PAGE_VIEW"
  | "POST_VIEW"
  | "PROJECT_VIEW"
  | "OUTBOUND_CLICK"
  | "AD_IMPRESSION"
  | "AD_CLICK";

export function track(type: EventType, payload: Record<string, unknown> = {}) {
  // 1. Si no hay METRICS_API_URL o METRICS_SITE_KEY, no-op
  // 2. Respetar Do Not Track y navigator.connection.saveData
  // 3. session_id desde sessionStorage
  // 4. event_id crypto.randomUUID()
  // 5. fetch con keepalive: true y header X-Site-Key
}
```

- Se carga solo si `METRICS_API_URL` existe.
- El layout inyecta `METRICS_API_URL`, `METRICS_SITE_KEY` y `METRICS_DEBUG` con `define:vars`; no se usa el prefijo `PUBLIC_` para no filtrarlos a todo el bundle.
- Script inline pequeño o módulo con `is:inline` para no bloquear.
- `PAGE_VIEW` en `astro:page-load` (View Transitions) o `DOMContentLoaded`.
- `OUTBOUND_CLICK` con delegación de eventos en links externos.
- `POST_VIEW` y `PROJECT_VIEW` en sus layouts.
- No trackear en localhost salvo `METRICS_DEBUG=true`.
- No trackear páginas de preview.

## 11. Hero

- Componente `Hero.astro` con HTML semántico.
- `HeroStage` para las 3 capas.
- `CrowLayer` con SVG.
- Script `src/scripts/hero.ts` cargado solo en home, `defer`.
- Usar `matchMedia("(prefers-reduced-motion: reduce)")`.
- Si `true`, no cargar la librería; mostrar primera etapa.
- Si móvil (`< 768px`), versión simplificada.
- Si el usuario tiene `saveData`, no cargar animación.
- `IntersectionObserver` para pausar.
- `requestAnimationFrame` para scroll.
- Cleanup en `astro:before-swap` si se usan View Transitions.

## 12. Seguridad

### Headers en `vercel.json`

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "Strict-Transport-Security", "value": "max-age=31536000; includeSubDomains; preload" }
      ]
    }
  ]
}
```

- CSP: empezar con `default-src 'self'; img-src 'self' https://media.ryuheirg.dev data:; font-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self' https://metrics.ryuheirg.dev; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`.
- Endurecer CSP después de probar; Astro inline scripts pueden requerir hashes/nonces.
- No secrets en el bundle.
- No `set:html` con contenido del CMS sin sanitizar.

## 13. Testing

### Unit

- `src/lib/cms/schemas.test.ts`: Zod con respuestas válidas e inválidas.
- `src/lib/markdown.test.ts`: sanitización, headings, links, code.
- `src/lib/seo.test.ts`: metadata y JSON-LD.
- `src/lib/analytics.test.ts`: no-op sin env, DNT, payload.

### E2E

- Playwright:
  - Home carga y muestra hero.
  - Blog index muestra posts.
  - Post renderiza Markdown y TOC.
  - Proyecto renderiza case study.
  - About renderiza.
  - 404.
  - Navegación por teclado.
  - `prefers-reduced-motion` no rompe.
  - Responsive 360/768/1440.

### Quality gates

- `pnpm astro check`
- `pnpm tsc --noEmit`
- `pnpm lint` (ESLint + Prettier)
- `pnpm test`
- `pnpm test:e2e`
- Lighthouse CI en home, blog index, post y proyecto.
- `axe` en las mismas páginas.

## 14. Comandos

```bash
pnpm install
pnpm dev
pnpm build
pnpm preview
pnpm astro check
pnpm tsc --noEmit
pnpm lint
pnpm format
pnpm test
pnpm test:e2e
pnpm validate:mocks
pnpm fetch:github
pnpm download:media
pnpm build:preview
```

> Todos los comandos asumen pnpm. No ejecutar equivalentes con npm o yarn.

## 15. Variables de entorno

`.env.example`:

```bash
PUBLIC_SITE_URL=https://ryuheirg.dev
CMS_API_URL=https://api.ryuheirg.dev
CMS_API_TOKEN=
CMS_PREVIEW_TOKEN=
CMS_USE_MOCKS=false
METRICS_API_URL=https://metrics.ryuheirg.dev/graphql
METRICS_SITE_KEY=
METRICS_DEBUG=false
GITHUB_TOKEN=
```

- `.env` en `.gitignore`.
- En Vercel, configurar por entorno. Las variables llegan al build como `process.env`, no desde `.env`.
- `CMS_USE_MOCKS=true` en local. En Vercel se permite temporalmente en Preview y Production mientras el CMS no esté desplegado; el build emite un warning. Al integrar la Content API, configurar `CMS_API_URL`, `CMS_API_TOKEN` y `CMS_USE_MOCKS=false`.
- Los flags (`CMS_USE_MOCKS`, `METRICS_DEBUG`) se leen con `isEnvFlagEnabled` porque Astro inlinea `true`/`false` de `process.env` como booleanos, no como strings.

## 16. Build y deploy

### Vercel

- Framework preset: Astro.
- Build command: `pnpm build`.
- Output: `dist`.
- Node 22.
- Instalar `pnpm` con `corepack`.
- Dominio: `ryuheirg.dev` y `www` redirigido.
- Deploy Hook para el webhook.
- Preview deployments para ramas.
- Variables en Vercel: `PUBLIC_SITE_URL` y, mientras el CMS no exista, `CMS_USE_MOCKS=true`. No se commitea `.env`.

### Flujo

1. Push a `main`.
2. Vercel build.
3. `pnpm fetch:github` (opcional, prebuild).
4. Astro fetch a Content API.
5. Genera `dist`.
6. Deploy.
7. Webhook de CMS también dispara build.

### Fallback

- Si Content API falla, el build falla.
- Vercel mantiene el deploy anterior.
- n8n notifica el fallo.
- No publicar datos parciales.

## 17. Migración desde TemporalPortfolioWeb

1. Copiar `YO.avif` y `ryuhei-logo.png` a `src/assets/`.
2. Copiar iconos del stack a `src/assets/icons/`.
3. Extraer certificaciones y textos a `CONTENT.md`.
4. Reescribir proyectos como case studies.
5. Crear el nuevo repo `dev-blog-ryoko`.
6. Configurar Vercel y dominio.
7. Publicar.
8. En el repo viejo, reemplazar `index.html` por redirect.
9. Actualizar GitHub profile, LinkedIn y CV.

## 18. Definition of done del frontend

- [ ] Home, blog, post, proyectos, proyecto, about, tags, 404 y RSS funcionan.
- [ ] Todo el contenido viene del CMS o de mocks; no hay texto hardcodeado salvo microcopy.
- [ ] Zod valida todas las respuestas.
- [ ] `pnpm build` pasa sin errores.
- [ ] `astro check` y `tsc --noEmit` pasan.
- [ ] Lighthouse ≥ 95 en las 4 categorías.
- [ ] LCP < 2.5 s en móvil.
- [ ] Sin errores de consola.
- [ ] Responsive 360/768/1440.
- [ ] Navegación por teclado completa.
- [ ] `prefers-reduced-motion` funcionando.
- [ ] OG images correctas.
- [ ] Sitemap y RSS válidos.
- [ ] Redirects probados.
- [ ] Analytics envía eventos y no bloquea.
- [ ] Deploy en dominio propio con HTTPS.
