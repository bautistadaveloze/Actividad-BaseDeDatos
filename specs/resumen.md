# Resumen: Spark, MLlib y K-Means distribuido

Guía de estudio para entender la teoría detrás de la actividad "Sos un nodo". Está pensada para leerse de arriba a abajo: cada sección se apoya en la anterior. El informe formal está en [`informe/informe.pdf`](informe/informe.pdf).

---

## 1. La idea en una frase

**Spark reparte datos gigantes entre muchas computadoras: cada una procesa su pedazo y manda solo un resumen; los datos quedan en memoria para repetir rápido, y si una máquina falla, Spark rehace solo lo que se perdió.**

Todo lo demás es el detalle de esa frase.

---

## 2. El problema: datos que no entran en una compu

Una empresa tiene mil millones de registros de clientes. No entran en la memoria de una computadora, y aunque entraran, procesarlos tardaría días.

Hay dos salidas:

| Estrategia | Qué es | Problema |
|---|---|---|
| **Escalar vertical** | Comprar una compu más grande | Cara y con techo: no existe una compu infinita |
| **Escalar horizontal** | Usar muchas compus comunes juntas (un **clúster**) | Hay que coordinarlas, mover datos por la red y aguantar que alguna falle |

El procesamiento distribuido es la segunda opción. Spark es una herramienta para hacerla sin volverse loco.

---

## 3. K-Means: el algoritmo que usamos de ejemplo

### Qué problema resuelve

Tenés muchos datos y querés **armar grupos de datos parecidos**, sin que nadie te diga de antemano cuáles son los grupos.

**Ejemplo:** un súper tiene miles de clientes. De cada uno sabe dos números: cuántas veces viene por mes y cuánto gasta. Si dibujás a cada cliente como un punto (x = visitas, y = gasto), se ven "nubes" de puntos:

```
gasto
  │                          ● ●
  │                         ● ● ●      ← vienen poco, gastan mucho
  │
  │   ● ●
  │  ● ● ●                             ← vienen poco, gastan poco
  │                ● ● ●
  │               ● ● ●                ← vienen seguido, gasto medio
  └──────────────────────────────── visitas
```

K-Means encuentra esas nubes solo. Después el súper le hace una promo distinta a cada grupo.

Como nadie le dice al algoritmo cuál es la respuesta correcta, es aprendizaje automático (*machine learning*) **no supervisado**.

### El nombre ya dice cómo funciona

- **K** = cuántos grupos querés. Lo elegís vos antes de empezar (en el juego, K = 3).
- **Means** = "promedios" en inglés.

O sea: **K-Means busca K promedios.** Cada grupo se representa con un punto, su **centroide** (o centro), que es el **promedio** de todos los puntos del grupo: el punto "del medio" de la nube.

### Los pasos

1. **Arrancar:** poné K centros en cualquier lado (por ejemplo, en K puntos elegidos al azar).
2. **Asignar:** cada punto se une al centro **más cercano**. Así quedan armados K grupos.
3. **Actualizar:** cada centro se mueve al **promedio** de los puntos de su grupo.
4. **Repetir:** como los centros se movieron, algunos puntos ahora tienen otro centro más cerca. Volvé al paso 2.
5. **Terminar:** cuando los centros ya no se mueven (o casi), listo.

Cada vuelta de los pasos 2 y 3 es una **iteración**.

**Analogía de los kioscos.** Hay que poner 3 kioscos en un barrio para que cada vecino tenga uno cerca. Los ponés en cualquier lado; cada vecino elige el más cercano; cada kiosco se muda al medio de sus clientes; algunos vecinos cambian de kiosco; los kioscos se vuelven a mudar... hasta que nadie cambia.

### Ejemplo con números, a mano

Para que sea fácil, usamos puntos en una sola línea (un solo número por punto) y **K = 2**. Los puntos son:

```
1   2   3                         10   11   12
●───●───●─────────────────────────●────●────●
```

A simple vista hay dos grupos: {1, 2, 3} y {10, 11, 12}. Veamos si K-Means los encuentra arrancando **mal**, con los dos centros pegados: **A = 1** y **B = 2**.

**Iteración 1**

- *Asignar:* el 1 está sobre A. Todos los demás (2, 3, 10, 11, 12) están más cerca de B.
  → Grupo A = {1}, Grupo B = {2, 3, 10, 11, 12}
