# ROADMAP.md — Fases, tareas y criterios de aceptación

> El orden está pensado para que el frontend no dependa del CMS.
> El CMS y el frontend pueden avanzar en paralelo después de la Fase 0.

## Resumen de fases

| Fase | Track | Resultado |
|---|---|---|
| 0 | Ambos | Decisiones, dominio, contrato, wireframes, mocks |
| 1 | Frontend | Astro + design system + home estática |
| 2 | Frontend | Blog, posts, tags, RSS, SEO con mocks |
| 3 | Frontend | Proyectos, about, case studies, GitHub |
| 4 | Frontend | Hero cinematográfico + pulido |
| 5 | CMS | Content API |
| 6 | CMS | Webhook API + n8n |
| 7 | CMS | Metrics API GraphQL |
| 7.5 | CMS | Admin UI |
| 8 | Ambos | Integración real + deploy |
| 9 | Ambos | Contenido, migración y lanzamiento |

Las fases 1–4 y 5–7.5 pueden solaparse. La integración real ocurre en la fase 8.

---

## Fase 0 — Definición y fundación

### Objetivo

Cerrar las decisiones que afectan a todo el proyecto y dejar el contrato congelado.

### Tareas

- [x] Definir marca, dominio y alcance.
- [x] Definir stack frontend.
- [x] Definir arquitectura de las 3 APIs.
- [x] Definir dirección visual.
- [x] Definir contenido inicial.
- [x] Escribir `PRODUCT.md`, `API-CONTRACT.md`, `DESIGN.md`, `FRONTEND-ARCHITECTURE.md`, `CONTENT.md`, `AGENTS.md`, `ROADMAP.md`.
- [ ] Comprar `ryuheirg.dev`.
- [ ] Configurar DNS en Cloudflare o Vercel.
- [x] Crear repo `dev-blog-ryoko`.
- [ ] Crear repo `ryoko-platform`.
- [ ] Crear wireframes de home, blog, post y proyecto (Figma o papel).
- [ ] Crear mock data que cumpla los schemas.
- [ ] Revisar el contrato con quien construirá el CMS.
- [ ] Definir email público.
- [ ] Conseguir foto de mayor resolución.
- [ ] Recolectar capturas de proyectos.

### Entregables

- Documentación completa.
- Dominio comprado.
- Repos creados.
- Wireframes aprobados.
- Mocks validados.

### Criterio de aceptación

- No hay decisiones abiertas que bloqueen el frontend.
- El contrato tiene ejemplos para todos los recursos.
- Los mocks cubren posts, proyectos, tags, landing y settings.

### Riesgos

- Cambiar de opinión sobre el nombre o el dominio.
- No tener contenido real a tiempo.
- No tener claro el alcance del CMS.

---

## Fase 1 — Fundación del frontend

### Objetivo

Tener un Astro funcionando con el design system, layout y home estática.

### Tareas

- [ ] `pnpm create astro@latest` con TypeScript estricto.
- [ ] Configurar Tailwind CSS 4 con `@tailwindcss/vite`.
- [ ] Crear `src/styles/tokens.css` con la paleta y tipografía.
- [ ] Configurar fuentes self-hosted (Instrument Serif, Inter, JetBrains Mono).
- [ ] Crear `BaseLayout.astro` con SEO básico.
- [ ] Crear `SiteHeader.astro`, `SiteFooter.astro`, `Container.astro`.
- [ ] Crear `SectionLabel.astro`, `Button.astro`, `Tag.astro`.
- [ ] Crear `src/lib/constants.ts` con site config.
- [ ] Crear `src/data/mock/` con datos de prueba.
- [ ] Crear `src/lib/cms/` con schemas, client y queries (modo mock).
- [ ] Implementar home estática: statement, trabajo seleccionado, últimos escritos, about strip.
- [ ] Configurar `@astrojs/sitemap`.
- [ ] Configurar `robots.txt`.
- [ ] Configurar 404.
- [ ] Configurar Vercel y preview deployment.

