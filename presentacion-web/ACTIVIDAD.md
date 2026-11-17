# Actividad web · diseño y contrato

Este documento describe la actividad en vivo (celulares + proyector) y el contrato entre el servidor y las dos pantallas. Es la fuente de verdad: si el código y este documento no coinciden, hay que corregir uno de los dos.

## 1. Objetivo

Que alguien que recién empieza con el tema entienda, haciéndolo y en el mismo orden en que funciona Spark, cinco ideas:

1. **Driver:** el programa que tiene el trabajo. Solo, con todos los datos, no da abasto.
2. **Cluster manager:** sabe qué compus están libres y se las presta al driver.
3. **Workers:** cada uno recibe una parte de los datos, la procesa al mismo tiempo que los demás y le manda al driver **un resumen chico**, no los datos.
4. El driver junta los resúmenes. Repetir eso hasta que no cambie es **entrenar un modelo** (K-Means).
5. **Tolerancia a fallos:** si una compu se cae, otra hace su parte y no se pierde nada.

Dura unos 7 minutos. Cada alumno pasa por los roles: primero es el driver solo, después el cluster manager le dice que va a ser un worker y trabaja como tal. Quien pintó más en el primer paso queda como el driver del clúster y maneja desde su celular.

## 2. Principios (obligatorios)

- **Una sola acción por pantalla en el celular.** Pintar, enviar el resumen, pedir compus, juntar. Sumarse al clúster no es una acción: el cluster manager anota solo a cada compu libre.
- **Sin números para leer:** no se muestran coordenadas, sumas ni fórmulas. Todo se resuelve mirando el dibujo.
- **Pocas palabras técnicas, siempre las mismas:** driver, cluster manager y worker aparecen en el celular porque son el tema de la actividad. El resto (partición, task, executor, reduce, iteración) solo en el proyector y siempre después de la palabra común.
- **Nadie se queda afuera:** quien entra tarde queda anotado como worker solo y, si ya hay datos, recibe su parte en el momento; quien se equivoca puede reintentar; si alguien no termina, el proyector puede juntar igual.
- **El proyector nunca depende del celular del driver:** todo lo que hace el driver también se puede hacer desde el proyector.
- Textos en español rioplatense (vos), frases cortas. Sin emojis: se usan los íconos de `/icons.svg`.

## 3. Vocabulario

| En el celular y en voz alta | En el proyector, al lado |
|---|---|
| driver | driver (el programa principal) |
| cluster manager (el proyector) | Standalone, YARN, Kubernetes |
| worker / compu | worker, executor |
| tu parte (6 puntos) | partición |
| pintar tu parte | tarea (task) |
| resumen | resultado de la tarea |
| juntar | reduce |
| vuelta | iteración |
| se cayó una compu | tolerancia a fallos |

Los tres grupos tienen color **y** forma, siempre en este orden (índices 0, 1, 2):

| Índice | Nombre | Forma | Variable CSS |
|---|---|---|---|
| 0 | Violeta | círculo | `--c0` |
| 1 | Celeste | cuadrado | `--c1` |
| 2 | Rosa | triángulo | `--c2` |

Un punto sin pintar es gris (`--c-none`).

## 4. Los pasos

Identificadores de fase, en orden: `lobby`, `howto`, `solo`, `manager`, `work`, `combine`, `fail`, `end`. Solo se avanza de a un paso; `reset` es la única forma de volver.

Recorrido del proyector: **1 Unirse · 2 Cómo jugar · 3 Driver solo · 4 Cluster manager · 5 Workers · 6 Juntar · 7 Se cae una · 8 Cierre**. Los títulos numeran desde "Paso 1" a partir de Driver solo.

### 4.1 `lobby` · Unirse

**Proyector:** "Sumate con tu celular", QR grande y la dirección en texto. A la derecha, las compus conectadas. Botón: "Siguiente: cómo se juega" (necesita un celular).

