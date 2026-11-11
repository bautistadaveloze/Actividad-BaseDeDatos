# Actividad web · diseño y contrato

Este documento describe la actividad en vivo (celulares + proyector) y el contrato entre el servidor y las dos pantallas. Es la fuente de verdad: si el código y este documento no coinciden, hay que corregir uno de los dos.

## 1. Objetivo

Que alguien que no sabe nada del tema entienda, haciéndolo, cuatro ideas:

1. Los datos se reparten: cada computadora tiene solo su parte.
2. Cada computadora trabaja sobre su parte y manda **un resumen chico**, no los datos.
3. Un coordinador junta los resúmenes. Repetir eso muchas veces es **entrenar un modelo** (K-Means).
4. Si una computadora se apaga, otra hace su parte y no se pierde nada.

Dura entre 5 y 8 minutos.

## 2. Principios (obligatorios)

- **Una sola acción por pantalla en el celular.** Nada de elegir entre opciones técnicas.
- **Sin números para leer:** no se muestran coordenadas, bytes, sumas ni fórmulas. Todo se resuelve mirando el dibujo.
- **Sin jerga en el celular.** En el celular nunca aparecen las palabras executor, partición, driver, shuffle, lineage, map, reduce, centroide ni iteración.
- **La jerga solo en el proyector, y siempre después de la palabra común.** Ejemplo: "Coordinador (driver)". Así quien presenta la conecta con la teoría.
- **Nadie se queda afuera:** quien entra tarde recibe puntos igual; quien se equivoca puede reintentar; si alguien no termina, la actividad sigue.
- Textos en español rioplatense (vos), frases cortas. Sin emojis: se usan los íconos de `/icons.svg`.

## 3. Vocabulario

| En el celular y en voz alta | Etiqueta técnica (solo proyector) |
|---|---|
| compu | worker |
| coordinador (el proyector) | driver |
| tus puntos / tu parte | partición |
| centro | centroide |
| pintar | tarea (map) |
| resumen | resultado parcial |
| juntar | reduce |
| vuelta | iteración |

Los tres grupos tienen color **y** forma, siempre en este orden (índices 0, 1, 2):

| Índice | Nombre | Forma | Variable CSS |
|---|---|---|---|
| 0 | Violeta | círculo | `--c0` |
| 1 | Celeste | cuadrado | `--c1` |
| 2 | Rosa | triángulo | `--c2` |

Un punto sin pintar es gris (`--c-none`).

## 4. Las seis fases

Identificadores de fase, en orden: `lobby`, `paint`, `combine`, `auto`, `fail`, `end`.

Nombres en el recorrido del proyector: **1 Unirse · 2 Pintar · 3 Juntar · 4 Repetir · 5 Se apaga una · 6 Cierre**.

### 4.1 `lobby` · Unirse

**Proyector**
- Título: "Sumate con tu celular"
- Bajada: "Escaneá el QR. Tu celular va a ser una de las computadoras del clúster."
- QR grande (`/qr.svg`) y la dirección en texto.
- A la derecha, las compus conectadas (número y nombre) y el contador "Compus conectadas: N".
- Botón principal: "Empezar: repartir los puntos" (deshabilitado si no hay ningún celular).

**Celular**
- Antes de entrar: título "Sumate al clúster", texto "Tu celular va a ser una computadora del clúster.", campo "Tu nombre", botón "Entrar", nota "Dejá la pantalla prendida y esta pestaña abierta."
- Después de entrar: "Sos la compu 07" (número grande), el nombre, y "Esperá: ya te llega tu parte de los datos."

### 4.2 `paint` · Pintar (a mano)

Cada celular recibe **6 puntos**. Hay 3 centros de colores. La persona pinta cada punto del color del centro que le queda más cerca.

**Celular**
- Encabezado: "Punto 2 de 6".
- Consigna: "¿Qué centro le queda más cerca al punto que titila?"
- Dibujo: sus 6 puntos y los 3 centros (grandes, con color y forma). El punto actual tiene un anillo que titila. Sin ejes, sin números.
- Tres botones grandes, uno por centro: forma + nombre ("Violeta", "Celeste", "Rosa").
- Si acierta: el punto queda pintado y pasa al siguiente.
- Si se equivoca: el botón tiembla y aparece "Casi. Fijate otra vez: hay un centro más cerca." Puede reintentar las veces que quiera. Nunca se pinta mal un punto.
- Los puntos se presentan del más fácil al más difícil (ver 6.2).
- Al pintar los 6: título "Pintaste tus 6 puntos", un resumen visual con la cantidad por color (por ejemplo "Violeta 2 · Celeste 3 · Rosa 1"), el texto "Esto es lo único que le vas a mandar al coordinador: un resumen, no tus puntos." y el botón "Enviar al coordinador".
- Después de enviar: título "Enviado", texto "Mandaste solo un resumen chiquito. Mirá el proyector."
- El progreso de pintado se guarda en `sessionStorage` para que no se pierda si se recarga la página.