### Entregables

- Home estática desplegada en preview.
- Design tokens funcionando.
- Header/footer responsive.
- Mocks consumidos por la home.

### Criterio de aceptación

- `pnpm build` pasa.
- La home se ve bien en 360/768/1440.
- Lighthouse ≥ 95 en la home estática.
- No hay colores hardcodeados fuera de tokens.
- El header y footer son accesibles por teclado.

### Esfuerzo

**M** (3–5 sesiones de trabajo).

---

## Fase 2 — Blog y contenido

### Objetivo

Tener blog index, post, tags, RSS y SEO completo, todavía con mocks.

### Tareas

- [ ] Implementar `src/lib/markdown.ts` con `remark`/`rehype` + Shiki.
- [ ] Crear `Prose.astro` con estilos de artículo.
- [ ] Crear `CodeBlock.astro` con botón copiar.
- [ ] Crear `TOC.astro`.
- [ ] Crear `blog/index.astro` con destacado, lista y filtros por tag.
- [ ] Crear `blog/[slug].astro` con `getStaticPaths`.
- [ ] Crear `etiquetas/[tag].astro`.
- [ ] Crear `rss.xml.ts`.
- [ ] Implementar `seo.ts` y `jsonld.ts`.
- [ ] Implementar OG default y OG por post.
- [ ] Implementar paginación.
- [ ] Implementar posts relacionados.
- [ ] Implementar botón copiar link.
- [ ] Agregar mocks de 4 posts y 4 tags.
- [ ] Validar Markdown con tests.
- [ ] Revisar accesibilidad de TOC y code blocks.
- [ ] Revisar performance de un post.

### Entregables

- Blog funcional con 4 posts mock.
- RSS válido.
- Sitemap con posts.
- OG images.
- Tests de sanitización.

### Criterio de aceptación

- Un post se lee cómodo en móvil y desktop.
- El TOC navega correctamente.
- El código tiene highlighting y copiar.
- No se puede inyectar HTML/script desde el Markdown.
- `pnpm build` pasa.
- Lighthouse ≥ 95 en un post.
- JS del post < 15 KB gzip.

### Esfuerzo

**M** (4–6 sesiones).

---

## Fase 3 — Proyectos y about

### Objetivo

Tener portafolio y about completos, con case studies y metadata de GitHub.

### Tareas

- [ ] Crear `proyectos/index.astro`.
- [ ] Crear `proyectos/[slug].astro`.
- [ ] Crear `ProjectRow.astro`, `ProjectMeta.astro`, `ProjectGallery.astro`.
- [ ] Crear `sobre-mi.astro`.
- [ ] Crear `scripts/fetch-github.ts`.
- [ ] Integrar `github-cache.json`.
- [ ] Crear mocks de 3 proyectos + 2 secundarios.
- [ ] Crear portadas provisionales.
- [ ] Crear diagramas de arquitectura para los 3 proyectos.
- [ ] Integrar galerías de SecureUP y Vaca Cúbica.
- [ ] Implementar `CreativeWork` JSON-LD.
- [ ] Implementar siguiente proyecto.
- [ ] Revisar responsive de las fichas.
- [ ] Revisar performance de imágenes.

### Entregables

- Índice de proyectos.
- 3 case studies completos.
- About con stack y certificaciones.
- Metadata de GitHub (si hay token).

### Criterio de aceptación

- Cada proyecto se entiende sin abrir el repo.
- Las imágenes tienen alt y dimensiones.
- El build no falla si GitHub falla.
- Las páginas son responsive.
- Lighthouse ≥ 95.

### Esfuerzo

**M/L** (5–7 sesiones, depende de los assets).

---

## Fase 4 — Hero cinematográfico y pulido

### Objetivo

