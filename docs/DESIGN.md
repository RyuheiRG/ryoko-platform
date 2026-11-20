# DESIGN.md — Sistema de diseño de Ryoko

## 1. Concepto

**Ryoko / Karasu** es un sitio editorial oscuro con un momento cinematográfico.

- **Ryoko** es la persona y la marca.
- **Karasu** (cuervo) es el sistema visual: siluetas, ojos rojos, plumas, grano, halftone.
- El sitio debe sentirse como una publicación independiente, no como una plantilla de portafolio.
- La referencia emocional es el perfil de Steam de Ryoko: monocromo, mangas, rojo puntual, composición editorial.
- Las imágenes de Chainsaw Man son **moodboard**, no assets. El arte final es original: foto propia, cuervos y marcas rojas.

### Principios

1. **Tipografía primero.** Si una sección no funciona solo con tipografía y espacio, no está resuelta.
2. **Un solo acento.** El rojo señala; no decora.
3. **Un solo momento espectacular.** El hero. El resto es calma.
4. **Contraste y aire.** Mucho negro, mucho espacio, pocos elementos.
5. **Detalle, no cantidad.** Bordes de 1 px, alineación óptica, estados de foco, microcopy.
6. **Rápido es premium.** Una animación que tarda o pesa resta más de lo que suma.

## 2. Paleta

### Tokens base

| Token | Hex | Uso |
|---|---|---|
| `--color-ink` | `#090A0C` | Fondo principal |
| `--color-surface` | `#111316` | Cards, bloques, header |
| `--color-surface-2` | `#17191D` | Hover de superficies |
| `--color-bone` | `#F2F1EF` | Texto principal |
| `--color-muted` | `#A5A6A8` | Texto secundario |
| `--color-faint` | `#6F7175` | Metadata terciaria |
| `--color-line` | `#2B2D31` | Bordes |
| `--color-line-strong` | `#3A3D42` | Bordes hover |
| `--color-crimson` | `#C1121F` | Fondo del hero, bloques grandes |
| `--color-red` | `#F04452` | Acento principal, links, foco |
| `--color-red-bright` | `#FF6B76` | Hover y texto pequeño sobre negro |
| `--color-red-deep` | `#7A0C14` | Sombras y degradados del hero |
| `--color-success` | `#3DDC97` | Solo estados de proyecto `live` |
| `--color-warning` | `#F5B942` | Solo estados `wip` |

### Reglas

- El rojo no se usa como fondo de párrafos ni bloques de texto largo; sí en botones y acentos.
- Para texto rojo sobre negro, usar `--color-red-bright` (mejor contraste).
- Para texto sobre carmesí, usar `--color-bone`.
- No introducir azules, verdes ni morados en el chrome del sitio, salvo los badges de estado (`live` verde, `wip` ámbar). Los acentos de proyecto pueden aparecer **solo dentro de su case study**.
- El modo lectura "papel" (post-v1) usa:
  - `--paper-bg: #F7F4EE`
  - `--paper-ink: #151515`
  - `--paper-muted: #5F5F5F`
  - `--paper-line: #DED9CF`
  - El rojo se mantiene como acento.

### Contraste

- `bone` sobre `ink`: ~17:1.
- `muted` sobre `ink`: ~7:1.
- `red-bright` sobre `ink`: ~6:1.
- `red` sobre `ink`: ~5:1 (solo texto grande o iconos).
- `bone` sobre `crimson`: ~6:1.
- Verificar con axe o WebAIM antes de lanzar.

## 3. Tipografía

### Familias

| Rol | Fuente | Fallback | Uso |
|---|---|---|---|
| Display | **Instrument Serif** | Georgia, serif | Hero, H1, H2 de artículos, pull quotes |
| Texto/UI | **Inter** | system-ui, sans-serif | Párrafos, navegación, botones, forms |
| Mono | **JetBrains Mono** | Consolas, monospace | Metadata, números de sección, código, tags |

Carga:

- Self-hosted con `@fontsource` o archivos locales.
- `font-display: swap`.
- Subset Latin + Latin Extended.
- Preload de Instrument Serif 400 y Inter 400/500.
- No cargar más de 3 familias.

### Escala

