# PRODUCT.md — Visión y alcance

## 1. Resumen

**Ryoko** es el sitio personal de Ricardo Reyes Gómez, estudiante de Ingeniería en Tecnologías de la Información e Innovación Digital en la Universidad Politécnica de Chiapas (UPChiapas) y desarrollador full stack con enfoque en seguridad y arquitectura Zero Trust.

El sitio combina tres cosas en un solo producto:

1. **Portafolio**: proyectos presentados como case studies, no como tarjetas con un README pegado.
2. **Blog técnico**: artículos, notas y aprendizajes en español.
3. **Presencia personal**: quién es, qué construye y cómo contactarlo.

El contenido se administra desde un CMS propio con tres APIs FastAPI. El frontend es un sitio estático en Astro desplegado en Vercel.

## 2. Problema que resuelve

El portafolio actual (`TemporalPortfolioWeb`) es un single-page en GitHub Pages con datos hardcodeados. Funciona como vitrina, pero:

- No tiene blog ni contenido editorial.
- No tiene CMS; cada cambio requiere editar código.
- Vive en un subdirectorio de GitHub Pages, no en un dominio propio.
- No tiene case studies profundos ni imágenes de proyectos.
- No tiene métricas propias.

Ryoko resuelve eso con un sitio multi-página, un CMS administrable, un blog real y una identidad visual más madura.

## 3. Audiencia

| Audiencia | Qué busca | Qué debe encontrar |
|---|---|---|
| Reclutadores y líderes técnicos | Evidencia de criterio, comunicación y capacidad de ejecución | Case studies claros, código, decisiones, blog |
| Developers | Aprender de problemas concretos | Posts técnicos, snippets, diagramas |
| Compañeros y profesores | Entender el trabajo académico | Proyectos, contexto, arquitectura, demo |
| Posibles clientes | Confianza para contactar | Portafolio, about, contacto |
| El propio Ricardo | Un sistema fácil de actualizar | CMS, publicación automática, métricas |

## 4. Propuesta de valor

> "Construyo software con mentalidad Zero Trust: verifico cada capa, reduzco la superficie de ataque y documento las decisiones."

El sitio debe demostrar eso, no solo decirlo:

- Cada proyecto explica el problema, las restricciones y las decisiones.
- El blog muestra cómo piensa, no solo qué terminó.
- La UI es rápida, accesible y coherente.
- El CMS demuestra arquitectura de APIs, webhooks y métricas.

## 5. Identidad

| Campo | Valor |
|---|---|
| Marca visible | Ryoko |
| Nombre completo | Ricardo Reyes Gómez |
| Alias / GitHub | RyuheiRG |
| Universidad | Universidad Politécnica de Chiapas (UPChiapas) |
| Carrera | Ingeniería en Tecnologías de la Información e Innovación Digital |
| Semestre | 4.º cuatrimestre, grupo C |
| Dominio | `ryuheirg.dev` |
| Email público | pendiente de definir |
| GitHub | `https://github.com/RyuheiRG` |
| LinkedIn | `https://www.linkedin.com/in/ryuhei-rg/` |
| Steam (opcional, footer) | `https://steamcommunity.com/id/RyuheiRG/` |

## 6. Mapa del sitio v1

| Ruta | Nombre | Propósito |
|---|---|---|
| `/` | Inicio | Hero cinematográfico, statement, trabajo seleccionado, últimos posts, about strip, contacto |
| `/blog` | Blog | Listado de posts, destacado, filtro por tag, paginación |
| `/blog/[slug]` | Post | Artículo con TOC, metadata, tags, relacionados |
| `/proyectos` | Proyectos | Grid/lista de proyectos, destacados primero |
| `/proyectos/[slug]` | Proyecto | Case study completo |
| `/sobre-mi` | Sobre mí | Bio, foto, stack, timeline, certificaciones, contacto |
| `/etiquetas/[tag]` | Tag | Posts filtrados por tema |
| `/rss.xml` | RSS | Feed de posts |
| `/sitemap-index.xml` | Sitemap | Generado por Astro |
| `/404` | 404 | Error con personalidad |
| `/cv` | CV | Descarga de PDF administrada por el CMS (opcional v1.1) |

## 7. Secciones de la home

1. **Hero cinematográfico** (3 etapas de scroll):
   - Rojo: retrato, nombre, rol.
   - Negro: silueta, marca roja, statement.
   - Cuervos: transición a "Trabajo seleccionado".
2. **Statement**: 2–3 líneas sobre enfoque Zero Trust y full stack.
3. **Trabajo seleccionado**: 3 proyectos, filas editoriales con imagen, número, stack y resultado.
4. **Últimos escritos**: 3 posts en lista, con fecha y tiempo de lectura.
5. **About strip**: foto pequeña, bio de 2 líneas, link a `/sobre-mi`.
6. **Contacto / footer**: email, GitHub, LinkedIn, RSS, copyright.

No hay carrusel de stack en la home. El stack vive en `/sobre-mi`.

## 8. Alcance v1

### Entra

- Landing con hero cinematográfico.
- Blog con index, post, tags, RSS.
- Proyectos con index y case studies.
- About con bio, stack, timeline y certificaciones.
- SEO técnico: metadata, canonical, OG, JSON-LD, sitemap, robots.
- Dark mode por defecto; modo lectura "papel" queda para post-v1.
- CMS build-time: landing, posts, proyectos, tags, settings.
- Panel de administración separado en `cms.ryuheirg.dev` para contenido, media y métricas.
- Webhook → n8n → Vercel Deploy Hook.
- Métricas: page views, post views, project clicks, outbound clicks.
- Responsive, accesibilidad AA, performance.
- Migración del contenido de `TemporalPortfolioWeb`.
- Redirección del sitio viejo al dominio nuevo.