Implementar el hero de 3 etapas y dejar el sitio listo visualmente.

### Tareas

- [ ] Crear `Hero.astro`, `HeroStage.astro`, `CrowLayer.astro`.
- [ ] Crear assets del hero:
  - Retrato duotono.
  - Marca roja.
  - Cuervos en 2–3 capas.
  - Grano/halftone.
- [ ] Implementar scroll sticky.
- [ ] Implementar animación con Motion One o GSAP.
- [ ] Implementar fallback `prefers-reduced-motion`.
- [ ] Implementar versión móvil simplificada.
- [ ] Implementar "Saltar introducción".
- [ ] Optimizar imágenes del hero.
- [ ] Medir LCP y ajustar.
- [ ] Revisar scroll en iOS Safari.
- [ ] Revisar que el hero no bloquee el teclado.
- [ ] Pulir hover, foco y transiciones.
- [ ] Revisar 404 y estados vacíos.
- [ ] Revisar contraste y axe.
- [ ] Revisar Lighthouse final.

### Entregables

- Hero cinematográfico funcionando.
- Fallback estático.
- Presupuesto de performance cumplido.

### Criterio de aceptación

- El hero se siente fluido en desktop.
- En móvil no causa fatiga de scroll.
- Con reduced motion se ve una composición estática correcta.
- LCP < 2.5 s.
- JS de home < 100 KB gzip.
- Sin errores de consola.

### Esfuerzo

**L** (4–6 sesiones, es la pieza más riesgosa).

---

## Fase 5 — Content API

### Objetivo

Construir la API REST que administra y sirve el contenido.

### Tareas

- [ ] Crear monorepo `ryoko-platform`.
- [ ] Configurar `pyproject.toml`, Ruff, mypy, pytest.
- [ ] Configurar Docker Compose con PostgreSQL.
- [ ] Crear `packages/common` con settings, errors, logging, auth, pagination.
- [ ] Crear modelos SQLAlchemy y migraciones Alembic.
- [ ] Implementar auth JWT + refresh tokens + Argon2id.
- [ ] Implementar CRUD de posts.
- [ ] Implementar publicación/despublicación.
- [ ] Implementar CRUD de proyectos.
- [ ] Implementar CRUD de tags.
- [ ] Implementar landing y settings.
- [ ] Implementar media upload con R2/Cloudinary.
- [ ] Implementar documents.
- [ ] Implementar redirects.
- [ ] Implementar endpoints públicos.
- [ ] Implementar rate limiting.
- [ ] Implementar OpenAPI docs.
- [ ] Implementar webhook dispatch al publicar (llamada a Webhook API).
- [ ] Tests de contrato.
- [ ] Seed de datos con los mocks actuales de `dev-blog-ryoko` (posts, proyectos, tags, landing y settings).
- [ ] Deploy en Render/Railway/Fly.
- [ ] Configurar `CMS_API_TOKEN`.

### Entregables

- Content API desplegada.
- OpenAPI disponible.
- CRUD funcional.
- Endpoints públicos estables.
- Seed inicial con los mocks actuales: 3 posts, 3 proyectos, tags, landing y site settings.

### Criterio de aceptación

- Todos los endpoints del contrato existen.
- Auth y roles funcionan.
- Un token público no puede escribir.
- Publicar dispara un evento.
- Tests pasan.
- Migraciones aplican desde cero.
- Health check responde.

### Esfuerzo

**L** (8–12 sesiones).

---

## Fase 6 — Webhook API + n8n

### Objetivo

Automatizar el rebuild del sitio al publicar.

### Tareas