- *Actualizar:*
  - A = 1 / 1 = **1**
  - B = (2 + 3 + 10 + 11 + 12) / 5 = 38 / 5 = **7,6**

B se fue para la derecha, al medio de un grupo que todavía está mal armado.

**Iteración 2** (A = 1, B = 7,6)

- *Asignar:*
  - el 2 está a 1 de A y a 5,6 de B → va con A
  - el 3 está a 2 de A y a 4,6 de B → va con A
  - el 10, el 11 y el 12 están más cerca de B
  → Grupo A = {1, 2, 3}, Grupo B = {10, 11, 12}
- *Actualizar:*
  - A = (1 + 2 + 3) / 3 = **2**
  - B = (10 + 11 + 12) / 3 = **11**

**Iteración 3** (A = 2, B = 11)

- *Asignar:* los grupos quedan iguales que antes.
- *Actualizar:* A sigue en 2 y B sigue en 11. **Los centros no se movieron: terminó.**

```
1   2   3                         10   11   12
●───◆───●─────────────────────────●────◆────●
    A                                  B
```

Aunque arrancó mal, en 3 vueltas encontró los dos grupos. Eso es todo K-Means: **asignar al más cercano, promediar, repetir.**

### Cómo se mide si quedó bien

Por cada punto se mide la distancia a su centro y se eleva al cuadrado. Se suma todo. Ese número es el **costo** (en MLlib se llama **WSSSE**). Más bajo es mejor: los puntos quedaron pegados a sus centros.

En el ejemplo final: (1−2)² + (2−2)² + (3−2)² + (10−11)² + (11−11)² + (12−11)² = 1 + 0 + 1 + 1 + 0 + 1 = **4**.

### Con datos reales

- **Más números por punto:** cada cliente puede tener 2, 10 o 100 números (columnas). La idea es la misma; la distancia se calcula como la línea recta entre los dos puntos, solo que en más dimensiones.
- **K lo elegís vos.** Una técnica común es probar varios K y ver cuándo agregar un grupo más deja de bajar mucho el costo (el "método del codo").
- **El arranque importa.** Un mal arranque puede terminar en grupos peores. Por eso MLlib no arranca al azar puro: usa **k-means||**, que elige centros iniciales separados entre sí.

### Por qué sirve para explicar Spark

Mirá los dos pasos de cada iteración:

| Paso | ¿Qué necesita? | ¿Se puede repartir? |
|---|---|---|
| **Asignar** | Cada punto solo necesita conocer los K centros | **Sí:** cada máquina asigna sus puntos sin hablar con nadie |
| **Actualizar** | El promedio de **todos** los puntos de cada grupo, que están repartidos en muchas máquinas | Hay que **juntar** información de todas |

El primer paso es un **map** y el segundo es un **reduce** (sección 5). Además se repite muchas veces sobre los mismos datos, que es justo lo que Spark hace bien (sección 6).

> **En el juego:** en la fase *Map a mano* hacés el paso de asignar con tus 8 puntos. Las figuras de colores (círculo, cuadrado, triángulo) son los centros.

---

## 4. Los roles de un clúster Spark

**Analogía de la elección:** cada mesa cuenta sus votos y manda el resultado al centro de cómputos. Las boletas nunca viajan.

| Rol | Qué hace | Elección | En el juego |
|---|---|---|---|
| **Driver** | Es *tu programa*. Arma el plan, divide el trabajo en tareas, las reparte y junta los resultados. | Centro de cómputos | El proyector |
| **Cluster manager** (o **master**) | Administra las máquinas: sabe cuáles hay libres y se las asigna al driver. **No procesa datos.** | La autoridad que asigna escuelas | No aparece |
| **Worker** | Una máquina física del clúster. | La escuela | Tu celular |
| **Executor** | Un proceso dentro del worker que ejecuta tareas y guarda datos en su memoria. | La mesa | Tu celular |
| **Partición** | Un pedazo del total de datos. Cada executor procesa las suyas. | Las boletas de esa mesa | Tus 8 puntos |
| **Task** (tarea) | El trabajo de procesar *una* partición. | Contar una mesa | "Procesar tu partición" |

**Cómo arranca todo:**

