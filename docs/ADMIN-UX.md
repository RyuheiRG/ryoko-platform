# Admin UX — editor, guard de cambios y dashboard

Este documento describe las capacidades del panel de administración añadidas sobre
el CMS existente. **No cambia el contrato de las APIs**: todo se resuelve en
`apps/admin/` usando los endpoints y el schema GraphQL actuales.

## Editor Markdown

Archivos principales:

- `apps/admin/src/components/MarkdownEditor.tsx`
- `apps/admin/src/components/MarkdownPreview.tsx`
- `apps/admin/src/components/ArticlePreview.tsx`
- `apps/admin/src/lib/markdown.ts`

Características:

- **Fuente de verdad**: el Markdown sigue siendo el contrato (`content_md` en posts,
  `case_study_md` en proyectos). No hay editor por bloques ni HTML crudo.
- **Modos**: `Escribir`, `Dividir` y `Preview`. En pantallas pequeñas el modo dividido
  se apila verticalmente; en `xl` usa dos columnas.
- **Toolbar**: H2/H3, negrita, cursiva, código inline, enlace, listas, cita, bloque de
  código y separador. Todos los botones son `type="button"` para no enviar el
  formulario.
- **Atajos**: `Ctrl/Cmd+B`, `Ctrl/Cmd+I`, `Ctrl/Cmd+K` dentro del textarea.
  `Ctrl/Cmd+S` guarda el formulario desde cualquier campo.
- **Estadísticas**: palabras, minutos estimados (200 palabras/minuto) y caracteres.
- **Índice (TOC)**: se genera desde los encabezados ATX (`##`, `###`, …) ignorando los
  bloques de código. Los IDs usan `github-slugger`, el mismo algoritmo que
  `rehype-slug`, así que el salto al encabezado coincide con el preview.
- **Preview**: `react-markdown` + `remark-gfm` + `rehype-slug` +
  `rehype-highlight`, cargado con `React.lazy` para no entrar en el bundle inicial.
  No se habilita `rehype-raw`: el HTML crudo no se interpreta.
- **Vista previa del artículo**: modal con portada, título, excerpt, autor, fecha,
  tags, tiempo de lectura y cuerpo renderizado. Funciona sin guardar.
- **Preview guardado**: el botón “Abrir preview guardado” conserva el endpoint
  existente `/v1/admin/posts/{id}/preview`, que requiere que el post ya exista.

El preview es una aproximación de lectura. El render final del sitio (Astro/Shiki)
puede diferir en detalles tipográficos; el contrato CommonMark/GFM es el mismo.

## Guard de cambios y borrador local

Archivos principales:

- `apps/admin/src/lib/unsaved.tsx`
- `apps/admin/src/lib/localDraft.ts`
- `apps/admin/src/App.tsx` (data router)
- `apps/admin/src/components/Layout.tsx`

Comportamiento:

- El admin usa `createBrowserRouter` para poder usar `useBlocker`.
- Si el formulario tiene cambios sin guardar:
  - navegar dentro del admin muestra un modal con “Seguir editando” y
    “Descartar y salir”;
  - recargar o cerrar la pestaña dispara el aviso nativo del navegador;
  - cerrar sesión pide confirmación y evita dejar una sesión a medias.
- Las navegaciones intencionales (guardar y continuar, duplicar, archivar) se
  permiten sin modal.
- **Borrador local**: tras 600 ms del último cambio se guarda una copia en
  `localStorage` con las claves `ryoko.cms.draft.post.{id|new}` y
  `ryoko.cms.draft.project.{id|new}`.
- Al volver al editor se muestra un banner con “Restaurar” y “Descartar”. El
  borrador **nunca** se aplica automáticamente ni se envía al servidor.
- Al guardar correctamente se limpia el borrador y se actualiza la línea base del
  formulario.

El borrador local no sustituye el guardado real: si otra persona cambió el post en
el servidor, restaurar el borrador local puede pisar esos cambios al guardar. El
banner existe para que la decisión sea explícita.

## SEO preview y export

Archivos principales:

- `apps/admin/src/components/SeoPreview.tsx`
- `apps/admin/src/lib/site.ts`
- `apps/admin/src/lib/download.ts`

- El preview de Google y la tarjeta social usan `seo_title`, `seo_description`,
  `seo_canonical`, `og_image_id`, la portada y los ajustes del sitio
  (`GET /v1/admin/settings`).
- Si no hay `canonical`, se construye con la URL del sitio y la ruta del post o
  proyecto. Si no hay ajustes disponibles, se usa `https://ryuheirg.dev` como
  fallback.