**Celular:** nombre y "Entrar". Después, "Sos la compu 07" y "Esperá: ya arrancamos."

### 4.2 `howto` · Cómo se juega

Antes del reloj, todos aprenden la única acción del juego: pintar un punto del color del centro que le queda más cerca. El reloj no arranca hasta que quien presenta toca el botón del proyector.

**Proyector**
- "Cómo se juega" y "Cada punto se pinta del color del centro que le queda más cerca."
- Un ejemplo que se repite solo: el punto titila, salen líneas punteadas a los tres centros, la del más cercano queda firme con su color y el punto se pinta. Pasa por un punto de cada grupo y vuelve a empezar. Con movimiento reducido queda quieto en el ejemplo resuelto.
- Al lado, tres pasos que se iluminan junto con el ejemplo: "Mirá el punto que titila" · "¿Qué centro le queda más cerca?" · "Tocá ese color", con los tres botones del celular y el correcto marcado.
- "Si le errás, probá otra vez: no resta. Cuando arranque, vas a tener 20 segundos para pintar todos los puntos que puedas." (los segundos salen de `SOLO_MS`).
- Qué está pasando: "Pintar un punto es decidir a qué grupo pertenece: al del centro más cercano." · "En K-Means: asignar cada punto a su centro más cercano. Es el cálculo que se repite en cada vuelta."
- Botón: "Arrancar: cada uno es el driver" (titila: es lo próximo que hay que tocar).

**Celular**
- "Práctica: no cuenta", "Cómo se juega", "Tocá el color del centro que le queda más cerca al punto que titila." y tres puntos de práctica fijos (uno por centro) con los mismos botones del juego. Si acierta: "¡Bien! Ese es el centro más cerca."; si no, el mismo aviso que en el juego. La práctica no se manda al servidor.
- Al terminar: "¡Ya sabés jugar!", "Cuando arranque vas a ser el driver: vas a tener todos los puntos y 20 segundos. Pintá todos los que puedas." y "Esperá: el reloj arranca desde el proyector."
- Quien entra en este paso también practica.

### 4.3 `solo` · Paso 1 · Sos el driver

Todos los celulares reciben **el mismo trabajo completo**: `6 × celulares` puntos (mínimo 60, máximo 300), con una cuenta regresiva de `SOLO_MS` (20 s).

**Celular**
- "Sos el driver", reloj "0:14" (en rojo los últimos 5 s), "Punto 13 de 72" con una barra.
- Dibujo con todos los puntos chiquitos en gris, los pintados con su color y el actual grande con un anillo que titila.
- Tres botones (Violeta, Celeste, Rosa). Si acierta, pasa al siguiente; si no, "Casi. Fijate otra vez: hay un centro más cerca." Sin penalidad.
- Al terminar el tiempo: "¡Tiempo!", "Pintaste 18 de 72 puntos. Te faltaron 54.", "A tu ritmo, para pintar los 72 solo tardarías unos 2 minutos." A quien pintó más: "¡Pintaste más que nadie! Vas a ser el driver del clúster." Al resto: "La que más pintó fue la compu de Ana."

**Proyector**
- Cuenta regresiva gigante y "Cada celular tiene 72 puntos para pintar solo."
- Tarjeta "Los que más pintaron" (top 5 en vivo, con barra contra el total).
- Al terminar: "Nadie terminó.", "La que más pintó: Ana, 23 de 72.", "A este ritmo, un driver solo tardaría unos 2 minutos." y el cartel "Ana va a ser el driver del clúster."
- Qué está pasando: "Una sola compu con todos los datos. ¿Llega a terminar?" · "En Spark: el driver es el programa principal. Sin clúster, hace todo en una sola máquina."
- Botón: "Siguiente: aparece el cluster manager" (se puede tocar antes de que termine el tiempo).

### 4.4 `manager` · Paso 2 · Aparece el cluster manager