```
1. Driver → Cluster manager:  "necesito 30 executors"
2. Cluster manager → Workers: "lancen executors"
3. Executors → Driver:        "listo, estoy disponible"
4. Driver ⇄ Executors:        tareas y resultados   (el master ya no participa)
```

**Confusión típica:** *master* no es lo mismo que *driver*. El driver ejecuta tu programa; el master solo presta las máquinas. El master puede ser el de Spark ("standalone"), **YARN** (el de Hadoop) o **Kubernetes**.

---

## 5. MapReduce: map, shuffle y reduce

### Para qué existe

Querés procesar datos repartidos en muchas máquinas, pero **no querés programar** cómo se mandan datos por la red, quién hace qué, ni qué pasa si una máquina falla. MapReduce (Google, 2004) propone esto: **vos escribís solo dos funciones chiquitas, `map` y `reduce`, y el sistema hace el resto.**

Todo funciona con **pares clave-valor**: un dato con una etiqueta. Por ejemplo `(gato, 1)`: la clave es "gato" y el valor es 1. La clave sirve para saber **qué cosas van juntas**.

### Ejemplo: contar palabras

Hay un texto enorme repartido en 3 máquinas, y queremos saber cuántas veces aparece cada palabra.

```
Máquina 1: "el gato come"
Máquina 2: "el perro"
Máquina 3: "el gato duerme"
```

**Paso 1, map** (cada máquina sola, con lo suyo, todas al mismo tiempo): por cada palabra anota el par `(palabra, 1)`.

```
Máquina 1: (el,1) (gato,1) (come,1)
Máquina 2: (el,1) (perro,1)
Máquina 3: (el,1) (gato,1) (duerme,1)
```

Fijate el problema: la palabra "el" aparece en **las tres** máquinas. Ninguna sabe por sí sola cuántos "el" hay en total.

**Paso 2, shuffle** (mezclar y repartir): los pares viajan por la red para que **todos los que tienen la misma clave terminen en la misma máquina**. Hay una regla fija que dice a qué máquina va cada clave (por ejemplo: palabras de la a a la f a la máquina 1, de la g a la o a la 2, el resto a la 3).

```
Máquina 1 recibe:  come → [1]      duerme → [1]      el → [1, 1, 1]
Máquina 2 recibe:  gato → [1, 1]
Máquina 3 recibe:  perro → [1]
```

**Paso 3, reduce** (cada máquina sola otra vez): por cada clave, combina su lista de valores. Acá, sumarlos.

```
Máquina 1:  come 1    duerme 1    el 3
Máquina 2:  gato 2
Máquina 3:  perro 1
```

Listo: cada palabra con su total, y ninguna máquina tuvo que ver el texto entero.

### Resumen de los tres pasos

| Paso | Qué hace | ¿Usa la red? | Elección |
|---|---|---|---|
| **Map** | Cada máquina procesa **su** pedazo y anota pares clave-valor | No | Cada mesa cuenta sus votos |
| **Shuffle** | Junta en una misma máquina los pares con la **misma clave** | **Sí, mucho** | Los resultados de cada mesa viajan al centro de cómputos de su provincia |
| **Reduce** | Combina los valores de cada clave en un resultado | No | Cada centro suma los votos de su provincia |

**Por qué el shuffle es lo más caro:** es el único paso en el que los datos viajan por la red, y viajan "de todos contra todos": cada máquina le manda algo a cada otra. Mover datos por la red es mucho más lento que leerlos de la memoria propia. Por eso, en cualquier sistema distribuido, **la regla de oro es mandar lo menos posible.**

### El truco: resumir antes de mandar (combiner)

Si la máquina 1 tuviera el texto "el el el el", el map anotaría `(el,1)` cuatro veces y mandaría cuatro pares por la red. Es más inteligente **sumar antes de mandar** y mandar un solo par: `(el,4)`. Eso es un **combiner**: un "mini reduce" que hace cada máquina con lo suyo antes del shuffle. El resultado final es el mismo y viaja mucho menos.

Funciona porque **sumar se puede hacer por partes y en cualquier orden**: (1+1) + (1+1) da lo mismo que 1+1+1+1. Con promedios no pasa eso, y ahí está la trampa del juego.

### Lo mismo, aplicado a K-Means