**Proyector**
- Título: "Paso 1 · Pintá tus puntos"
- Bajada: "Cada celular recibió 6 puntos. Pintá cada uno del color del centro que le queda más cerca."
- Dibujo grande con **todos** los puntos del aula en gris y los 3 centros. Cuando un celular envía, sus puntos se colorean con una animación corta.
- Progreso: "Listos: 14 de 22" con barra.
- Tarjeta "Qué está pasando": "Los datos se repartieron. Cada compu tiene solo su parte y trabaja sin esperar a nadie."
- Etiqueta técnica: "En un clúster: cada parte es una partición y pintar es la tarea (map)."
- Botón principal: "Juntar los resultados" (habilitado cuando al menos uno envió; resaltado cuando enviaron todos).

### 4.3 `combine` · Juntar

El coordinador junta los resúmenes y mueve cada centro al medio de su grupo. Los puntos de quienes no llegaron a enviar los completa el servidor.

**Proyector**
- Título: "Paso 2 · El coordinador junta todo"
- Bajada: "Con los resúmenes de todos, mueve cada centro al medio de su grupo."
- Los centros se mueven con animación (cerca de 1 s) y queda una línea punteada desde donde estaban.
- Dato destacado: "Por la red viajaron 22 resúmenes, no 132 puntos." (con los números reales).
- Tarjeta "Qué está pasando": "Cada compu mandó solo cuántos puntos pintó de cada color y dónde están. Con eso alcanza para mover los centros."
- Etiqueta técnica: "En un clúster: juntar es el reduce. Se mueve el cálculo, no los datos."
- Botón principal: "Repetir".

**Celular**
- Título "El coordinador juntó todo", texto "Movió los centros. Mirá el proyector." y su dibujo con los centros en la posición nueva.
- Si no llegó a enviar: "No llegaste a enviar: tu compu terminó sola tu parte."

### 4.4 `auto` · Repetir

Ahora cada celular pinta solo. Cada vuelta acomoda un poco más los centros, hasta que dejan de moverse.

**Proyector**
- Título: "Paso 3 · Repetir hasta que no cambie"
- Bajada: "Ahora cada celular pinta solo. En cada vuelta los centros se acomodan un poco más."
- Botones: "Otra vuelta" y "Seguir solo" (se convierte en "Pausar" mientras corre).
- Contador grande "Vuelta 3" y un gráfico de barras chico "Cuánto se movieron los centros", con una barra por vuelta (se achican).
- Al terminar: cartel "Listo: los centros ya no se mueven. El modelo está entrenado y encontró 3 grupos."
- Tarjeta "Qué está pasando": "Entrenar un modelo es esto: repetir muchas veces lo mismo sobre los mismos datos."
- Etiqueta técnica: "En Spark los datos quedan en memoria; por eso cada vuelta es rápida."
- Botón principal: "Siguiente: apagar una compu".

**Celular**
- Mientras trabaja: "Vuelta 3 · Pintando…" con una barra corta.
- Al terminar la vuelta: "Vuelta 3 · Resumen enviado" y su dibujo con los puntos recoloreados.
- Al converger: título "Terminamos", texto "Los centros ya no se mueven. El modelo está entrenado."

### 4.5 `fail` · Se apaga una compu

**Proyector**
- Título: "Paso 4 · ¿Y si se apaga una compu?"
- Bajada: "Tocá una compu para apagarla. Sus puntos pasan a otra y el trabajo sigue."
- Las compus de la derecha se pueden tocar para apagarlas. Botones: "Apagar una al azar", "Prender todas", "Otra vuelta".
- Después de apagar: tarjeta "Se apagó la compu de Ana. Sus 6 puntos ahora los pinta Bruno. No se perdió nada." En el dibujo, esos puntos se marcan con un anillo.
- Etiqueta técnica: "En un clúster real se rompen máquinas todos los días. El coordinador repite ese trabajo en otra: eso es tolerancia a fallos."
- Botón principal: "Cierre".

**Celular**
- El apagado: pantalla distinta, título "Tu compu se apagó", texto "Es de mentira. No se perdió nada: tus puntos ahora los pinta otra compu."
- El heredero: aviso "Heredaste 6 puntos de Ana. Ahora tenés 12." y su dibujo con todos.
- El resto sigue como en `auto`.