| Token | Tamaño | Line-height | Uso |
|---|---|---|---|
| `--text-xs` | 12 px | 1.4 | Metadata, labels |
| `--text-sm` | 14 px | 1.5 | UI, captions |
| `--text-base` | 18 px | 1.7 | Cuerpo de artículo |
| `--text-lg` | 20 px | 1.6 | Intro, lead |
| `--text-xl` | 24 px | 1.4 | H3 |
| `--text-2xl` | 32 px | 1.2 | H2 |
| `--text-3xl` | 40 px | 1.1 | H1 de sección |
| `--text-4xl` | 56 px | 1.05 | H1 de post |
| `--text-hero` | `clamp(3.5rem, 9vw, 9rem)` | 0.92 | Hero |

Reglas:

- Display con `letter-spacing: -0.03em`.
- Inter con `letter-spacing: -0.01em` en titulares; `0` en cuerpo.
- Mono con `letter-spacing: 0.08em` y `text-transform: uppercase` en labels.
- No usar más de 3 tamaños en una misma sección.
- Evitar párrafos centrados; el texto largo se alinea a la izquierda.
- Medida de lectura: 65–70 caracteres (`max-width: 68ch`).

## 4. Grid, espaciado y breakpoints

### Contenedores

| Token | Valor |
|---|---|
| `--container` | 1200 px |
| `--container-narrow` | 880 px |
| `--prose` | 720 px |
| `--gutter` | clamp(1rem, 4vw, 2rem) |

### Espaciado

Base 4 px. Escala: 4, 8, 12, 16, 24, 32, 48, 64, 96, 128.

- Secciones: `clamp(4rem, 10vw, 8rem)` vertical.
- Entre título y contenido: 24–32 px.
- Entre párrafos: 1.25em.
- Entre cards: 16–24 px.

### Breakpoints

| Nombre | Valor |
|---|---|
| `sm` | 640 px |
| `md` | 768 px |
| `lg` | 1024 px |
| `xl` | 1280 px |

### Grid

- Desktop: 12 columnas, gap 24 px.
- Tablet: 8 columnas, gap 20 px.
- Mobile: 4 columnas, gap 16 px.
- El texto de artículo no usa grid; usa `prose`.

## 5. Layouts

### Home

```text
┌─────────────────────────────────────────────┐
│ HEADER: Ryoko       Blog  Proyectos  Sobre  │
├─────────────────────────────────────────────┤
│                                             │
│  HERO STICKY (3 etapas de scroll)           │
│  Rojo → Negro → Cuervos                     │
│                                             │
├─────────────────────────────────────────────┤
│ 01 / STATEMENT                              │
│ Texto grande a la izquierda, datos a la     │
│ derecha (ubicación, enfoque, disponibilidad)│
├─────────────────────────────────────────────┤
│ 02 / TRABAJO SELECCIONADO                   │
│ 01  Frame-Data-Bayes        [imagen]        │
│ 02  SecureUP                [imagen]        │
│ 03  Vaca Cúbica             [imagen]        │
├─────────────────────────────────────────────┤
│ 03 / ESCRITOS                               │
│ Post 01   fecha · 8 min                     │
│ Post 02   fecha · 6 min                     │
│ Post 03   fecha · 10 min                    │
├─────────────────────────────────────────────┤
│ 04 / SOBRE MÍ                               │
│ [foto]  Bio corta + link                    │
├─────────────────────────────────────────────┤
│ FOOTER: contacto, redes, RSS, copyright     │
└─────────────────────────────────────────────┘
```

Reglas:

- El hero ocupa el 100vh visual, pero el contenedor sticky mide ~250–300vh para la secuencia.
- Debajo del hero, la primera sección debe ser contenido real, no otra animación.
- El header es sticky, con fondo `ink/80` y `backdrop-blur`. En el hero puede ser transparente y volverse sólido al salir.
- En móvil, el hero se acorta y el header siempre tiene fondo.

### Blog index

```text
┌─────────────────────────────────────────────┐
│ HEADER                                      │
├─────────────────────────────────────────────┤
│ KARASU / BITÁCORA                           │
│ Título grande + descripción                 │
│ [Todos] [Astro] [Seguridad] [Datos]         │
├─────────────────────────────────────────────┤
│ DESTACADO                                   │
│ [cover grande]  Título                      │
│                 Excerpt                     │
│                 fecha · 8 min · tags        │
├─────────────────────────────────────────────┤
│ LISTA                                       │
│ 2026.11.15  Cómo construí Ryoko      8 min  │
│ 2026.11.08  Zero Trust en datos      6 min  │
│ ...                                         │
├─────────────────────────────────────────────┤
│ PAGINACIÓN                                  │
└─────────────────────────────────────────────┘
```