Volvamos al ejemplo de la sección 3, en la iteración 2 (centros A = 1 y B = 7,6), pero ahora con los puntos repartidos en dos executors:

```
Executor 1: 1, 2, 10
Executor 2: 3, 11, 12
```

- **Map** (cada executor con sus puntos): asigna cada punto a su centro más cercano y, como combiner, **resume** por centro: suma de los puntos y cantidad.
  - Executor 1: A ← {1, 2} → `(A, suma 3, cantidad 2)`; B ← {10} → `(B, suma 10, cantidad 1)`
  - Executor 2: A ← {3} → `(A, suma 3, cantidad 1)`; B ← {11, 12} → `(B, suma 23, cantidad 2)`
- **Shuffle:** los resúmenes viajan agrupados por centro (la clave es A o B). Son poquísimos: K resúmenes por executor, no los puntos.
- **Reduce:** por cada centro, suma las sumas, suma las cantidades y divide **una sola vez**.
  - A = (3 + 3) / (2 + 1) = 6 / 3 = **2** ✅
  - B = (10 + 23) / (1 + 2) = 33 / 3 = **11** ✅

Da exactamente lo mismo que con todos los puntos juntos en una máquina (sección 3).

### La pregunta del juego: ¿qué manda cada executor?

| Opción | Qué manda | Tamaño | ¿Da bien? | Elección |
|---|---|---|---|---|
| **A** | Todos sus puntos | Enorme (19 MB por cada millón de puntos) | ✅ Sí, pero lentísimo | Mandar todas las boletas |
| **B** | El promedio de sus puntos por grupo | 48 bytes | ❌ **No** | Mandar porcentajes |
| **C** | La **suma** y la **cantidad** por grupo | 72 bytes | ✅ Sí, y es chico | Mandar cantidad de votos |

### Por qué B da mal (el "promedio de promedios")

Con el mismo ejemplo, si cada executor manda solo su promedio:

- Executor 1: A = (1 + 2) / 2 = 1,5 y B = 10
- Executor 2: A = 3 y B = (11 + 12) / 2 = 11,5
- El driver promedia los promedios: A = (1,5 + 3) / 2 = **2,25** ❌ (debía ser 2) y B = (10 + 11,5) / 2 = **10,75** ❌ (debía ser 11)

El error está en que el promedio de 1,5 venía de **dos** puntos y el 3 venía de **uno solo**, pero al promediarlos valen lo mismo. B **pierde cuántos puntos había detrás de cada promedio.**

En la elección: una mesa tiene 10 votantes y otra 1.000. No podés promediar los porcentajes de las dos mesas como si valieran igual.

### Por qué C da bien

Sumas y cantidades sí se pueden juntar por partes y en cualquier orden, igual que los conteos de palabras. El driver hace:

```
nuevo centro = (suma1 + suma2 + ...) / (cantidad1 + cantidad2 + ...)
```

A los pares (suma, cantidad) se los llama **estadísticos suficientes**: son lo mínimo que hace falta para calcular el promedio exacto. Es exactamente lo que hace MLlib por dentro en cada iteración.

> **En el juego:** en la fase *Reduce*, los que mandaron B corren un centroide y el proyector muestra el error con un centroide "fantasma".

---

## 6. Hadoop vs Spark: disco contra memoria

**Hadoop MapReduce** (2006) fue la primera herramienta masiva para esto. Funciona muy bien para trabajos de **una sola pasada**. Sus piezas:

- **HDFS:** sistema de archivos que reparte los datos en los discos de muchas máquinas, con copias.
- **MapReduce:** el motor que ejecuta map → shuffle → reduce.
- **YARN:** el cluster manager.

**El problema:** K-Means (y casi todo el machine learning) **repite muchas veces** sobre los mismos datos. Hadoop, en cada iteración:

```
leer del disco → calcular → escribir al disco → leer del disco → calcular → escribir...
```

**Spark** (2010–2012, Universidad de Berkeley) propuso: leé una vez y **dejá los datos en la memoria RAM**. Eso se pide con `cache()`.

```
leer del disco → calcular → calcular → calcular → calcular...
```

| | Hadoop MapReduce | Spark |
|---|---|---|
| Entre iteraciones los datos quedan en... | Disco | Memoria RAM (`cache()`) |
| Iterar 20 veces | 20 lecturas y 20 escrituras | 1 lectura |
| Recuperación ante fallos | Copias en disco | Lineage (ver sección 8) |
| Lenguajes | Java | Python, Scala, Java, R, SQL |