### 4.6 `end` · Cierre

**Proyector**
- Título: "Lo que hicimos es lo que hace un clúster"
- Tabla de dos columnas, "En el aula" y "En un clúster de verdad":

| En el aula | En un clúster de verdad |
|---|---|
| El proyector repartió y juntó | Coordinador (driver) |
| Sus celulares | Computadoras que trabajan (workers) |
| Sus 6 puntos | Una parte de los datos (partición) |
| Pintar los puntos | La tarea de cada compu (map) |
| Mandar el resumen | Lo único que viaja por la red |
| Juntar los resúmenes | Reduce |
| Repetir vueltas | Entrenar el modelo (K-Means) |
| Apagar una compu | Tolerancia a fallos |

- Números del aula: "22 compus · 132 puntos · 6 vueltas".
- Bloque de código: "Con Spark MLlib, todo esto se escribe así:" y `modelo = KMeans(k=3).fit(datos)`.
- Botón secundario: "Reiniciar actividad" (pide confirmación).

**Celular**
- Título "Gracias por ser parte del clúster", y "Fuiste la compu 07 · pintaste 6 puntos · hiciste 5 vueltas."

## 5. Archivos y responsables

| Archivo | Contenido |
|---|---|
| `server.js` | HTTP, rutas, sockets y el estado de la actividad |
| `lib/kmeans.js` | Generación de puntos y cálculo de K-Means |
| `scripts/bots.js` | Celulares falsos para ensayar (`npm run bots -- 25`) |
| `scripts/smoke.js` | Prueba automática de punta a punta (`npm test`) |
| `presentacion-web/public/worker.{html,js,css}` | Pantalla del celular (ruta `/`) |
| `presentacion-web/public/driver.{html,js,css}` | Pantalla del proyector (ruta `/driver`) |
| `presentacion-web/public/styles.css` | Tokens y controles compartidos. **No se modifica** (lo usan otras páginas) |

No se tocan: `presentacion.*`, `teoria.html`, `theory.*`, `fichas.html`, `cards.*`.

Restricciones técnicas:
- Sin dependencias nuevas. Node ≥ 18, Express, socket.io, JS sin build.
- Se mantienen las rutas (`/`, `/driver`, `/presentacion`, `/teoria`, `/fichas`, `/qr.svg`, `/icons.svg`, `/fonts/...`) y las variables `PORT`, `DRIVER_KEY`, `PUBLIC_URL`.
- `/driver` se sigue pudiendo incrustar: `/presentacion` lo carga en un iframe con `?embed=1&key=...`.

## 6. Reglas del servidor

### 6.1 Constantes

```
K = 3
POINTS_PER_PHONE = 6
MAX_PHONES = 150
TASK_TIMEOUT_MS = 2000     // espera máxima por la respuesta de un celular
ROUND_PAUSE_MS = 700       // pausa entre vueltas en "Seguir solo"
EMPTY_ROUND_MS = 600       // duración de una vuelta si no hay celulares conectados
CONVERGED_SHIFT = 0.5      // en un plano de 0 a 100
MAX_ROUNDS = 15
```

### 6.2 Datos

- Plano de 0 a 100 en x e y (y hacia arriba).
- Tres grupos reales ocultos y tres centros iniciales corridos a propósito, para que los centros tengan que moverse. Se parte de los valores actuales de `lib/kmeans.js` (`TRUE_CENTERS`, `START`) y se ajustan si hace falta para cumplir la prueba de 6.5.
- Cada celular recibe 6 puntos: **2 de cada grupo real**.
- **Margen:** al generar un punto se descarta y se vuelve a sortear si, respecto de los centros iniciales, la distancia al segundo centro más cercano menos la distancia al más cercano es menor que 8. Así, a mano, siempre está claro cuál es el centro más cercano.
- **Separación:** los puntos de un mismo celular quedan a 10 unidades o más entre sí y de los centros iniciales, para que en una pantalla chica no se encimen.
- Los 6 puntos de un celular se entregan ordenados de mayor a menor margen (el más fácil primero).
- Cada punto guarda `home` (el celular que lo recibió) y `owner` (quién lo tiene ahora).

### 6.3 Fases