Reglas:

- El destacado usa una card grande con cover; el resto es lista editorial, no grid de cards.
- Filtros por tag como texto mono con borde inferior; el activo usa rojo.
- Sin sidebar.
- Sin buscador en v1.

### Post

```text
┌─────────────────────────────────────────────┐
│ HEADER                                      │
├─────────────────────────────────────────────┤
│ Breadcrumb / volver al blog                 │
│                                             │
│ Título grande en serif                      │
│ Excerpt / lead                              │
│ fecha · lectura · tags                      │
│                                             │
│ [cover opcional full-bleed]                 │
├─────────────────────────────────────────────┤
│ TOC sticky (desktop)  │  CONTENIDO          │
│ 01 Contexto           │  H2 ...             │
│ 02 Arquitectura       │  párrafos, código   │
│ 03 ...                │  imágenes, quotes   │
├─────────────────────────────────────────────┤
│ COMPARTIR / COPIAR LINK                     │
├─────────────────────────────────────────────┤
│ RELACIONADOS (3)                            │
└─────────────────────────────────────────────┘
```

Reglas:

- TOC a la izquierda en desktop, colapsable arriba en móvil.
- El contenido usa `prose` de 720 px.
- El H1 va en serif; los H2 en serif o sans semibold, consistente.
- Metadata en mono, separada por `·`.
- Cover con `aspect-ratio: 16/10`, `object-fit: cover`.
- Links con subrayado rojo y `text-underline-offset`.
- Blockquotes con borde izquierdo rojo de 2 px.
- Código con Shiki, tema oscuro, botón de copiar.
- Tablas con borde 1 px y scroll horizontal en móvil.
- Footnotes al final, con tipografía pequeña.
- Sin comentarios.

### Projects index

```text
┌─────────────────────────────────────────────┐
│ HEADER                                      │
├─────────────────────────────────────────────┤
│ TRABAJO / PROYECTOS                         │
│ Intro; sin filtros en v1                    │
├─────────────────────────────────────────────┤
│ 01  [cover]  Frame-Data-Bayes               │
│              Python · Datos · Bayes         │
│              "Cuando tu CSV es hostil"      │
├─────────────────────────────────────────────┤
│ 02  [cover]  SecureUP                       │
│              Kotlin · Android · Security    │
├─────────────────────────────────────────────┤
│ 03  [cover]  Vaca Cúbica                    │
│              React · FastAPI · AWS          │
├─────────────────────────────────────────────┤
│ OTROS PROYECTOS (lista compacta)            │
└─────────────────────────────────────────────┘
```

Reglas:

- Filas grandes, no grid de 3 cards. Cada proyecto tiene espacio para respirar.
- Cover con hover a color y un pequeño `translateY(-2px)`.
- Números de proyecto en mono rojo.
- Stack como tags de texto, no iconos gigantes.

### Project detail

```text
┌─────────────────────────────────────────────┐
│ HEADER                                      │
├─────────────────────────────────────────────┤
│ PROYECTO / 2026                             │
│ Título grande                               │
│ Summary                                     │
│ [GitHub] [Demo]                             │
│                                             │
│ [cover full-bleed]                          │
├─────────────────────────────────────────────┤
│ FICHA: rol, stack, año, estado, equipo      │
├─────────────────────────────────────────────┤
│ CASE STUDY                                  │
│ 01 Problema                                 │
│ 02 Restricciones                            │
│ 03 Decisiones                               │
│ 04 Arquitectura (diagrama)                  │
│ 05 Resultado                                │
│ 06 Aprendizajes                             │
├─────────────────────────────────────────────┤
│ GALERÍA                                     │
├─────────────────────────────────────────────┤
│ SIGUIENTE PROYECTO                          │
└─────────────────────────────────────────────┘
```

Reglas:

- El case study es contenido Markdown; la ficha es estructura.
- Diagramas en SVG con el estilo del sitio, no capturas borrosas.
- Capturas en marcos de dispositivo o ventanas, con fondo `surface`.
- Cada proyecto puede tener un acento propio **solo dentro de su página**:
  - Frame-Data-Bayes: ámbar/rojo.
  - SecureUP: verde azulado.
  - Vaca Cúbica: verde.
- El chrome (header, footer, links) sigue siendo rojo.

### About

