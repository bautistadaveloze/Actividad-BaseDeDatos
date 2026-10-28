---
name: Clúster en el aula
description: Consola de clúster en vivo para una clase; el proyector es el driver y cada celular un executor.
colors:
  ground: "#0a0a0b"
  surface: "#111113"
  sunken: "#070708"
  hover: "#1a1a1d"
  line: "#232327"
  line-strong: "#34343a"
  ink: "#ededef"
  ink-2: "#a6a6ae"
  ink-3: "#85858e"
  accent: "#5b8cff"
  ok: "#3ecf8e"
  warn: "#f5a524"
  bad: "#f2555a"
  cluster-violet: "#a78bfa"
  cluster-cyan: "#22d3ee"
  cluster-pink: "#f472b6"
  contrast-ground: "#ffffff"
  contrast-ink: "#000000"
  contrast-accent: "#0036c7"
typography:
  display:
    fontFamily: "Atkinson Hyperlegible Next, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.5rem, 4.2vw, 4.75rem)"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Atkinson Hyperlegible Next, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Atkinson Hyperlegible Next, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Atkinson Hyperlegible Next, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 500
  data:
    fontFamily: "Atkinson Hyperlegible Mono, ui-monospace, monospace"
    fontSize: "1.25rem"
    fontWeight: 500
    fontFeature: "tnum"
rounded:
  sm: "6px"
  md: "8px"
  lg: "12px"
  pill: "999px"
spacing:
  xs: "0.25rem"
  sm: "0.5rem"
  md: "1rem"
  lg: "1.5rem"
  xl: "2rem"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.ground}"
    rounded: "{rounded.md}"
    height: "2.5rem"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "2.5rem"
  executor-cell-busy:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
  executor-cell-dead:
    backgroundColor: "{colors.bad}"
    textColor: "{colors.ground}"
    rounded: "{rounded.sm}"
---

# Design System: Clúster en el aula

## Overview

**Creative North Star: "La consola del clúster, legible desde la última fila"**

La convención de la categoría, sin ironía: una consola de monitoreo sobria con la terminación de Vercel o Linear. Fondo casi negro, una sola tinta de acción azul y colores que siempre significan algo. El drama no está en la decoración: está en los datos que se mueven (centroides que viajan, mensajes que llegan al driver, nodos que se caen).

Hay dos temas obligatorios en el proyector: el normal (oscuro) y el de **alto contraste** (blanco puro, tinta negra, trazos de 2 px) para un aula con la luz prendida. Los celulares siguen el tema del sistema (claro u oscuro).

**Key Characteristics:**
- Cada color tiene un trabajo: estado (ok / ámbar / rojo), cluster (violeta / cian / rosa) o acción (azul). Nunca se pisan entre sí.
- Los clusters se distinguen también por **forma** (círculo, cuadrado, triángulo), así nada depende solo del color.
- Los números van en mono tabular; el resto, en sans.

## Colors

Neutrales fríos con un azul de acción, más dos familias que no se cruzan: estados y clusters.

- **Ground / Surface / Sunken** (`#0a0a0b`, `#111113`, `#070708`): tres planos tonales, no sombras.
- **Ink 1–3** (`#ededef`, `#a6a6ae`, `#85858e`): el texto secundario nunca baja de 4.5:1 sobre el fondo.
- **Accent** (`#5b8cff`): foco, selección, executor trabajando, cómputo.
- **Ok / Warn / Bad**: envió y lineage recuperado / straggler, especulación y disco / caído y error.
- **Clusters**: violeta (círculo), cian (cuadrado), rosa (triángulo). Solo marcan pertenencia a un cluster.
- **Contraste**: blanco y negro puros, con versiones oscuras de cada color de cluster y de estado.

## Typography

**Atkinson Hyperlegible Next / Mono**, del Braille Institute: está diseñada para distinguir letras a distancia y con poca visión, que es exactamente la situación de la última fila mirando un proyector. Se sirve desde el propio proyecto.

- El proyector escala todo en `rem`: `html { font-size: clamp(13.5px, 0.55vw + 7.5px, 19px) }`.
- Los títulos llevan tracking entre −0.02 y −0.035em y no tienen kicker encima.
- Los valores numéricos (métricas, bytes, ids) van en mono tabular.

## Layout

- **Driver**: barra superior (marca · stepper de fases · URL/QR · tema), escenario a la izquierda y un rail fijo a la derecha (`clamp(19rem, 24vw, 25rem)`) con executors, controles y registro. El gráfico es cuadrado y se dimensiona con JS al alto disponible; la columna de lectura queda al lado.
- **Worker**: una columna de hasta 30 rem. La acción principal va fija abajo, al alcance del pulgar (dock).
- Debajo de 960 px el driver apila todo en una columna.

## Elevation & Depth

Plano y tonal. Solo los elementos que flotan (menú de executor, banners del celular, hoja del QR) llevan sombra (`--shadow-pop`). En alto contraste, esa sombra se reemplaza por un anillo negro de 2 px.

## Shapes

Radios de 6, 8 y 12 px. Las píldoras se reservan para chips y switches. Los bordes son de 1 px (2 px en contraste) y ningún borde lateral grueso funciona como acento.

## Components

- **Stepper de fases**: control segmentado; la fase activa se eleva con un punto azul y las completadas se atenúan.
- **Celda de executor**: un cuadrado con el id en mono. El estado se lee en el relleno y el borde: trabajando, envió, straggler, caído (relleno rojo y tachado), sin conexión (borde punteado rojo) o reserva (borde punteado).
- **Pregunta para la clase**: un bloque con fondo de acento suave e ícono; es la única pieza "editorial" de cada fase.
- **Opción A/B/C**: una tarjeta radio con la letra, los bytes y una vista previa en mono de lo que se enviaría.
- **Botones**: el primario es tinta sobre fondo (invertido), el secundario es una superficie con borde y el ghost es solo texto. Los íconos son de Lucide, con trazo uniforme.

## Do's and Don'ts

- **Do**: dar a cada color un único significado y acompañar cada color de cluster con su forma.
- **Do**: mostrar los valores reales (bytes, tiempos, costos) en mono tabular.
- **Don't**: usar los colores de cluster para estados, ni los de estado para clusters.
- **Don't**: usar animaciones decorativas en bucle. El movimiento se reserva a los datos (centroides, mensajes que llegan) y a la barra de "trabajando" de cada executor.
