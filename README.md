# Clúster en el aula

Actividad en vivo para la presentación de **Procesamiento distribuido y ML sobre datos masivos (Apache Spark / MLlib)**.
La clase se convierte en un clúster de Spark y entrena un K-Means entre todos:

- **Proyector = Driver** (`/driver`): reparte el trabajo, reduce, muestra el modelo.
- **Celular de cada alumno = Executor** (`/`): recibe una partición del dataset, la procesa y manda resultados.

## Correrlo

```bash
npm install
DRIVER_KEY=una-clave npm start
```

El servidor imprime dos URLs:

- **Alumnos**: la que va en el QR.
- **Proyector**: `http://localhost:3000/driver?key=una-clave`. Abrila en tu compu. La clave se borra de la barra de direcciones al entrar, así no queda a la vista en el proyector.

Sin `DRIVER_KEY`, se genera una clave al azar en cada arranque.

### Con Cloudflare Tunnel

```bash
# 1. el túnel apuntando al servidor local
cloudflared tunnel --url http://localhost:3000            # túnel rápido, URL random
# o con tu dominio (túnel con nombre ya configurado):
cloudflared tunnel route dns <tunel> cluster.tudominio.com
cloudflared tunnel run --url http://localhost:3000 <tunel>

# 2. arrancá el servidor diciéndole su URL pública, para que el QR apunte ahí
PUBLIC_URL=https://cluster.tudominio.com DRIVER_KEY=una-clave npm start
```

Socket.io usa WebSockets, que Cloudflare Tunnel soporta sin configuración extra. Con HTTPS, además, los celulares pueden mantener la pantalla prendida sola (Wake Lock).

### Ensayar sin gente

```bash
npm run bots -- 25        # 25 executors falsos contra localhost:3000
URL=https://cluster.tudominio.com npm run bots -- 10
```

Los bots asignan sus puntos (con algún error, como una clase real), eligen qué mandar y procesan tareas respetando las demoras.

## Guion (~15 min)

| Fase | Qué hacen los alumnos | Concepto |
|---|---|---|
| **Unirse** | Escanean el QR y ponen su nombre | Executors que se registran en el driver |
| **Map a mano** | Asignan sus 8 puntos al centroide más cercano y eligen qué mandar: A) todos los puntos, B) promedios, C) sumas + cantidad | Partición, tarea, map, combiner |
| **Reduce** | Miran el proyector: los promedios (B) corren un centroide; los puntos (A) pesan 19 MB a escala real | Shuffle, agregación parcial, promedio de promedios |
| **Modo Spark** | Sus celulares calculan solos. Volvés a uno *straggler* y mirás la ejecución especulativa | Iteraciones, stragglers, `spark.speculation` |
| **Fallos** | Tirás nodos abajo (o alguien cierra la pestaña de verdad) y sus particiones se recalculan en otro | Lineage de los RDD, tolerancia a fallos |
| **Hadoop vs Spark** | Mismo job dos veces: leyendo de disco en cada iteración o con `cache()` | Por qué Spark sirve para ML iterativo |
| **Código** | Las 8 líneas de PySpark con los valores reales de la clase | `KMeans(k=3).fit(df)` |

Atajos en el proyector: `←` `→` cambian de fase, `Espacio` ejecuta o pausa, `T` activa el alto contraste (para un aula con luz), `Q` muestra el QR y `F` pone pantalla completa.

## Estructura

- `server.js`: servidor Express + Socket.io con todo el estado del clúster (fases, particiones, tareas, especulación, lineage).
- `lib/kmeans.js`: dataset sintético y las cuentas de K-Means.
- `public/driver.*`: consola del proyector.
- `public/worker.*`: vista del celular.
- `scripts/bots.js`: executors falsos para ensayar.

El dataset es **sintético** (clientes de un súper: gasto mensual y visitas por año, con tres segmentos escondidos).