```text
┌─────────────────────────────────────────────┐
│ HEADER                                      │
├─────────────────────────────────────────────┤
│ SOBRE MÍ                                    │
│ [foto 4:5]   Bio (3 párrafos)               │
│              Datos: UPChiapas, 4.º, MX      │
├─────────────────────────────────────────────┤
│ STACK (grid por categoría)                  │
├─────────────────────────────────────────────┤
│ TIMELINE                                    │
│ 2026  Proyectos, certificaciones            │
│ 2025  Inicio de la carrera                  │
├─────────────────────────────────────────────┤
│ CERTIFICACIONES                             │
├─────────────────────────────────────────────┤
│ CONTACTO                                    │
└─────────────────────────────────────────────┘
```

Reglas:

- Foto en duotono, no a color.
- Bio en primera persona, sin corporate speak.
- Stack en grid de 4–6 columnas, iconos pequeños + nombre.
- Certificaciones como lista, no cards.

### 404

```text
┌─────────────────────────────────────────────┐
│                                             │
│           [ojo rojo / cuervo]               │
│                                             │
│        Esta página se perdió                │
│           entre los cuervos.                │
│                                             │
│           [Volver al inicio]                │
│                                             │
└─────────────────────────────────────────────┘
```

## 6. Hero cinematográfico

### Storyboard

| Progreso | Fondo | Capa principal | Texto | Movimiento |
|---|---|---|---|---|
| 0–33% | Carmesí `#C1121F` | Retrato duotono a la derecha | "RYOKO" en serif gigante; label "RICARDO REYES / FULL STACK + SECURITY" | El retrato entra desde la derecha con `translateX(8%)` a `0`; los cuervos aparecen en los bordes |
| 33–66% | Transición a `#090A0C` | Silueta del retrato; marca roja (ojo/línea) | "Construyo sistemas que no confían en nada." | El fondo se oscurece; la silueta se desvanece; la marca roja escala de 0.9 a 1 y hace un glow sutil |
| 66–100% | Negro | Cuervos en silueta | "Trabajo seleccionado" | Los cuervos barren de izquierda a derecha y se abren para revelar la siguiente sección |

### Capas

1. Fondo sólido (CSS).
2. Retrato recortado (imagen optimizada, PNG/AVIF con transparencia o máscara).
3. Marca roja (SVG).
4. Cuervos (SVG o PNG, 2–3 capas para parallax).
5. Texto (HTML real, no imagen).
6. Grano/halftone (SVG/CSS, opacidad 0.04–0.08).

### Implementación

- Contenedor `.hero` con `height: 300vh` en desktop; `.hero__sticky` con `position: sticky; top: 0; height: 100vh`.
- Progreso calculado con `scrollY` y `requestAnimationFrame`, o con Motion One `scroll()`.
- Animaciones con `transform` y `opacity`; evitar `top`, `left`, `width`, `height`.
- `will-change` solo durante la secuencia.
- Pausar cuando el hero no está visible (`IntersectionObserver`).
- Respetar `prefers-reduced-motion`: mostrar la primera etapa estática, sin scroll largo.
- En móvil: 150vh o 2 etapas; reducir capas y parallax.
- Preload de la primera imagen; las demás `loading="lazy"` excepto la capa que entra en el primer viewport.
- Botón "Saltar introducción" visible al hacer focus o en la esquina.

### Copy del hero

- Etapa 1:
  - Eyebrow: `RICARDO REYES GÓMEZ / FULL STACK + SECURITY`
  - Título: `RYOKO`
  - Sub: `Desarrollador full stack. Estudiante. Zero Trust.`
- Etapa 2:
  - Frase: `Construyo sistemas que no confían en nada.`
  - Micro: `Verifico cada capa. Documento cada decisión.`
- Etapa 3:
  - Label: `01 / TRABAJO SELECCIONADO`
  - Título: `Sistemas con intención.`

### Performance del hero

- Primera imagen < 200 KB.
- Total de capas < 500 KB.
- JS del hero < 40 KB gzip.
- LCP: la primera etapa debe renderizar sin esperar al JS.
- Sin video autoplay.
- Sin canvas 3D en v1.

## 7. Componentes

### Inventario