**Fórmula aproximada** (r = leer, c = calcular, w = escribir, m = iteraciones):

- Hadoop ≈ m × (r + c + w)
- Spark ≈ r + m × c

Cuantas más iteraciones, más gana Spark. El paper original reportó hasta **20 veces más rápido** en algoritmos iterativos.

> **En el juego:** en la carrera, Spark terminó ~2,4 veces antes. Ojo: **es una simulación** con tiempos de disco inventados para que se vea en clase, no una medición real.

---

## 7. RDD y DataFrame: cómo Spark representa los datos

- **RDD** (*Resilient Distributed Dataset*): una colección de datos **dividida en particiones** y repartida entre los executors. No se modifica: cada operación crea uno nuevo.
- **DataFrame:** lo mismo pero con forma de **tabla** (columnas con nombre y tipo), como en SQL. Es lo que se usa hoy en la práctica.

Hay dos tipos de operaciones:

| Tipo | Ejemplos | Qué pasa |
|---|---|---|
| **Transformación** | `map`, `filter`, `select` | **No se ejecuta todavía.** Spark solo anota la receta. |
| **Acción** | `count`, `collect`, `fit`, `save` | Recién ahí Spark ejecuta toda la receta. |

Que Spark espere a la acción se llama **evaluación perezosa** (*lazy*). Le sirve para ver el plan completo y optimizarlo. La receta completa forma un **DAG** (un grafo de pasos sin ciclos), que Spark divide en **stages** (etapas). Entre stage y stage suele haber un shuffle.

---

## 8. Cuando algo sale mal

En un clúster de mil máquinas, **siempre** alguna anda mal. Spark tiene dos mecanismos.

### Una máquina lenta → ejecución especulativa

- Un **straggler** (rezagado) es un executor lento: un disco viejo, el celu con poca batería...
- Como cada iteración termina cuando termina **la última** tarea, **un** lento frena a **todos**.
- **Solución:** Spark lanza una **copia** de esa tarea en otro executor libre y usa la que termine primero. Eso es la **ejecución especulativa**.
- Se activa con `spark.speculation = true` (viene **desactivada**). La idea la inventó Google en el paper de MapReduce, con el nombre "backup tasks".

> **En el juego:** en *Modo Spark*, tocás un executor y lo marcás como lento. La copia en otro celu le gana.

### Una máquina que se rompe → lineage

- Spark **no guarda copias** de los datos intermedios. Guarda la **receta** de cómo se calcularon. Eso es el **lineage** (linaje).
- Si se cae un executor, el driver le da esas particiones a otro, que **rehace solo lo perdido** siguiendo la receta.
- No hace falta empezar el trabajo de cero.

> **En el juego:** en *Fallos*, "matás" un nodo, su celu se pone rojo y otro hereda su partición.

---

## 9. MLlib: el código

**MLlib** es la biblioteca de machine learning de Spark: clasificación, regresión, clustering (K-Means), recomendaciones... El mismo código corre en tu notebook con un archivo chico o en un clúster con mil millones de filas.

```python
from pyspark.ml.clustering import KMeans                    # 1
from pyspark.ml.feature import VectorAssembler              # 2

df = spark.read.csv("clientes.csv", header=True,            # 3
                    inferSchema=True)
vec = VectorAssembler(inputCols=["x", "y"],                  # 4
                      outputCol="features")
datos = vec.transform(df).cache()                            # 5

modelo = KMeans(k=3, maxIter=12, seed=1).fit(datos)          # 6
print(modelo.clusterCenters())                               # 7
print(modelo.summary.trainingCost)                           # 8
```

| Línea | Qué hace | Qué viviste en el juego |
|---|---|---|
| 1–2 | Importa K-Means y una herramienta para armar vectores | — |
| 3 | Lee el archivo. Spark lo parte en **particiones** automáticamente. | Cada celu recibió 8 puntos |
| 4 | Junta las columnas x, y en un vector por fila (MLlib lo pide así) | Cada punto tiene (x, y) |
| 5 | `cache()`: dejá los datos en memoria | La carrera Hadoop vs Spark |
| 6 | `fit` es una **acción**: corre las iteraciones. Por dentro manda sumas y cantidades (opción C), reintenta fallos y puede usar especulación. | *Map a mano*, *Reduce*, *Modo Spark*, *Fallos* |
| 7 | Muestra los centroides finales | Las figuras en su lugar final |
| 8 | Muestra el costo (WSSSE) | El número de costo del proyector |