- `lobby` → `paint`: se crean los datos para los celulares conectados (ordenados por id). Centros = iniciales. `round = 0`. Hace falta al menos un celular.
- Durante `paint`: `paint:submit` marca al celular como enviado y etiqueta sus puntos con el centro más cercano.
- `paint` → `combine`: se etiquetan los puntos que falten, se calculan los centros nuevos y `round = 1`.
- `combine`, `auto`, `fail`, `end` son vistas sobre los mismos datos: se puede ir y volver entre ellas. Si se salta a una de ellas con `round = 0`, primero se hace el `combine`.
- A `paint` solo se entra desde `lobby`. A `lobby` solo se vuelve con `reset`.
- Entrar a `end` detiene "Seguir solo".
- **Quien entra tarde** (fase distinta de `lobby` y de `end`) recibe 6 puntos nuevos en el momento. En `paint` llegan sin pintar; después llegan pintados con el centro más cercano actual.
- **Quien se desconecta** queda `offline` y nada más: sus puntos no se mueven. En las vueltas automáticas, su parte la calcula el servidor sin esperar.

### 6.4 Vueltas automáticas

1. Se manda `task` a cada celular conectado, prendido y con puntos.
2. La vuelta termina cuando respondieron todos o a los `TASK_TIMEOUT_MS`. Si no había a quién mandarle, termina a los `EMPTY_ROUND_MS`.
3. **El servidor es la autoridad:** calcula él mismo las etiquetas (centro más cercano con los centros de antes de la vuelta) y los centros nuevos (promedio de cada grupo; un grupo vacío conserva su centro). Las respuestas de los celulares marcan el progreso.
4. `shift` = la mayor distancia que se movió un centro. Converge si `shift < CONVERGED_SHIFT` o si `round >= MAX_ROUNDS`.
5. Con "Seguir solo" activo y sin converger, la próxima vuelta arranca a los `ROUND_PAUSE_MS`.
6. No se puede lanzar una vuelta mientras otra está en curso. En `auto` tampoco después de converger. En `fail` sí se puede: sirve para mostrar que el trabajo sigue sin la compu apagada.

### 6.5 Prueba de convergencia

`scripts/smoke.js` (se corre con `npm test`) verifica con 200 semillas y con 3, 10 y 30 celulares que K-Means converge en 8 vueltas o menos y que cada centro termina a menos de 8 unidades del promedio de los puntos de su grupo real. En la práctica converge en 2 a 4 vueltas.

### 6.6 Apagar y prender

- `kill` solo vale en la fase `fail`. La víctima tiene que estar prendida y tiene que quedar al menos otro celular prendido y conectado.
- Todos los puntos que tenía la víctima (propios y heredados) pasan a **un** heredero: el celular prendido y conectado con menos puntos (ante empate, el de menor id).
- Se guarda `lastFail = { victim, heir, points }` con nombres y cantidad, y se le manda `inherit` al heredero.
- Si había una vuelta en curso, no se espera la respuesta de la víctima.
- `revive` devuelve cada punto a su `home`, prende a todos y borra `lastFail`.
- `reset` vuelve a `lobby`: borra los datos, prende a todos y conserva los celulares conectados. Los que estaban desconectados se descartan; si vuelven, entran como nuevos.

## 7. Contrato de sockets

Conexión con `socket.io`. El rol va en `auth`.

### 7.1 Proyector

`io({ auth: { role: 'driver', key } })`. Si la clave es incorrecta el servidor emite `auth:error` (texto) y desconecta.

**Servidor → proyector: `state`**

```js
{
  phase: 'lobby' | 'paint' | 'combine' | 'auto' | 'fail' | 'end',
  publicUrl: 'http://192.168.0.10:3000',
  phones: [{
    id: 7, name: 'Ana',
    status: 'waiting' | 'painting' | 'sent' | 'idle' | 'working' | 'off' | 'offline',
    points: 6,        // cuántos puntos tiene ahora
    inherited: 0,     // cuántos de esos son heredados
  }],
  points: [{ x: 31, y: 64, owner: 7, home: 7, label: -1 | 0 | 1 | 2 }],  // -1 = sin pintar
  centers: [{ x, y }, { x, y }, { x, y }],
  trail: [[{ x, y }, { x, y }, { x, y }], ...],  // posiciones de los centros; trail[0] = inicio, la última = actual
  round: 0,           // vueltas completadas
  shifts: [18.2, 6.1, 1.4],   // cuánto se movieron los centros en cada vuelta
  progress: { done: 14, total: 22 },  // en paint: enviaron / tienen puntos; en una vuelta: respondieron / se les pidió
  busy: false,        // hay una vuelta en curso
  running: false,     // "Seguir solo" activo
  converged: false,
  lastFail: null | { victim: 'Ana', heir: 'Bruno', points: 6 },
  stats: { phones: 22, points: 132, summaries: 22 },  // summaries = resúmenes recibidos en total
}
```