### No entra

- Three.js, partículas 3D, parallax en todas las secciones.
- Scroll hijacking o smooth scroll artificial.
- Ads / AdSense.
- Comentarios.
- Newsletter.
- Búsqueda.
- Multiidioma.
- Login o panel de administración dentro del sitio público; el panel vive en `cms.ryuheirg.dev`.
- PWA.
- Modo offline.
- Embeds de video en posts.
- Comercio o pagos.

## 9. Contenido inicial

### Proyectos

| Proyecto | Stack | Ángulo editorial |
|---|---|---|
| Frame-Data-Bayes | Python, Pandas, NumPy, Scikit-Learn, Streamlit | "Cuando tu CSV es un entorno hostil": validación, Bayes, anomalías |
| SecureUP | Kotlin, Jetpack Compose, MVVM, Room, Retrofit, ML Kit | "Verificar contraseñas sin enviarlas": k-anonimato, HIBP, QR |
| Vaca Cúbica | React, Vite, FastAPI, MySQL, AWS EC2/RDS | "React + FastAPI + AWS para gestionar ganado": monorepo, Zero Trust, nube |

Proyectos secundarios (lista compacta en `/proyectos`):

- Event-Manager-Vite
- API-Rest-Cyber_LinKuei

### Posts

1. **Cómo construí Ryoko: Astro, FastAPI y un CMS propio** — arquitectura, webhook, métricas.
2. **Zero Trust aplicado a datos: Frame-Data-Bayes** — Bayes, validación, detección de anomalías.
3. **SecureUP: cómo verificar contraseñas sin enviarlas** — k-anonimato, HIBP, análisis de URLs.

### About

- Bio de 3 párrafos.
- Foto propia.
- Stack agrupado por categorías.
- Timeline: UPChiapas, proyectos, certificaciones.
- Contacto.

## 10. Métricas de éxito

### Producto

- 3 proyectos publicados con case study completo.
- 3 posts publicados al lanzamiento.
- About completo.
- Sitio en dominio propio, HTTPS, sin errores 404 internos.
- CMS puede publicar y el sitio se reconstruye automáticamente.

### Calidad

- Lighthouse ≥ 95 en Performance, Accessibility, Best Practices y SEO.
- LCP < 2.5 s en móvil.
- CLS < 0.1.
- JS de la home < 100 KB gzip (incluyendo animación).
- JS de un post < 15 KB gzip (solo métricas).
- Contraste AA en todo el texto.
- Navegación completa por teclado.
- `prefers-reduced-motion` respetado.

### Contenido

- Cada proyecto responde: problema, restricciones, decisiones, stack, resultado, aprendizaje.
- Cada post tiene título, excerpt, cover, tags, SEO y tiempo de lectura.
- Ningún texto placeholder al lanzar.

## 11. Migración desde TemporalPortfolioWeb

### Reutilizar

- Foto personal (`YO.avif`).
- Logo (`ryuhei-logo.png`) o evolucionarlo a un wordmark "Ryoko".
- Iconos del stack.
- Certificaciones:
  - Operating Systems Support — Cisco — 23/03/2026
  - Operating Systems Basics — Cisco — 13/02/2026
  - AWS Academy Graduate - Cloud Foundations — AWS — 21/11/2025
  - Introduction to IoT — Cisco — 19/11/2025
  - Networking Basics — Cisco — 26/10/2025
- Textos base de proyectos (se reescriben como case studies).
- Links de LinkedIn y GitHub.

### Descartar

- Layout single-page con carrusel de stack.
- Datos hardcodeados.
- Despliegue en GitHub Pages con subdirectorio.
- Componentes React innecesarios; el nuevo sitio debe ser principalmente Astro.

### Redirección

- El sitio viejo se queda unos meses como archivo.
- Su `index.html` incluye:
  - `<meta http-equiv="refresh" content="0; url=https://ryuheirg.dev/">`
  - `<link rel="canonical" href="https://ryuheirg.dev/">`
  - Un enlace visible por si el refresh falla.
- Actualizar GitHub profile, LinkedIn, CV y cualquier bio pública.

## 12. Riesgos y supuestos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| El CMS no está empezado | Alto | Frontend con mocks + contrato congelado |
| El hero cinematográfico se vuelve pesado | Alto | Capas 2D, preload, mobile simplificado, presupuesto JS |
| Copyright del arte | Alto | Arte original; Chainsaw Man solo como moodboard |
| Scope creep (ads, comentarios, etc.) | Medio | Lista explícita de "no entra" |
| Fechas académicas | Medio | Fases independientes; el sitio puede lanzar sin CMS real |
| Dominio no disponible | Bajo | `ryuheirg.dev` parece libre; alternativas documentadas |
| API de métricas sin CORS correcto | Medio | CORS restringido y pruebas desde preview |
| Contenido insuficiente | Medio | 3 proyectos + 3 posts definidos desde ahora |

## 13. No objetivos

- No es una red social.
- No es un blog de noticias.
- No es una plataforma para otros autores.
- No es un producto comercial.
- No es una demo de Three.js.
- No es un escaparate de animaciones.

## 14. Glosario

| Término | Significado |
|---|---|
| Content API | API REST que administra y sirve el contenido del sitio |
| Webhook API | API que recibe eventos del CMS y dispara automatizaciones |
| Metrics API | API GraphQL que ingiere y consulta métricas |
| Build time | Momento en que Astro genera el sitio estático |
| Deploy Hook | URL de Vercel que inicia un nuevo build |
| Preview | Build de una rama o contenido no publicado |
| Case study | Página que explica un proyecto: problema, decisiones, resultado |
| Landing | Página de inicio orientada a presentar a Ricardo |
| Mocks | Datos locales que imitan la API para desarrollar el frontend |