Al entrar se elige el driver: quien más pintó en el paso anterior (empate: quien llegó primero). Con un solo celular conectado no hay driver de celular: el proyector hace de driver y ese celular puede ser worker.

**Proyector**
- Diagrama grande de tres cajas: **Driver** (nombre) → "Pide compus" → **Cluster manager** (el proyector) → "Anota las libres" → **Compus libres** (número grande y algunos nombres). El cluster manager anota solo a todas las compus conectadas que no son el driver: nadie toca nada.
- Abajo: "Cuando Ana pida compus desde su celular, el cluster manager le presta todas estas: van a ser los workers."
- En el costado aparecen dos tarjetas fijas para el resto de la actividad: Driver y Cluster manager. La grilla pasa a "Compus en el clúster: 10 de 21"; tocar una compu la hace driver (para cambiarlo si hace falta); el driver anterior pasa a ser worker solo.
- Botón: "Pedir compus al cluster manager" (necesita al menos un worker). Lo ideal es que lo toque el driver desde su celular.

**Celular (resto)**
- Sin tocar nada, vibra y muestra: "Apareció el cluster manager" · "Vas a ser un worker" · "Ana es el driver y solo no llega. El cluster manager vio que tu compu está libre y te anotó para ayudarlo.", un mini diagrama (Driver → Cluster manager → Vos: worker) y "Esperá: Ana le va a pedir compus al cluster manager."

**Celular (driver)**
- "Sos el driver", "Tenés todos los datos y solo no llegás. Pedile compus al cluster manager.", el número de compus libres anotadas como workers y el botón "Pedir compus al cluster manager".

### 4.5 `work` · Paso 3 · Los workers pintan su parte

Cada worker recibe **una parte de 6 puntos** (2 de cada grupo real). El driver no tiene parte: espera resúmenes.

**Celular (worker)**
- "Sos un worker: pintá tu parte", "Punto 2 de 6", dibujo de sus 6 puntos y los 3 centros, los tres botones.
- Al pintar los 6: "Pintaste tu parte", la cantidad por color, "Este es tu resumen: cuántos puntos hay de cada color. Es lo único que viaja a Ana, no tus puntos." y el botón "Enviar resumen a Ana".
- Después: "Resumen enviado. Ana lo junta con los resúmenes de las demás compus. Mirá el proyector."
- Quien entra tarde queda anotado como worker solo y recibe su parte en el momento.

**Celular (driver):** "Llegaron 12 de 18 resúmenes", una barra y la lista de resúmenes (nombre y cantidad por color; si alguien hizo la parte de otro, lo dice). Botón "Juntar resúmenes", habilitado cuando llegaron todos.

**Proyector**
- Dibujo con todos los puntos en gris; cada parte se pinta cuando llega su resumen.
- "Resúmenes que llegaron al driver: 12 de 18" con barra, y los últimos 5 resúmenes.
- Grilla: cada worker "pintando" o "envió el resumen"; el driver con su corona.
- Qué está pasando: "Todas las compus trabajan al mismo tiempo, cada una con su parte." · "En Spark: cada parte es una partición y pintarla es una tarea que corre en un executor."
- Botón: "Juntar resúmenes" (con un resumen ya se puede; titila cuando llegaron todos). Las partes que falten las termina el driver.

### 4.6 `combine` · Paso 4 · El driver junta los resúmenes

Se hace un paso de K-Means con todos los puntos: los centros se mueven al medio de su grupo.