- [ ] Crear `services/webhook-api`.
- [ ] Implementar `POST /v1/events` con HMAC.
- [ ] Implementar idempotencia.
- [ ] Implementar persistencia de eventos e intentos.
- [ ] Implementar reintentos con backoff.
- [ ] Implementar dead-letter.
- [ ] Implementar endpoints admin de eventos.
- [ ] Configurar n8n.
- [ ] Crear workflow: evento → Vercel Deploy Hook → notificación.
- [ ] Configurar fallback directo a Vercel.
- [ ] Configurar Discord/Telegram.
- [ ] Probar firma inválida, replay y duplicado.
- [ ] Probar publicación real desde el CMS.
- [ ] Documentar operación.

### Entregables

- Webhook API desplegada.
- Workflow de n8n funcionando.
- Publicar en CMS reconstruye el sitio.

### Criterio de aceptación

- Un `post.published` dispara un build.
- Un evento duplicado no dispara dos builds.
- Una firma inválida devuelve 401.
- Un fallo de n8n no pierde el evento.
- Hay logs y notificación.

### Esfuerzo

**M** (4–6 sesiones).

---

## Fase 7 — Metrics API GraphQL

### Objetivo

Registrar visitas y clicks, y exponer consultas para el dashboard.

### Tareas

- [ ] Crear `services/metrics-api`.
- [ ] Configurar Strawberry GraphQL.
- [ ] Implementar schema del contrato.
- [ ] Implementar `trackEvent` y `trackEvents`.
- [ ] Implementar idempotencia por `event_id`.
- [ ] Implementar queries `pageViews`, `topPosts`, `projectClicks`, `outboundClicks`, `adMetrics`, `realtime`.
- [ ] Implementar CORS.
- [ ] Implementar rate limiting.
- [ ] Implementar hashing de IP y retención.
- [ ] Crear índices y vistas materializadas.
- [ ] Tests de mutaciones y queries.
- [ ] Deploy.
- [ ] Documentar operación.

### Entregables

- Metrics API desplegada.
- Eventos del blog registrados.
- Dashboard puede consultar.

### Criterio de aceptación

- Un `PAGE_VIEW` se registra una sola vez.
- Un evento duplicado no se cuenta dos veces.
- CORS solo acepta el dominio del blog.
- Las queries requieren JWT.
- La retención está configurada.
- No se guarda PII.

### Esfuerzo

**M/L** (5–7 sesiones).

---

## Fase 7.5 — Admin UI

### Objetivo

Construir el panel que permite administrar el contenido y consultar métricas sin usar la API a mano. Es un entregable separado de las tres APIs y vive en `apps/admin` dentro de `ryoko-platform`.

### Stack propuesto

- React + Vite + TypeScript.
- Tailwind CSS 4 con los tokens de `docs/DESIGN.md`.
- TanStack Query para datos remotos y Zod para validar formularios.
- SPA estática desplegada en `cms.ryuheirg.dev`.

### Tareas

- [ ] Crear `apps/admin` y su pipeline de build.
- [ ] Implementar login, refresh y cierre de sesión contra Content API.
- [ ] Implementar dashboard con `pageViews`, `topPosts`, `projectClicks` y `realtime`.
- [ ] Implementar listado y editor de posts con Markdown, tags, portada opcional, SEO y publicación.
- [ ] Implementar listado y editor de proyectos con galería, stack, estados y SEO.
- [ ] Implementar tags, landing, settings y redirects.
- [ ] Implementar biblioteca de media y documentos.
- [ ] Implementar bandeja de eventos del webhook con reintento manual.
- [ ] Agregar navegación, estados vacíos, errores RFC 7807 y confirmaciones.
- [ ] Configurar CORS y deploy.

### Entregables

- Panel funcional en `cms.ryuheirg.dev`.
- CRUD de contenido y métricas visibles.
- Build reproducible y documentado.

### Criterio de aceptación

- Un editor puede iniciar sesión y publicar un post.
- Un admin puede ver métricas y reintentar un webhook fallido.
- El token público del frontend no sirve para entrar al panel.
- Los roles `admin` y `editor` respetan los permisos del contrato.
- La UI funciona en escritorio y móvil.

### Esfuerzo