| Componente | Variantes | Notas |
|---|---|---|
| `SiteHeader` | transparente / sólido / mobile | Sticky, blur, borde inferior |
| `SiteFooter` | default | Links, RSS, copyright |
| `Container` | default / narrow / prose | |
| `SectionLabel` | default / red | Mono, número + label |
| `Button` | primary / secondary / ghost | Sin radios grandes; 2 px |
| `LinkArrow` | inline | Flecha `↗` o `→` |
| `Tag` | default / active | Texto mono, borde |
| `PostRow` | default / featured | Fecha, título, lectura |
| `PostCard` | default / featured | Cover + título + excerpt |
| `ProjectRow` | default / featured | Número, cover, título, stack |
| `ProjectCard` | compact | Para "otros proyectos" |
| `Prose` | default / paper | Estilos de Markdown |
| `TOC` | desktop / mobile | Sticky / colapsable |
| `CodeBlock` | default | Shiki + copiar |
| `Callout` | note / warning | Blockquote estilizado |
| `Figure` | default / full-bleed | Imagen + caption |
| `Pagination` | default | Anterior / siguiente |
| `SkipLink` | default | Accesibilidad |
| `CrowMark` | default | SVG de cuervo |
| `NoiseOverlay` | hero only | Grano sutil |
| `ThemeToggle` | paper mode | Post-v1 |

### Estados

- **Hover:** borde `line-strong`, color `red-bright`, `translateY(-2px)` en cards.
- **Focus:** outline 2 px `red`, offset 4 px.
- **Active:** sin sombras; solo cambio de color.
- **Disabled:** opacidad 0.4, cursor `not-allowed`.
- **Loading:** no aplica en estático; para islas, skeleton simple.

### Botones

- Primario: fondo `red`, texto `ink`, borde `red`; hover `red-bright`.
- Secundario: transparente, borde `line`, texto `bone`; hover borde `red`.
- Ghost: texto `muted`, hover `bone`.
- Altura mínima: 44 px.
- Padding: 12–20 px.
- Sin `border-radius` mayor a 2 px.

### Tags

- Texto mono 12 px, uppercase, tracking 0.08em.
- Borde 1 px `line`.
- Padding 4 px 8 px.
- Hover: borde `red`, texto `red-bright`.
- Activo: fondo `red`, texto `ink`.

## 8. Movimiento

| Interacción | Duración | Easing |
|---|---|---|
| Hover de link | 150 ms | `ease-out` |
| Hover de card | 200 ms | `cubic-bezier(0.2, 0.7, 0.2, 1)` |
| Aparición de sección | 500 ms | `cubic-bezier(0.2, 0.7, 0.2, 1)` |
| Hero stage | controlado por scroll | lineal con suavizado |
| Cambio de página | 250 ms | `ease-out` |
| TOC active | 150 ms | `ease-out` |

Reglas:

- No animar `box-shadow` ni `filter` en listas largas.
- No usar `scroll-behavior: smooth` global; solo en anchors internos.
- No secuestrar el scroll.
- No animar más de 2 propiedades por elemento.
- `prefers-reduced-motion`: desactivar transforms y dejar solo opacity o nada.

## 9. Imágenes y texturas

### Tratamiento

- Fotos personales: duotono negro/rojo, alto contraste, grano sutil.
- Capturas de proyectos: mantener color original, pero dentro de un marco oscuro.
- Diagramas: SVG monocromo con acentos rojos.
- Covers de proyecto: 16:10, 1600×1000 mínimo.
- Covers de post: 16:10, 1600×1000.
- OG images: 1200×630.
- Avatares: 1:1, 400×400.

### Formatos

- AVIF y WebP; JPEG fallback.
- `srcset` con 400, 800, 1200, 1600.
- `loading="lazy"` excepto hero.
- `width` y `height` siempre definidos.
- `alt` descriptivo, no "imagen de...".

### Texturas

- Grid de fondo: líneas de 1 px, opacidad 0.03, solo en el hero y el footer.
- Grano: SVG noise, opacidad 0.04, solo en el hero.
- Halftone: patrón de puntos en imágenes del hero, no en el cuerpo del artículo.
- Nada de gradientes rainbow ni glassmorphism decorativo; el blur del header es funcional.

## 10. Accesibilidad