Estados de un celular: `off` gana sobre todo; después `offline`; en `lobby` es `waiting`; en `paint` es `painting` o `sent`; en el resto es `working` (tiene una tarea pendiente) o `idle`.

**Proyector → servidor**

| Evento | Datos | Efecto |
|---|---|---|
| `phase` | `{ phase }` | Cambia de fase según 6.3 |
| `round` | — | Una vuelta (fases `auto` y `fail`) |
| `run` | `{ on: true \| false }` | Activa o pausa "Seguir solo" |
| `kill` | `{ id }` o `{}` | Apaga ese celular, o uno al azar |
| `revive` | — | Prende todos |
| `reset` | — | Vuelve a `lobby` |

### 7.2 Celular

`io({ auth: { role: 'worker', token, name } })`. `token` identifica al celular entre reconexiones (se guarda en `localStorage`). Si el aula está llena el servidor emite `join:error` (texto).

**Servidor → celular: `state`**

```js
{
  phase,
  me: {
    id: 7, name: 'Ana',
    off: false,
    sent: false,          // en paint: ya envió
    working: false,       // tiene una tarea pendiente
    rounds: 0,            // vueltas automáticas que respondió
    inheritedFrom: [],    // nombres de quienes heredó puntos
  },
  centers: [{ x, y }, { x, y }, { x, y }],
  points: [{ x, y, label }],   // los que tiene ahora: primero los propios, después los heredados
  own: 6,                      // cuántos de esos son propios
  paintKey: '3:7',             // cambia cuando cambian los datos; sirve de clave para sessionStorage
  round: 0,
  converged: false,
  totals: { phones: 22, points: 132 },
}
```

**Servidor → celular: otros**

| Evento | Datos | Cuándo |
|---|---|---|
| `task` | `{ round, centers }` | Vuelta automática: pintar con esos centros todos los puntos que tiene (propios y heredados) |
| `inherit` | `{ from: 'Ana', count: 6, total: 12 }` | Heredó puntos |
| `join:error` | texto | El aula está llena |

**Celular → servidor**

| Evento | Datos | Cuándo |
|---|---|---|
| `paint:submit` | — | Terminó de pintar a mano y tocó "Enviar al coordinador" |
| `task:result` | `{ round, sums: [{ sx, sy, n } × 3] }` | Terminó una tarea. Espera entre 400 y 900 ms antes de responder, para que se vea el trabajo |

El celular calcula de verdad: para cada punto busca el centro más cercano y acumula por grupo la suma de x, la suma de y y la cantidad.

Para ensayar, `/?nombre=Ana` entra directo con ese nombre, y cada pestaña abierta así cuenta como una compu distinta.

## 8. Diseño visual

- Se usan los tokens de `styles.css` (`--bg`, `--fg`, `--accent`, `--c0`…, `--radius`, `.btn`, `.shape-0`…). No se inventan colores nuevos fuera de esos tokens.
- Tipografías ya cargadas: Atkinson Hyperlegible Next y Mono.
- Íconos: `<svg class="icon"><use href="/icons.svg#nombre"/></svg>`. Nombres disponibles: `play`, `pause`, `rotate-ccw`, `contrast`, `qr-code`, `maximize`, `x`, `check`, `skull`, `zap`, `arrow-right`, `arrow-left`, `send`, `circle-alert`, `users`, `power`, `power-off`, `repeat`, `sparkles`, `monitor`, `smartphone`, `wifi-off`, `layers`, `timer`.
- **Proyector:** se lee desde el fondo del aula. Texto de 20 px como mínimo a 1920×1080, títulos grandes, una idea por pantalla. Tiene que funcionar desde 1100×600 (incrustado) hasta 1920×1080. Tema oscuro por defecto y alto contraste con la tecla T.
- **Celular:** pantalla angosta (360 px), botones de 56 px de alto como mínimo, la acción principal siempre visible sin hacer scroll. Sigue el tema del sistema.
- Las animaciones respetan `prefers-reduced-motion`.

### Teclas del proyector

| Tecla | Acción |
|---|---|
| → / ← | Fase siguiente / anterior (cuando se puede) |
| Espacio o R | Otra vuelta (fases `auto` y `fail`) |
| S | Seguir solo / pausar |
| K | Apagar una al azar (fase `fail`) |
| Q | Mostrar u ocultar el QR grande |
| T | Alto contraste |
| F | Pantalla completa. Incrustado, avisa a la página contenedora con `parent.postMessage({ type: 'deck-fullscreen' }, location.origin)` |
| Esc | Cierra el QR |