**Proyector**
- Los centros se mueven con una línea punteada desde donde estaban.
- "Por la red viajaron 18 resúmenes, no 108 puntos."
- Dos barras a la misma escala: "Con el clúster · 9,4 s" (lo que tardó el worker más lento) contra "Un driver solo · unos 2 minutos" (tiempo por punto medido en el paso 1 × todos los puntos). Abajo: "El clúster terminó cuando terminó el último worker: Tomi."
- Totales por color.
- Botones "Otra vuelta" y "Repetir solo". Con las vueltas automáticas aparecen "Vuelta 3" y las barras de cuánto se movieron los centros; al converger, el cartel "Listo: los centros ya no se mueven…" y lluvia de formas.
- Qué está pasando: "Por la red no viajaron los puntos: viajaron resúmenes chiquitos." · "En Spark: juntar en el driver lo que devuelven las tareas es el reduce. Repetir hasta que no cambie es entrenar el modelo."
- Botón: "Siguiente: se cae una compu".

**Celular (driver):** "Juntaste los resúmenes", totales por color, la comparación de tiempos y el botón "Repetir solo hasta que no cambie" (pasa a "Pausar"). Al converger: "Terminamos. Los centros ya no se mueven: el modelo está entrenado."

**Celular (worker):** "Ana juntó los resúmenes. Movió cada centro al medio de su grupo." y la comparación de tiempos. En las vueltas automáticas: "Vuelta 3 · Calculando… Ahora tu compu pinta sola." y "Vuelta 3 · Resumen enviado".

### 4.7 `fail` · Paso 5 · ¿Y si se cae una compu?

Empieza **otra vuelta a mano**: todas las partes vuelven a estar sin pintar y cada worker repinta la suya con los centros actuales.

**Proyector**
- Botones: "Girar la ruleta" (tecla K), "Prender todas" y "Juntar resúmenes". Tocar un worker lo hace caer directo.
- Ruleta: las fichas de los candidatos se iluminan de a una, cada vez más lento, y frena en la víctima. Cartel "Girando la ruleta…".
- Al caer: "Se cayó la compu de Bruno. El cluster manager le pasó su parte a Beto." Los puntos de esa parte se marcan con un anillo y la ficha del heredero muestra "+6".
- "Resúmenes que llegaron al driver: 17 de 18 · 18 partes y 17 compus vivas."
- Al juntar: "Llegaron las 18 partes con 17 compus. No se perdió nada."
- Qué está pasando: "Si una compu se cae, el cluster manager se da cuenta y otra hace su parte." · "En Spark: el driver vuelve a lanzar la tarea perdida en otro executor. Eso es tolerancia a fallos."
- Botón: "Cierre".

**Celular**
- Candidatos, mientras gira: "¿Se cae tu compu?".
- Víctima: pantalla roja "¡Se cayó tu compu! Es de mentira. Tu parte ahora la hace Beto. Mirá el proyector: no se pierde nada."
- Heredero: aviso "Te llegó trabajo extra: se cayó la compu de Bruno y su parte ahora la hacés vos." Después de su parte aparece la heredada, con el cartel "Parte de Bruno: se cayó su compu".
- Resto: "¡Te salvaste! Se cayó la compu de Bruno. Su parte la hace Beto."
- Driver: el mismo dato en su lista de resúmenes y "Beto · hizo la parte de Bruno" cuando llega.
- Al juntar: "Llegaron todas las partes. Se cayó la compu de Bruno y no se perdió nada."

### 4.8 `end` · Cierre

**Proyector:** "Lo que hicimos es lo que hace un clúster" y la tabla:

| En el aula | En un clúster de verdad |
|---|---|
| Ana, que tenía todo el trabajo | Driver (el programa principal) |
| El proyector, que juntó las compus | Cluster manager |
| Sus celulares | Workers (executors) |
| Sus 6 puntos | Una partición de los datos |
| Pintar su parte | Una tarea (task) |
| Mandar el resumen | Lo único que viaja por la red |
| Juntar los resúmenes | Reduce, en el driver |
| Se cayó una compu y otra hizo su parte | Tolerancia a fallos |

Debajo: "18 partes · 108 puntos · 4 vueltas · 1 compu caída y ningún dato perdido" y `modelo = KMeans(k=3).fit(datos)`. Botón "Reiniciar actividad" (pide confirmación).