- [ ] Contraste AA en todo el texto.
- [ ] `focus-visible` en todos los interactivos.
- [ ] Skip link al contenido.
- [ ] HTML semántico: `header`, `nav`, `main`, `article`, `aside`, `footer`.
- [ ] Un solo `h1` por página.
- [ ] Jerarquía de headings correcta.
- [ ] `alt` en imágenes; decorativas con `alt=""`.
- [ ] `aria-label` en iconos y botones sin texto.
- [ ] Navegación por teclado en menú, TOC, filtros y paginación.
- [ ] `prefers-reduced-motion` respetado.
- [ ] Sin flashes rápidos ni rojo/negro alternante.
- [ ] Texto del hero presente en el DOM, no solo en imágenes.
- [ ] Enlaces externos con `rel="noopener noreferrer"`.
- [ ] Formularios (si existen) con labels y errores asociados.

## 11. Performance

### Presupuestos

| Métrica | Objetivo |
|---|---|
| Lighthouse Performance | ≥ 95 |
| LCP móvil | < 2.5 s |
| CLS | < 0.1 |
| INP | < 200 ms |
| JS home | < 100 KB gzip |
| JS post | < 15 KB gzip |
| CSS | < 30 KB gzip |
| Hero imágenes | < 500 KB total |
| Fuentes | < 120 KB total |

### Reglas

- Astro estático; cero JS por defecto.
- Islas solo para: menú móvil, TOC, copiar código, toggle de tema, métricas.
- Hero con transform/opacity, no layout.
- `content-visibility: auto` en secciones below-the-fold.
- No cargar la librería de animación en artículos.
- No cargar iconos como fuente; SVG inline o sprite.
- No usar Google Fonts en runtime; self-hosted.
- No usar imágenes de 4K sin redimensionar.

## 12. SEO visual

- OG image template:
  - Fondo `ink`.
  - Borde superior rojo de 8 px.
  - Título en Instrument Serif, 64 px.
  - Label mono `RYOKO / BLOG`.
  - Cuervo pequeño en la esquina.
  - Sin fotos en OG; legibilidad primero.
- Títulos de página: `{Título} — Ryoko`.
- Home: `Ryoko — Ricardo Reyes Gómez | Full Stack + Security`.
- Blog: `Karasu / Bitácora — Ryoko`.
- Proyectos: `Proyectos — Ryoko`.
- About: `Sobre mí — Ricardo Reyes Gómez`.

## 13. Tono y microcopy

- Español neutro con términos técnicos en inglés cuando sean estándar (`build`, `deploy`, `webhook`, `stack`).
- Primera persona, directo, sin "apasionado por la tecnología".
- Frases cortas. Sin signos de exclamación.
- El rojo se usa para señalar, no para gritar.
- Ejemplos:
  - `Ver proyectos`
  - `Leer el blog`
  - `Trabajo seleccionado`
  - `Últimos escritos`
  - `Hablemos`
  - `Volver al inicio`
  - `Esta página se perdió entre los cuervos.`
  - `Don't trust, verify.` (solo como detalle en footer, no en todo el sitio)

## 14. Do / Don't

### Do

- Usar espacio en blanco como material de diseño.
- Un acento rojo y muchos neutros.
- Titulares grandes y párrafos cómodos.
- Imágenes con tratamiento consistente.
- Un solo hero animado.
- Detalles: foco, hover, selección, scrollbar, favicon, 404.

### Don't

- Cards dentro de cards.
- Sombras difusas.
- Gradientes decorativos.
- Iconos de relleno sin función.
- Animaciones en cada sección.
- Carruseles.
- Popups.
- Ads.
- Texto gris sobre negro sin contraste.
- Arte oficial de anime.
- Emojis en la UI principal.

## 15. Referencias

- Perfil de Steam de Ryoko: composición monocroma, rojo puntual, galería.
- Linear: claridad, tipografía, detalle.
- Vercel: contraste, minimalismo técnico.
- Rauno Freiberg: microinteracciones.
- Josh Comeau: profundidad editorial.
- Chainsaw Man (moodboard): rojo, negro, cuervos, ojos, halftone.

## 16. QA visual

- [ ] La home se ve bien en 360, 390, 768, 1024, 1440 y 1920 px.
- [ ] El hero no rompe el scroll en iOS.
- [ ] El hero tiene fallback estático.
- [ ] Los textos largos se leen cómodos en móvil.
- [ ] Ningún elemento se sale del viewport.
- [ ] Los covers no se estiran ni se recortan mal.
- [ ] El foco es visible en todos los interactivos.
- [ ] El modo oscuro no tiene texto ilegible.
- [ ] Las imágenes tienen alt.
- [ ] El 404 tiene personalidad.
- [ ] La selección de texto usa el rojo.
- [ ] El favicon se ve a 16×16.