Detalles útiles:
- `k` = cantidad de grupos. `maxIter` = máximo de iteraciones (20 por defecto). `seed` = semilla para que el resultado se pueda repetir.
- MLlib elige los centroides iniciales con **k-means||**, una versión distribuida de k-means++ que los separa bien desde el principio, para no caer en un mal resultado.

---

## 10. Cuándo NO usar Spark

- Si los datos **entran en una compu**, pandas o scikit-learn son **más rápidos**. Repartir trabajo tiene un costo: coordinar, serializar y mandar por red.
- Spark conviene cuando los datos **no entran** en una máquina, o cuando el cálculo es tan pesado que una sola tarda demasiado.
- Regla práctica: si cabe en la RAM de tu notebook, probá primero sin Spark.

---

## 11. Mapa: fase del juego → concepto

| Fase | Qué pasa | Concepto |
|---|---|---|
| **Unirse** | Escaneás el QR y recibís 8 puntos | Driver, executor, partición |
| **Map a mano** | Asignás puntos y elegís A, B o C | Paso map, costo de la red |
| **Reduce** | B corre un centroide; A pesa demasiado | Combiner, promedio de promedios |
| **Modo Spark** | Tu celu calcula solo; uno se vuelve lento | Iteraciones, straggler, especulación |
| **Fallos** | Se "matan" celus en vivo | Lineage, recálculo |
| **Hadoop vs Spark** | Mismo trabajo, con y sin `cache()` | Disco vs memoria |
| **Código** | 8 líneas de PySpark | MLlib |

**Qué simplifica el juego:** no muestra al cluster manager; cada celu es worker y executor a la vez; los datos son de 2 dimensiones para poder dibujarlos; y los tiempos de la carrera son simulados.

---

## 12. Glosario

| Término | Definición corta |
|---|---|
| **Big data** | Datos demasiado grandes o rápidos para procesar en una sola máquina |
| **Clúster** | Grupo de computadoras que trabajan juntas |
| **Nodo** | Una computadora del clúster |
| **Driver** | Proceso que corre tu programa y coordina |
| **Cluster manager / master** | Asigna máquinas a las aplicaciones (standalone, YARN, Kubernetes) |
| **Worker** | Máquina que aloja executors |
| **Executor** | Proceso que ejecuta tareas y guarda datos en memoria |
| **Partición** | Pedazo del dataset que procesa un executor |
| **Task** | Procesar una partición |
| **Stage** | Grupo de tareas que se ejecutan sin shuffle en el medio |
| **Job** | Todo lo que dispara una acción |
| **Shuffle** | Mover por la red los pares para que los de la misma clave queden juntos (caro) |
| **Par clave-valor** | Un dato con etiqueta, como (gato, 1); la clave dice qué va junto |
| **Map / Reduce** | Procesar cada parte por separado / combinar los valores de cada clave |
| **Combiner** | Reducir parcialmente en cada nodo antes de mandar |
| **RDD** | Colección distribuida, inmutable y recuperable |
| **DataFrame** | Un RDD con forma de tabla |
| **Transformación** | Operación perezosa que define datos nuevos |
| **Acción** | Operación que obliga a ejecutar y devuelve un resultado |
| **Lazy evaluation** | Spark no ejecuta nada hasta que hay una acción |
| **DAG** | El plan de pasos que arma Spark |
| **`cache()` / `persist()`** | Guardar datos en memoria para reusarlos |
| **Lineage** | La receta para recalcular datos perdidos |
| **Straggler** | Tarea o nodo lento que retrasa a todos |
| **Ejecución especulativa** | Lanzar una copia de una tarea lenta |
| **HDFS** | Sistema de archivos distribuido de Hadoop |
| **YARN** | Cluster manager de Hadoop |
| **MLlib** | Biblioteca de machine learning de Spark |
| **K-Means** | Agrupa datos en K grupos: asignar al centro más cercano, promediar, repetir |
| **Centroide** | El centro de un grupo: el promedio de sus puntos |
| **Iteración** | Una vuelta de asignar + actualizar |
| **WSSSE / costo** | Suma de distancias² de cada punto a su centroide |