- Se muestran contadores de 60/160 caracteres y una advertencia de `noindex`.
- “Copiar MD” y “Descargar .md” exportan el contenido actual sin pasar por la API.

## Dashboard

Archivos principales:

- `apps/admin/src/pages/Dashboard.tsx`
- `apps/admin/src/components/charts.tsx`
- `apps/admin/src/lib/csv.ts`

- **Periodos**: 1 d, 7 d, 14 d, 30 d, 90 d y 1 año. Cambian el `DateRangeInput` del
  query GraphQL existente.
- **Páginas vistas**: toggle línea/barras sobre `pageViews.points`.
- **Top posts**: ranking con barras, buscador por título/slug y límite 5/10/20.
  Se piden 20 posts a la API y el filtro es local.
- **Distribución**: donut de views de los top posts (máximo 6 segmentos; el resto se
  agrupa como “Otros”). No mezcla unidades.
- **Proyectos**: tabla que combina `projectViews` y `projectClicks` por slug.
  Navegar a un proyecto cuenta como vista; solo los enlaces externos cuentan como
  salida.
- **Salidas externas**: tabla sobre `outboundClicks` (top 20).
- **Anuncios**: impresiones, clicks y CTR de `adMetrics`.
- **CSV**: exporta resumen, serie diaria, top posts, vistas/salidas por proyecto,
  salidas externas y anuncios, con BOM UTF-8 para Excel.
- **Estado vacío**: si no hay eventos, se explica cómo se llena el dashboard
  (`METRICS_SITE_KEY`) en lugar de mostrar gráficas rotas.
- **Sin cambios de backend**: no se añadieron resolvers, campos, migraciones ni
  métricas nuevas. Si falta una métrica (por ejemplo retención), no se inventa.

## Calidad frontend

- **Lazy routes**: todas las páginas salvo `Login` se cargan con `React.lazy`.
  `Layout` envuelve el `Outlet` en `Suspense`.
- **ESLint**: flat config con TypeScript, `react-hooks/rules-of-hooks` y
  `react-hooks/exhaustive-deps`.
- **Prettier**: configuración en `.prettierrc.json`; se aplica a archivos nuevos o
  modificados, no se reformatea todo el repo de golpe. `pnpm format:check` todavía
  reportará archivos legacy que no se tocaron en este cambio; por eso el CI no lo
  ejecuta. Los archivos nuevos y modificados sí están formateados.
- **Vitest**: tests de utilidades puras (`markdown.test.ts`, `csv.test.ts`).
- **Accesibilidad**: skip link “Saltar al contenido”, `main` con `id="main-content"`,
  foco al contenido en cambios de ruta, gráficas con `role="img"`, títulos y tablas
  ocultas con los datos.
- **Bundle**: medido contra el `HEAD` anterior con el mismo `vite build`:
  - entry anterior: 492.2 KB (139.7 KB gzip) y CSS de 54.5 KB;
  - entry actual: 451.0 KB (138.1 KB gzip) y CSS de 62.1 KB;
  - el HTML actual precarga además `jsx-runtime` (8.9 KB / 3.4 KB gzip), así que
    el JS crítico total queda en ~459.9 KB (141.5 KB gzip), prácticamente plano
    frente al baseline. El objetivo de −25 % no se alcanzó: React, React Router,
    TanStack Query y Zod dominan la ruta crítica y recortarlos exigiría cambiar
    dependencias núcleo o reducir validación, fuera de alcance.
  - La ganancia es de arquitectura: las páginas de administración (salvo `Login`)
    y el preview son chunks bajo demanda. El preview de Markdown (332.5 KB /
    102.7 KB gzip), los editores y el dashboard no entran en la primera carga; el
    CSS crece por `.markdown-body` y el resaltado de sintaxis.

## Comandos

```bash
cd apps/admin
pnpm install --frozen-lockfile
pnpm lint
pnpm test
pnpm typecheck
pnpm build
```

## Fuera de alcance

- Cambios en `services/`, `packages/`, `infra/`, Docker o nginx.
- Cambios en `docs/openapi/*.json` o `docs/metrics-api/schema.graphql`.
- Auth, refresh tokens, HMAC, rate limiting, migraciones y seed.
- Toggle de tema claro/oscuro, multi-sitio, tipografía por post, fuentes
  personalizadas, editor por bloques, `contentEditable`, imágenes base64 en
  `localStorage` o datos mock.
- Autosave al servidor: el autosave es local y explícito.
- Refactor MVVM completo.