**M/L** (6–10 sesiones).

---

## Fase 8 — Integración real

### Objetivo

Conectar frontend y CMS, desplegar en el dominio y validar el flujo completo.

### Tareas

- [ ] Apuntar `CMS_API_URL` a producción.
- [ ] Configurar `CMS_API_TOKEN` en Vercel.
- [ ] Validar todos los schemas contra la API real.
- [ ] Corregir diferencias de contrato.
- [ ] Configurar `METRICS_API_URL` y `METRICS_SITE_KEY`.
- [ ] Implementar analytics en el frontend.
- [ ] Validar eventos en el dashboard.
- [ ] Configurar Deploy Hook.
- [ ] Probar publicación end-to-end.
- [ ] Probar despublicación.
- [ ] Probar cambio de slug y redirect.
- [ ] Probar preview de draft (si aplica).
- [ ] Configurar dominio y HTTPS.
- [ ] Configurar headers de seguridad.
- [ ] Configurar backups.
- [ ] Configurar monitoreo de errores.
- [ ] Revisar logs.

### Entregables

- Sitio en `https://ryuheirg.dev`.
- CMS publica y el sitio se actualiza.
- Métricas funcionando.
- Redirects funcionando.

### Criterio de aceptación

- El flujo completo funciona sin intervención manual.
- No hay errores 500 en el build.
- El sitio mantiene el deploy anterior si algo falla.
- Las métricas se ven en el dashboard.
- Los headers de seguridad están activos.

### Esfuerzo

**M** (3–5 sesiones).

---

## Fase 9 — Contenido, migración y lanzamiento

### Objetivo

Publicar contenido real y retirar el portafolio viejo.

### Tareas

- [ ] Escribir los 3 posts.
- [ ] Escribir los 3 case studies.
- [ ] Revisar about.
- [ ] Crear portadas definitivas.
- [ ] Crear OG images.
- [ ] Revisar SEO de cada página.
- [ ] Revisar enlaces internos.
- [ ] Revisar ortografía.
- [ ] Probar en dispositivos reales.
- [ ] Probar en Chrome, Firefox, Safari.
- [ ] Ejecutar Lighthouse final.
- [ ] Ejecutar axe final.
- [ ] Configurar redirect del sitio viejo.
- [ ] Actualizar GitHub profile.
- [ ] Actualizar LinkedIn.
- [ ] Actualizar CV.
- [ ] Publicar.
- [ ] Anunciar en redes.
- [ ] Monitorear las primeras 48 h.

### Entregables

- Sitio lanzado.
- Contenido real.
- Portafolio viejo redirigido.
- Perfiles actualizados.

### Criterio de aceptación

- No hay placeholders.
- No hay enlaces rotos.
- El sitio se ve bien en móvil.
- El dominio funciona con y sin `www`.
- El RSS es válido.
- El sitemap incluye todas las páginas.
- El 404 funciona.
- El redirect del sitio viejo funciona.

### Esfuerzo

**M/L** (5–8 sesiones, depende de la escritura).

---

## Backlog post-v1

Priorizado por impacto:

| Prioridad | Feature | Notas |
|---|---|---|
| Alta | Búsqueda local | Pagefind o índice JSON; después de 10 posts |
| Alta | Modo lectura papel | Toggle en posts |
| Media | Newsletter | Buttondown o Resend; solo si hay cadencia |
| Media | Comentarios | Giscus; requiere moderación |
| Media | Serie de posts | Agrupar posts |
| Media | Página `/uses` | Setup y herramientas |
| Media | Página `/now` | Qué estás haciendo ahora |
| Media | CV descargable | Documento del CMS |
| Baja | 3D de cuervos | Solo desktop, lazy, progressive enhancement |
| Baja | i18n | Solo si hay demanda real |
| Baja | Ads / sponsor | Solo si la materia lo exige |
| Baja | PWA | No aporta al objetivo |
| Baja | View Transitions | Probar después del lanzamiento |