---

## 13. Preguntas que te pueden hacer

**¿Qué diferencia hay entre Spark y Hadoop?**
Hadoop guarda en disco entre cada paso; Spark deja los datos en memoria. Para algoritmos que repiten muchas veces, como el machine learning, Spark es mucho más rápido.

**¿Por qué no mandar promedios?**
Porque pierden cuántos puntos había detrás. Sumas y cantidades sí se pueden juntar sin error.

**¿Por qué no mandar todos los datos al driver?**
Daría bien, pero mover todo por la red es lentísimo y el driver no podría con tanto. La idea es llevar el cálculo a los datos, no los datos al cálculo.

**¿Qué pasa si se cae una máquina?**
Spark rehace solo las particiones perdidas en otra máquina, usando el lineage. No hay que reiniciar todo.

**¿Qué pasa si una máquina es lenta?**
Con la ejecución especulativa activada, Spark lanza una copia de su tarea en otra y se queda con la que termine primero.

**¿Qué es el driver y qué es el master?**
El driver es tu programa y coordina el trabajo. El master solo asigna máquinas y después no participa.

**¿Qué hace `cache()`?**
Deja los datos en memoria después de calcularlos la primera vez, para no releerlos del disco en cada iteración.

**¿Spark siempre conviene?**
No. Con datos chicos es más lento que una herramienta local como pandas, por el costo de coordinar.

**¿Qué pasa si los datos no entran en la RAM?**
Con `persist()` y el nivel `MEMORY_AND_DISK`, lo que no entra se guarda en el disco local. Anda más lento, pero anda.

**¿Hadoop está muerto?**
El motor MapReduce casi no se usa, pero HDFS y YARN siguen vigentes y Spark muchas veces corre encima de ellos.

---

## 14. Para explicarlo en un minuto

> "Cuando los datos son demasiado grandes para una compu, se reparten entre muchas. Spark coordina eso: un *driver* reparte el trabajo y cada *executor* procesa su pedazo. Para entrenar un modelo como K-Means hay que repetir muchas veces, y ahí está la gracia de Spark: en vez de leer del disco en cada vuelta, como Hadoop, deja los datos en memoria. Además, cada nodo manda solo un resumen chico, sumas y cantidades, no todos sus datos. Y si una máquina se cae, Spark no pierde nada: recuerda la receta y rehace solo esa parte. Hoy cada uno de ustedes fue un executor."

---

## 15. Para profundizar

**Videos** (los de inglés tienen subtítulos traducidos automáticamente al español):
- [Apache Spark in 100 Seconds](https://www.youtube.com/watch?v=IELMSD2kdmk). Panorama en 2 minutos.
- [StatQuest: K-means clustering](https://www.youtube.com/watch?v=4b5d3muPQmA). El algoritmo, muy visual.
- [Spark Architecture: Driver, Executors, DAGs, Stages & Tasks](https://www.youtube.com/watch?v=Po2HfhijNJM). Los roles del clúster.
- [Charla de Matei Zaharia, creador de Spark (NSDI 2012)](https://www.usenix.org/conference/nsdi12/technical-sessions/presentation/zaharia). Por qué existe Spark.

**Para jugar:**
- [Visualizing K-Means Clustering](https://www.naftaliharris.com/blog/visualizing-k-means-clustering/). K-Means paso a paso en el navegador.

**Para leer:**
- [Cluster Mode Overview](https://spark.apache.org/docs/latest/cluster-overview.html). Los roles, con el diagrama oficial.
- [RDD Programming Guide](https://spark.apache.org/docs/latest/rdd-programming-guide.html). Ver la sección "RDD Persistence".
- [K-Means en MLlib](https://spark.apache.org/docs/latest/ml-clustering.html)
- [Paper de los RDD (Zaharia et al., 2012)](https://www.usenix.org/system/files/conference/nsdi12/nsdi12-final138.pdf)
- [Learning Spark, 2.ª ed. (libro gratis de Databricks)](https://pages.databricks.com/rs/094-YMS-629/images/LearningSpark2.0.pdf)