**Celular:** "Gracias por ser parte del clúster", "Fuiste la compu 07 · solo pintaste 18 puntos · calculaste 3 vueltas." y sus medallas (7.3).

## 5. Archivos

| Archivo | Contenido |
|---|---|
| `server.js` | HTTP, rutas, sockets y el estado de la actividad |
| `lib/kmeans.js` | Generación de puntos y K-Means. Lo usan el servidor, los bots, la prueba y los celulares (servido como `/kmeans.js`, define `window.KM`) |
| `scripts/bots.js` | Celulares falsos para ensayar (`npm run bots -- 25`) |
| `scripts/smoke.js` | Prueba de punta a punta (`npm test`) |
| `presentacion-web/public/worker.{html,js,css}` | Celular (ruta `/`) |
| `presentacion-web/public/driver.{html,js,css}` | Proyector (ruta `/driver`) |
| `presentacion-web/public/styles.css` | Tokens y controles compartidos. **No se modifica** (lo usan otras páginas) |

Restricciones: sin dependencias nuevas; Node ≥ 18, Express, socket.io, JS sin build. Se mantienen las rutas y las variables `PORT`, `DRIVER_KEY`, `PUBLIC_URL`. `/driver` se puede incrustar: `/presentacion` lo carga con `?embed=1&key=...`.

## 6. Reglas del servidor

### 6.1 Constantes

```
K = 3
MAX_PHONES = 150
SOLO_MS = 20000          // cuenta regresiva del driver solo (variable de entorno SOLO_MS)
SOLO_MIN_POINTS = 60, SOLO_MAX_POINTS = 300
DEAD_AFTER_MS = 6000     // un worker desconectado con trabajo pendiente se da por caído (DEAD_AFTER_MS)
SPIN_MS = 4500           // ruleta (SPIN_MS)
TASK_TIMEOUT_MS = 2000, ROUND_PAUSE_MS = 700, EMPTY_ROUND_MS = 600
CONVERGED_SHIFT = 0.5, MAX_ROUNDS = 15
```

### 6.2 Datos

- Plano de 0 a 100 (y hacia arriba), tres grupos reales ocultos (`TRUE_CENTERS`) y tres centros iniciales corridos a propósito (`START`).
- Una **parte** son 6 puntos de `createPhonePoints`: 2 por grupo real, margen ≥ 8 respecto de `START`, separados entre sí, del más fácil al más difícil.
- El trabajo del driver solo sale de `soloPoints(seed, total)`: partes de 6 encadenadas con la misma regla. El servidor manda solo la semilla y el total; cada celular genera los mismos puntos.
- Cada parte guarda `home` (quién la recibió) y `owner` (quién la tiene ahora).

### 6.3 Pasos

- `lobby → howto`: necesita un celular conectado. No crea datos ni arranca el reloj.
- `howto → solo`: necesita un celular conectado. Arranca la cuenta regresiva.
- `solo`: `solo:progress { done }` solo sube, nunca pasa el total y se acepta hasta 1,5 s después del final. El ranking ordena por cantidad y desempata por quién llegó antes.
- `solo → manager`: corta la cuenta si seguía y elige el driver (4.4).
- `manager`: al entrar, el servidor anota como worker a cada celular conectado que no es el driver (no hay evento para sumarse). Quien se conecta después, en `manager`, `work`, `combine` o `fail`, queda anotado al conectarse y, si ya hay datos, recibe su parte. El proyector puede cambiar el driver con `driver { id }`; el nuevo driver deja de ser worker y el anterior pasa a serlo.
- `manager → work`: necesita un worker conectado. Crea una parte por worker (vuelta a mano 1).
- `work → combine`: necesita al menos un resumen. Termina las partes que falten, hace un paso de K-Means y guarda los datos del join (`join`).
- `combine`: vueltas automáticas (6.4). Solo el driver o el proyector las arrancan.
- `combine → fail`: frena las vueltas automáticas y empieza otra vuelta a mano con todas las partes sin pintar.
- `fail`: `join` cierra la vuelta a mano igual que en `work`, sin cambiar de paso.
- `fail → end`: si quedó una vuelta a mano abierta, la junta (o la completa si no llegó nada).
- **Quien se suma tarde** (`work`, `combine` o `fail`) recibe una parte nueva: sin pintar si hay una vuelta a mano, pintada si no.