## Checklist de lanzamiento

### Técnico

- [ ] Dominio comprado y DNS configurado.
- [ ] HTTPS activo.
- [ ] `www` redirige al apex.
- [ ] Vercel conectado al repo.
- [ ] Build de producción pasa.
- [ ] Variables de entorno configuradas.
- [ ] Content API accesible.
- [ ] Webhook y n8n funcionando.
- [ ] Metrics API registrando.
- [ ] Sitemap y RSS válidos.
- [ ] Robots.txt correcto.
- [ ] OG images correctas.
- [ ] 404 correcto.
- [ ] Redirects probados.
- [ ] Headers de seguridad.
- [ ] Backups configurados.
- [ ] Monitoreo de errores.

### Contenido

- [ ] 3 proyectos publicados.
- [ ] 3 posts publicados.
- [ ] About completo.
- [ ] Sin lorem ipsum.
- [ ] Sin enlaces rotos.
- [ ] Sin errores ortográficos.
- [ ] Imágenes con alt.
- [ ] Fechas correctas.
- [ ] Tags correctos.

### Calidad

- [ ] Lighthouse ≥ 95.
- [ ] LCP < 2.5 s.
- [ ] CLS < 0.1.
- [ ] axe sin errores críticos.
- [ ] Navegación por teclado.
- [ ] Reduced motion.
- [ ] Responsive 360/768/1440.
- [ ] Chrome, Firefox, Safari.
- [ ] Sin errores de consola.

### Marca

- [ ] Favicon.
- [ ] OG default.
- [ ] 404 con personalidad.
- [ ] Footer con contacto y RSS.
- [ ] Copy revisado.

### Migración

- [ ] Sitio viejo redirige.
- [ ] GitHub profile actualizado.
- [ ] LinkedIn actualizado.
- [ ] CV actualizado.
- [ ] Repo viejo marcado como archivado.
- [ ] README del repo nuevo.

## Post-lanzamiento

### Primeras 48 horas

- Revisar logs de Vercel.
- Revisar errores de n8n.
- Revisar eventos de métricas.
- Revisar que los redirects funcionen.
- Revisar enlaces de contacto.
- Corregir cualquier error visual.

### Primer mes

- Publicar 1 post.
- Revisar páginas más visitadas.
- Revisar clicks a proyectos.
- Revisar tiempo de build.
- Revisar Core Web Vitals.
- Recoger feedback.
- Priorizar backlog.

### Cada trimestre

- Actualizar proyectos.
- Revisar dependencias.
- Revisar backups.
- Revisar analytics.
- Revisar contenido obsoleto.

## Riesgos del roadmap

| Riesgo | Fase | Mitigación |
|---|---|---|
| El CMS se retrasa | 5–8 | Frontend con mocks; integración al final |
| El hero consume demasiado tiempo | 4 | Prototipo temprano; fallback estático |
| No hay contenido real | 9 | Escribir en paralelo desde la fase 1 |
| Faltan capturas | 3, 9 | Crear diagramas/portadas tipográficas |
| El dominio se complica | 0 | `ryuheirg.dev`; alternativas documentadas |
| CORS mal configurado | 8 | Probar desde preview y producción |
| Cold starts de FastAPI | 5–8 | Render/Railway con plan adecuado; cache |
| Falta de tiempo por clases | Todas | Fases independientes; lanzar sin extras |

## Definición de v1 terminada

- [ ] `https://ryuheirg.dev` live.
- [ ] 3 proyectos + 3 posts + about.
- [ ] CMS publica y dispara deploy.
- [ ] Métricas registran page views y clicks.
- [ ] Lighthouse ≥ 95.
- [ ] Accesibilidad AA.
- [ ] Sitio viejo redirigido.
- [ ] Documentación actualizada.
- [ ] Sin pendientes críticos.