### 6.4 Vueltas automáticas (`combine`)

1. Se manda `task { round, centers }` a cada worker conectado, prendido y con partes.
2. La vuelta termina cuando respondieron todos o a los `TASK_TIMEOUT_MS`.
3. **El servidor es la autoridad:** etiqueta y promedia él mismo con los centros de antes de la vuelta. Las respuestas solo marcan el progreso.
4. Converge si el centro que más se movió se movió menos de `CONVERGED_SHIFT` o si se llegó a `MAX_ROUNDS`.

### 6.5 Caídas

- Una caída mueve **todas** las partes de la víctima a **un** heredero: el worker vivo con menos partes (empate: menor id). El driver nunca se cae ni hereda.
- Causas: `spin` (ruleta), `kill` (tocar la ficha) y `lost` (se desconectó con trabajo pendiente y no volvió en `DEAD_AFTER_MS`). `spin` y `kill` solo valen en `fail` con una vuelta a mano abierta y sin ruleta girando.
- La ruleta elige la víctima entre los workers vivos con partes, prefiriendo los que todavía no mandaron. Necesita al menos 2 candidatos. Mientras gira se ignoran `spin` y `kill`.
- Quien se cayó por `lost` y vuelve queda como worker libre, sin su parte (`me.lostTo` dice quién la hizo).
- `revive` prende a los que están conectados y devuelve cada parte a su `home` si su dueño original es un worker vivo.
- `reset` vuelve a `lobby`, borra datos, driver y medallas, y descarta a los desconectados.

### 6.6 Prueba

`npm test` verifica el generador de puntos, que K-Means converge (200 semillas con 3, 10 y 30 celulares, 8 vueltas o menos) y toda la clase de punta a punta: que no se salte el paso de cómo se juega, driver solo, elección y cambio de driver, registro, partes, resúmenes, desconexión real con reasignación, join, vueltas automáticas, ruleta, revive, llegada tardía, medallas, reset y un ensayo con un solo celular.

## 7. Contrato de sockets

El rol va en `auth`. Proyector: `{ role: 'projector', key }` (si la clave está mal: `auth:error` y desconexión). Celular: `{ role: 'worker', token, name }` (`token` identifica al celular entre reconexiones; aula llena: `join:error`).

### 7.1 Servidor → proyector: `state`

```js
{
  phase,
  publicUrl,
  soloMs,                                    // duración del driver solo (SOLO_MS)
  driver: null | { id, name, connected },
  phones: [{ id, name, status, registered, parts, inherited, solo }],
  // status: waiting | painting | done | joined | out | driver | sent | idle | working | off | offline
  points: [{ x, y, label, moved }],          // label -1 = sin pintar; moved = la tiene otra compu
  centers, trail, round, shifts,
  solo: null | { total, remainingMs, durationMs, over, leaders: [{ id, name, done }], painted, players, msPerPoint, estimateMs, top },
  manual: null | { round, done, total },     // vuelta a mano abierta: resúmenes recibidos / partes
  inbox: [{ part, from, by, counts: [n0, n1, n2] }],
  totals: [n0, n1, n2],
  progress: { done, total }, busy, running, converged,   // vueltas automáticas
  join: null | { round, parts, filled, workers, rescued, points, parallelMs, slowest, soloMs },
  lastFail: null | { n, cause, victim, victimId, heir, heirId, parts, pending },
  spin: null | { n, candidates, victim, ms },
  stats: { phones, connected, workers, registered, points, parts, summaries, fails },
}
```

`join` es el del primer join en `combine` y el último en los demás pasos.

### 7.2 Servidor → celular: `state`

```js
{
  phase,
  soloMs,
  me: { id, name, role: 'driver' | 'worker' | 'none', registered, off, offCause, lostTo, working, rounds, soloDone, top, medals },
  solo: null | { seed, total, remainingMs, durationMs, over, msPerPoint, top },   // solo en el paso solo
  dataKey: '3:2',                // cambia con cada vuelta a mano; clave para sessionStorage
  centers, round, converged, running, busy,
  manual: null | { round },
  parts: [{ id, from: null | 'Bruno', sent, points: [{ x, y, label }] }],   // la propia primero
  driver: null | { name },
  workers,
  join, spin: null | { n, ms }, lastFail: null | { n, cause, victim, heir, parts, me: 'victim' | 'heir' | 'safe' },
  stats: { workers, points, parts },
  // solo el driver:
  inbox, progress: { done, total }, totals,
}
```

Además: `task { round, centers }` en las vueltas automáticas.

### 7.3 Eventos

| Quién | Evento | Datos | Efecto |
|---|---|---|---|
| Proyector | `phase` | `{ phase }` | Avanza un paso (6.3) |
| Proyector | `driver` | `{ id }` | Cambia el driver (`manager`) |
| Proyector | `join` | — | Junta (`work`: pasa a `combine`; `fail`: en el lugar) |
| Proyector | `round` / `run` | — / `{ on }` | Vuelta automática / seguir solo (`combine`) |
| Proyector | `spin` / `kill` / `revive` | — / `{ id }` / — | Caídas (6.5) |
| Proyector | `reset` | — | Vuelve a `lobby` |
| Celular | `solo:progress` | `{ done }` | Cuántos pintó solo |
| Celular | `part:submit` | `{ part }` | Manda el resumen de esa parte (tiene que ser suya y no enviada) |
| Celular | `task:result` | `{ round, sums: [{ sx, sy, n } × 3] }` | Responde una vuelta automática |
| Driver | `driver:ask` | — | Pide compus (`manager → work`) |
| Driver | `driver:join` | — | Junta resúmenes |
| Driver | `driver:run` | `{ on }` | Repetir solo / pausar |

Medallas (en este orden; si no tiene ninguna, `cluster`): `driver` (Fuiste el driver), `top` (Pintaste más que nadie solo), `heir` (Hiciste el trabajo de otra compu), `fallen` (Se cayó tu compu y no se perdió nada), `survivor` (Sobreviviste a la ruleta), `worker` (Fuiste un worker del clúster).

Para ensayar, `/?nombre=Ana` entra directo y cada pestaña abierta así es una compu distinta.

## 8. Diseño visual

- Tokens de `styles.css` (`--bg`, `--fg`, `--accent`, `--warn`, `--c0`…). El driver se marca con `--warn` y el ícono `crown`; el cluster manager con `--accent` y `server`.
- Tipografías: Atkinson Hyperlegible Next y Mono.
- **Proyector:** se lee desde el fondo. Texto de 20 px como mínimo a 1920×1080, una idea por pantalla, funciona desde 1100×600 (incrustado). Tema oscuro y alto contraste con T.
- **Celular:** 360 px de ancho, botones de 56 px de alto como mínimo, la acción principal fija abajo. Sigue el tema del sistema.
- Las animaciones respetan `prefers-reduced-motion`.

### Teclas del proyector

| Tecla | Acción |
|---|---|
| → | Paso siguiente (cuando se puede) |
| J | Juntar resúmenes (Workers y Se cae una) |
| Espacio o R | Otra vuelta (Juntar) |
| S | Repetir solo / pausar (Juntar) |
| K | Girar la ruleta (Se cae una) |
| Q | Mostrar u ocultar el QR grande |
| T | Alto contraste |
| F | Pantalla completa |
| Esc | Cierra el QR o el diálogo |
