# Guion de la presentación

Guía para presentar **Procesamiento distribuido y ML sobre datos masivos — Apache Spark (MLlib)**. No es un texto para leer en voz alta. Para cada diapositiva dice qué idea tiene que quedar, cómo explicarla para alguien que no sabe nada del tema y qué conviene saber por si preguntan.

La presentación es la del artifact de Slides (43 diapositivas). Las notas del orador de cada diapositiva tienen una versión más literal; esta guía es para entender y preparar.

---

## Cómo usar esta guía

Cada diapositiva tiene hasta cuatro partes:

- **Idea:** lo único que tiene que recordar el público de esa diapositiva. Si te olvidás de todo lo demás, decí eso.
- **Cómo explicarlo:** el orden de lo que conviene decir, ejemplos y preguntas para hacerle al público.
- **Para entender vos:** contexto extra que no hace falta decir, pero te da seguridad si preguntan.
- **Pasaje:** la frase que conecta con la siguiente.

### Tiempos aproximados

| Parte | Diapositivas | Tiempo |
|---|---|---|
| 01 · El problema | 1–7 | 6 min |
| 02 · Procesamiento distribuido | 8–15 | 8 min |
| 03 · Apache Spark | 16–30 | 12 min |
| 04 · MLlib | 31–38 | 8 min |
| 05 · Cierre y actividad | 39–43 | 3 min + 15 min de actividad |

Total: unos 37 minutos de teoría y 15 de actividad. Si tenés que recortar, las diapositivas que se pueden pasar rápido son 26–27 (transformaciones, stages), 31 (stack) y 38 (pipeline).

### Consejos generales

- **Una idea por diapositiva.** El público no sabe nada del tema: si en una diapositiva decís tres cosas, se queda con ninguna.
- **Siempre el ejemplo antes que el nombre técnico.** Primero "cada mesa cuenta sus votos", después "eso se llama map".
- **Volvé siempre a las mismas imágenes.** El clúster de computadoras, la cocina y la elección aparecen varias veces a propósito; usalas para conectar.
- **Hacé preguntas.** Aunque nadie conteste, obliga a pensar. Hay sugerencias en cada parte.
- **Las animaciones van con clic.** Hablá de cada parte cuando aparece, no antes.
- **Los números son para dar escala, no para memorizar.** Decí "días contra minutos", no "500.000 segundos".

---

## 01 · El problema

El objetivo de esta parte es que el público sienta el problema antes de ver cualquier solución: los datos son demasiados para una computadora, y la salida (usar muchas) trae problemas nuevos.

### 1 · Portada

**Idea:** de qué se trata la charla.

**Cómo explicarlo:** presentate y decí el tema en una frase: "cómo se procesan datos que no entran en una computadora, y cómo se entrenan modelos de machine learning con esos datos". Mostrá el dibujo: un nodo azul que coordina y muchas máquinas con un pedazo de los datos cada una. Decí que toda la charla es desarmar ese dibujo.

**Pasaje:** "Vamos de lo general a lo particular".

### 2 · Agenda

**Idea:** el recorrido tiene un orden lógico: problema → primera solución histórica → Spark → machine learning → actividad.

**Cómo explicarlo:** no leas los cinco puntos. Decí el hilo: "primero vamos a ver por qué hace falta todo esto, después cómo se resolvió la primera vez, después cómo lo resuelve Spark, y al final lo van a hacer ustedes con el celular". Anunciar la actividad desde el principio mantiene la atención.

### 3 · Qué son los datos masivos

**Idea:** big data no es solo "muchos datos": es cuando el volumen, la velocidad o la variedad superan lo que maneja una sola máquina. Y lo que limita es leer y mover los datos, no calcular.

**Cómo explicarlo:**
- Las tres V, cada una con un ejemplo que conozcan:
  - **Volumen:** todas las compras de un supermercado en diez años.
  - **Velocidad:** los pagos con tarjeta que llegan cada segundo.
  - **Variedad:** fotos, reseñas y audios que no entran en una tabla.
- Aclarar que hoy nos enfocamos en el **volumen**.
- Remarcar la frase de abajo: el procesador es rápido; lo lento es traer los datos.

**Para entender vos:** las tres V las propuso Doug Laney en 2001, cuando trabajaba en META Group (que después compró Gartner). Hay versiones con cinco V (se suman veracidad y valor), pero las tres originales son las que se citan.

**Pregunta al público:** "¿Cuántos datos creen que genera un supermercado grande por día?"

### 4 · Leer 100 TB del disco

**Idea:** con una sola máquina tardaría días; repartido entre mil, minutos. Esa es toda la idea del procesamiento distribuido.

**Cómo explicarlo:**
- Hacé la cuenta en voz alta y despacio:
  - Un disco lee unos 200 MB por segundo.
  - 100 TB son 100 millones de MB, así que lleva 500.000 segundos: casi seis días. Y eso solo para leer, sin calcular nada.
  - Con mil discos leyendo a la vez, cada uno lee una milésima parte: ocho minutos.
- Frase para que quede: **no hacemos más rápida una máquina, ponemos muchas a trabajar a la vez.**

**Para entender vos:** 200 MB/s es un disco rígido generoso en lectura secuencial. Un SSD moderno lee entre 500 MB/s y 7 GB/s, lo que achica el problema pero no lo elimina: 100 TB con un SSD rápido siguen siendo unas 4 horas. La diapositiva aclara que es un supuesto.

### 5 · Escalar vertical u horizontal

**Idea:** hay dos salidas. Comprar una máquina más grande tiene techo; usar muchas máquinas comunes casi no tiene techo, pero trae problemas nuevos.

**Cómo explicarlo:**
- Analogía: para mudarte podés comprar un camión más grande (vertical) o usar muchos autos (horizontal).
- El camión más grande existe hasta cierto tamaño, y cada salto cuesta mucho más.
- Los autos son baratos y podés sumar los que quieras, pero hay que coordinarlos: quién lleva qué, qué pasa si uno se rompe.

**Pasaje:** "A eso de usar muchas computadoras juntas se le dice clúster".

### 6 · Un clúster

**Idea:** un clúster es un grupo de computadoras comunes conectadas por red que trabajan juntas en un mismo problema. Cada una es un nodo y tiene su propio pedazo de los datos.

**Cómo explicarlo:**
- Esperá a que aparezcan las computadoras y después la red.
- Definí dos palabras y nada más:
  - **Nodo:** cada computadora, con su procesador, su memoria y su disco.
  - **Red:** el cable que las une.
- Remarcá lo importante: **mandar datos por la red es mucho más lento que leerlos de la propia memoria.** Esta idea vuelve en toda la charla.
- Señalá los colores en las pantallas: cada computadora tiene un pedazo distinto de los datos.

**Para entender vos:** en un datacenter real, los nodos son servidores sin pantalla montados en racks, unidos por switches. El dibujo con monitores es solo para que se entienda que cada nodo es una computadora completa.

### 7 · Lo difícil de repartir el trabajo

**Idea:** usar mil máquinas como si fueran una trae cuatro problemas: partir los datos, la red lenta, las máquinas que fallan y las máquinas lentas.

**Cómo explicarlo:**
- Presentá los cuatro como preguntas que se haría cualquiera:
  - "¿Cómo divido los datos y quién procesa cada pedazo?"
  - "¿Cómo evito mover datos por la red?"
  - "¿Qué hago si se rompe una?"
  - "¿Qué hago si una anda lenta y todas la esperan?"
- Dato que impacta: en el primer año de un clúster nuevo de Google había del orden de mil fallas de máquinas. Con miles de máquinas, que algo se rompa es lo normal.
- Pedí que se los guarden: al final de la teoría hay una diapositiva que resuelve cada uno.

**Para entender vos:** el dato de las fallas es de una charla de Jeff Dean (Google) de 2009. El problema de las máquinas lentas tiene nombre propio, *stragglers*, y aparece en la diapositiva 28.

---

## 02 · Procesamiento distribuido

El objetivo es mostrar cómo se resolvió por primera vez (MapReduce y Hadoop), entender qué es machine learning, y llegar al límite que justifica Spark: el disco.

### 8 · MapReduce y Hadoop

**Idea:** Google inventó MapReduce en 2004 y Hadoop es la versión libre (2006). Hadoop tiene tres piezas: HDFS guarda, MapReduce procesa y YARN administra.

**Cómo explicarlo:**
- Contalo como historia. Google tenía el problema antes que nadie: indexar toda la web. Publicó cómo lo resolvía, pero no su código. Otros lo reimplementaron como software libre y así nació Hadoop.
- Las tres piezas con un verbo cada una, que es lo que está en las tarjetas: **guarda, procesa, administra.**
- Mencioná que YARN va a volver cuando hablemos de Spark.

**Para entender vos:**
- **El paper:** "MapReduce: Simplified Data Processing on Large Clusters", de Jeffrey Dean y Sanjay Ghemawat (OSDI 2004).
- **HDFS:** está basado en otro paper de Google, el de GFS (2003).
- **Origen de Hadoop:** lo empezaron Doug Cutting y Mike Cafarella y lo impulsó Yahoo. El nombre viene de un elefante de peluche del hijo de Cutting.
- **YARN:** llegó con Hadoop 2 (versión estable en 2013). Antes, MapReduce también administraba las máquinas.

### 9 · HDFS: archivos repartidos

**Idea:** HDFS parte cada archivo en bloques y guarda cada bloque en tres máquinas distintas. Si una se rompe, no se pierde nada.

**Cómo explicarlo:**
- Analogía: "Es como las carpetas de tu computadora, pero el archivo está repartido entre muchas máquinas".
- Primero el archivo se parte en B1, B2 y B3; con el clic aparecen las copias.
- Señalá que B1 está en las máquinas 1, 2 y 4.
- Las tres copias sirven para dos cosas:
  1. No perder datos si se rompe una máquina.
  2. Poder mandar el cálculo a una máquina que ya tiene el bloque.
- Avisá el costo, porque va a importar después: cada vez que se escribe algo, viaja tres veces por la red.

**Para entender vos:** los bloques son de 128 MB por defecto desde Hadoop 2 (antes eran de 64 MB) y la replicación por defecto es 3. Un archivo de 1 TB serían unos 8.000 bloques. HDFS tiene un nodo especial, el NameNode, que guarda en qué máquina está cada bloque.

**Pregunta al público:** "Si se rompen dos máquinas a la vez, ¿se pierde algo?" Depende de cuáles. En el dibujo, si se rompen la 1 y la 2, B1 sigue en la 4.

### 10 · Map, shuffle y reduce

**Idea:** un programa MapReduce tiene tres fases. En map cada máquina procesa lo suyo, en shuffle se juntan los datos con la misma clave y en reduce se combinan. El programador escribe map y reduce; el shuffle lo hace el sistema.

**Cómo explicarlo:**
- Usá la elección, una tarjeta por vez:
  - **Map:** cada mesa cuenta sus propios votos, sola, sin hablar con nadie. Pasa en paralelo en todas las mesas a la vez.
  - **Shuffle:** los conteos de cada candidato se mandan a un mismo lugar. Acá sí hay que mover cosas, y por eso es lo caro.
  - **Reduce:** en ese lugar se suman todos los votos de cada candidato.
- Al final, el par clave-valor: es un dato con etiqueta. (gato, 1) significa "encontré la palabra gato una vez". La clave es la etiqueta por la que después se agrupa.

**Para entender vos:** *shuffle* en inglés quiere decir mezclar, como mezclar cartas. Lo que hace realmente el sistema es ordenar los pares por clave y mandarlos por la red a la máquina responsable de cada clave. Es la parte más costosa de casi cualquier trabajo distribuido, también en Spark.

### 11 · Ejemplo: contar palabras

**Idea:** se aplican las tres fases a un caso concreto. Map y reduce trabajan en paralelo y solo el shuffle usa la red.

**Cómo explicarlo:**
- Andá columna por columna con cada clic:
  1. Cada fila es una máquina con un pedazo del texto.
  2. **Map:** anota (palabra, 1) por cada palabra.
  3. **Shuffle:** las flechas naranjas que se cruzan son lo que viaja por la red; todos los "gato" van a un lado.
  4. **Reduce:** suma los unos.
  5. Salida: gato 3, perro 2, pez 1.
- Recalcá lo único importante: **las flechas que se cruzan son el costo.**

**Pregunta al público:** "Si en vez de tres máquinas fueran mil, ¿qué fase tardaría más?" La respuesta es el shuffle, porque es la que mueve datos por la red.

### 12 · Qué es machine learning

**Idea:** en lugar de escribir reglas a mano, el programa las aprende de ejemplos. Hay aprendizaje supervisado (los ejemplos traen la respuesta) y no supervisado (busca grupos solo).

**Cómo explicarlo:**
- Arrancá con un programa común: "si el mail dice *ganaste un premio*, es spam". El problema es que nadie puede escribir todas las reglas.
- Seguí el flujo, una caja por clic:
  - **Ejemplos:** miles de mails ya marcados.
  - **Entrenar:** el algoritmo se va ajustando hasta acertar.
  - **Modelo:** lo aprendido, guardado como números.
  - **Predicción:** llega un mail nuevo y dice si es spam.
- **Supervisado:** cada ejemplo trae la respuesta correcta, que se llama etiqueta.
- **No supervisado:** no hay etiquetas y el algoritmo encuentra grupos solo. Decí que la actividad usa este segundo tipo.

**Para entender vos:**
- **Qué guarda el modelo:** depende del algoritmo. En una regresión es una lista de pesos (cuánto importa cada palabra); en K-Means son las coordenadas de los centros.
- **Tipos de supervisado:** se divide en **clasificación** (predecir una categoría) y **regresión** (predecir un número).
- **Si preguntan por ChatGPT:** también es machine learning (aprendió de ejemplos de texto), pero de otra escala y otra familia (redes neuronales).

### 13 · El machine learning repite pasadas

**Idea:** entrenar no es leer los datos una vez: el algoritmo los recorre decenas o cientos de veces. Si cada pasada lee del disco, el costo se multiplica.

**Cómo explicarlo:**
- Analogía: estudiar para un examen. No leés el apunte una vez: lo leés, te tomás una prueba, ves en qué le erraste y volvés a leer. Cada vuelta mejora un poco.
- Mostrá el ciclo con "× N": recorrer los datos, ajustar el modelo y volver a empezar.
- Conectá con la diapositiva 4: si leer una vez ya era caro, imaginate leer cien veces.

**Para entender vos:** muchos algoritmos funcionan así. Por ejemplo, el descenso por gradiente (regresiones, redes neuronales) mide el error, corrige un poco los pesos en la dirección que lo reduce y repite. K-Means también itera, hasta que los centros dejan de moverse.

### 14 · El límite: cada paso pasa por el disco

**Idea:** en Hadoop, cada pasada es un job separado, y los jobs solo se pasan datos a través de HDFS, o sea, del disco. Con cien pasadas, se lee y escribe todo cien veces.

**Cómo explicarlo:**
- Primero definí **job**: un programa MapReduce completo, con su map, su shuffle y su reduce.
- Seguí la cadena: el job 1 lee de HDFS, calcula y escribe en HDFS; el job 2 vuelve a leer todo, y así.
- Recordá lo de las tres copias: cada escritura viaja tres veces por la red.
- Cerrá con la conclusión: para ML casi todo el tiempo se va en disco y red, no en calcular.

**Pasaje:** "¿Y si en vez de ir al disco dejáramos los datos en memoria?"

### 15 · Memoria contra disco

**Idea:** la memoria RAM es del orden de cien veces más rápida que el disco, pero es más chica y se borra al apagar. Spark aprovecha esa diferencia.

**Cómo explicarlo:**
- Todos lo conocen de su computadora: el disco guarda tus archivos aunque apagues; la RAM es donde está lo que estás usando ahora.
- Que se vean las barras: la del disco es casi invisible al lado de la de memoria.
- Definí **caché**: guardar algo en memoria para volver a usarlo sin ir a buscarlo de nuevo.

**Para entender vos:**
- **Los números son aproximados:** un disco rígido lee unos 200 MB/s; la RAM de un servidor, del orden de 20 GB/s o más. Con SSD rápidos la diferencia baja a "varias veces", pero la memoria sigue siendo mucho más rápida, sobre todo en accesos chicos y repetidos.
- **Si preguntan "¿y si los datos no entran en memoria?":** Spark guarda lo que entra y el resto lo deja en disco o lo vuelve a calcular. Funciona igual, solo más lento.

---

## 03 · Apache Spark

El objetivo es que entiendan quién hace qué en un clúster de Spark, cómo se reparten los datos, cómo viaja el trabajo y cómo sobrevive a las fallas. Es la parte más larga: andá despacio en la arquitectura.

### 16 · Qué es Spark

**Idea:** Spark es un motor de procesamiento distribuido que mantiene los datos en memoria entre un paso y el siguiente.

**Cómo explicarlo:**
- Leé la frase despacio y desarmala: "motor de procesamiento distribuido" es lo mismo que hacía MapReduce; "mantiene los datos en memoria" es lo nuevo.
- Contexto en una línea: nació en Berkeley en 2009, hoy es el estándar y se usa desde Python, SQL y otros lenguajes.

**Para entender vos:**
- **Origen:** lo creó Matei Zaharia en el AMPLab de UC Berkeley. Se liberó en 2010, entró a la Fundación Apache en 2013 y en 2014 pasó a ser proyecto principal (*top-level*).
- **Lenguaje:** está escrito en Scala.
- **Databricks:** sus creadores fundaron esta empresa, que es la que más lo desarrolla.
- **Si preguntan si Spark reemplaza a Hadoop:** reemplaza a MapReduce, el motor. Muchas veces Spark corre usando HDFS para guardar y YARN para administrar las máquinas.

### 17 · Tres roles dentro del clúster

**Idea:** en un clúster de Spark no todas las computadoras hacen lo mismo. El driver coordina, el cluster manager administra las máquinas y los workers trabajan.

**Cómo explicarlo:**
- Una columna por clic:
  - **Driver:** donde corre tu programa; arma el plan y reparte el trabajo.
  - **Cluster manager:** sabe qué máquinas están libres y se las presta a Spark. Nunca toca los datos.
  - **Workers:** procesan los datos y pueden ser cientos.
- Después la cocina: el jefe de cocina reparte los pedidos (driver), el encargado dice qué cocineros están libres (cluster manager) y los cocineros cocinan (workers). Esta analogía la podés retomar en las siguientes diapositivas.

**Para entender vos:** en el modo standalone de Spark, al cluster manager se lo llama **master**. Por eso a veces se habla de "master y workers". El driver es otra cosa: es tu programa. En la actividad, el proyector hace de driver y los celulares de executors.

### 18 a 24 · La arquitectura, paso a paso

Son siete diapositivas sobre el mismo dibujo. Las piezas se mueven de una a otra, así que **no apures los clics**: dejá que la animación termine antes de hablar. La idea general es que **se mueve el cálculo, no los datos.**

#### 18 · Todo empieza en el driver

**Idea:** el driver arma un plan y lo divide en tareas, que son pedacitos de trabajo que se pueden hacer en paralelo.

**Cómo explicarlo:** los cuadraditos de colores son las tareas. "Es el jefe de cocina con la lista de pedidos, pero todavía no tiene cocineros". Si preguntan cómo arma el plan, decí que lo vemos en la diapositiva 27.

**Para entender vos:** "proceso" es un programa en ejecución. El driver puede correr en tu computadora o dentro del clúster.

#### 19 · El driver pide recursos

**Idea:** el driver le pide máquinas y memoria al cluster manager.

**Cómo explicarlo:**
- Un ejemplo concreto: "necesito tres máquinas con cuatro núcleos y ocho gigas cada una".
- Nombrá los tres cluster managers posibles: standalone, que viene con Spark; YARN, el de Hadoop que vimos; y Kubernetes, muy usado hoy para administrar servidores en la nube.
- Remarcá la confusión más común: **el cluster manager no procesa ni un dato.**

#### 20 · En cada worker arranca un executor

**Idea:** en cada worker se lanza un executor, el proceso que hace el trabajo de verdad, con su propia CPU y memoria. Por ahora están vacíos.

**Cómo explicarlo:**
- Distinguí worker de executor: el **worker** es la máquina; el **executor** es el programa de Spark que corre en esa máquina.
- En la cocina, el worker es la hornalla y el executor el cocinero parado ahí.
- Señalá que dicen "sin datos todavía": falta lo más importante.

**Para entender vos:** una máquina puede tener más de un executor, y cada executor corre varias tareas a la vez (una por núcleo). Para la charla alcanza con uno por worker.

#### 21 · Los datos se parten en particiones

**Idea:** Spark ve un archivo enorme como una sola colección, el RDD, pero la guarda en pedazos llamados particiones. Se corre una tarea por partición.

**Cómo explicarlo:**
- Conectá con HDFS: "es la misma idea que los bloques, pero del lado del procesamiento". Muchas veces cada bloque de HDFS se convierte en una partición.
- Las tres propiedades, una por clic:
  - **Particionado:** se procesa en paralelo.
  - **Inmutable:** no se modifica; cada operación crea uno nuevo.
  - **Resiliente:** si se pierde una partición, se puede recalcular.
- Avisá que lo de resiliente lo vamos a ver en la diapositiva 29.

**Para entender vos:** RDD significa *Resilient Distributed Dataset*. Que sea inmutable es lo que permite recalcular: como nada se pisa, siempre se puede rehacer un pedazo desde el original.

#### 22 · Cada worker recibe sus particiones

**Idea:** las particiones quedan repartidas entre los executors, y cada uno trabaja con las que tiene más cerca. Eso es **localidad de datos**.

**Cómo explicarlo:**
- Mirá cómo las particiones vuelan a cada worker: P1 y P2 al primero, P3 y P4 al segundo, P5 y P6 al tercero.
- Esto responde al problema 2 de la diapositiva 7, la red lenta: en vez de traer los datos al programa, se lleva el programa a los datos.

**Para entender vos:**
- **Qué pasa realmente:** la animación simplifica. Cada executor lee del almacenamiento (por ejemplo HDFS) los bloques que tiene en su misma máquina, y si se le pide, los guarda en memoria.
- **DataFrame:** es lo que más se usa hoy. Es lo mismo que un RDD pero con columnas y un esquema, como una tabla, y eso permite optimizar las consultas.

#### 23 · El driver manda las tareas

**Idea:** cada tarea va al executor que ya tiene su partición. Lo que viaja por la red es la tarea, que es chiquita, no los datos.

**Cómo explicarlo:**
- T1 y T2 van al worker 1 porque ahí están P1 y P2.
- Señalá que el cluster manager quedó en gris: ya prestó las máquinas y no participa más. Desde acá el driver habla directo con los executors.

#### 24 · Vuelven resultados, no datos

**Idea:** cada executor procesa sus particiones ahí mismo y devuelve al driver un resultado chico. **Se mueve el cálculo, no los datos.**

**Cómo explicarlo:**
- Las flechas verdes son los resultados parciales: un conteo, una suma, unos pocos números.
- Hacé notar lo que no se movió: las particiones siguen en cada worker. Por la red viajaron las tareas a la ida y los resultados a la vuelta.
- Si la próxima iteración necesita los mismos datos, siguen ahí, en memoria. Eso conecta con la siguiente.

**Pregunta al público:** "¿Qué pesa más, una tarea o una partición de 128 MB?"

### 25 · Cinco iteraciones: Hadoop contra Spark

**Idea:** con los datos en memoria, las iteraciones siguientes son solo cálculo. Con cinco iteraciones, Spark tarda casi tres veces menos, y la diferencia crece con más iteraciones.

**Cómo explicarlo:**
- Leé los colores: naranja y gris son disco, azul es calcular. La barra de Hadoop es casi toda disco.
- Spark lee una vez y después solo calcula.
- **Decí que los tiempos son de ejemplo**, para ver la forma. El dato real es que el paper de Spark midió hasta 20 veces más rápido en algoritmos iterativos.

**Para entender vos:** el paper de los RDD es de Zaharia y otros, NSDI 2012. La ganancia depende del caso: en trabajos de una sola pasada la diferencia es chica, porque igual hay que leer todo una vez.

### 26 · Transformaciones y acciones

**Idea:** Spark no ejecuta cada operación cuando la escribís. Primero arma un plan (transformaciones) y recién ejecuta cuando le pedís un resultado (acción). A eso se le dice evaluación perezosa.

**Cómo explicarlo:**
- Analogía: una lista de compras. Anotás "leche, pan, huevos" pero no vas al súper por cada cosa; vas una vez cuando la lista está completa, y en el camino elegís el mejor recorrido.
- Leer, filtrar y agrupar son transformaciones; contar es la acción que dispara todo.
- Por qué conviene: viendo el plan completo, Spark puede optimizarlo, por ejemplo filtrar antes para leer menos.

**Para entender vos:** en código, `filter` y `map` son transformaciones; `count`, `collect` y `write` son acciones. Con DataFrames hay un optimizador (Catalyst) que reordena el plan automáticamente.

### 27 · Un job se divide en stages y tasks

**Idea:** cada acción dispara un job. Spark lo corta en stages donde hace falta un shuffle, y cada stage se divide en tasks, una por partición.

**Cómo explicarlo:**
- Conectá con MapReduce: el shuffle es el mismo de la diapositiva 10, el momento en que hay que mover datos entre máquinas.
- **Stage:** todo lo que se puede hacer sin mover datos, de corrido. **Task:** un stage aplicado a una partición, que es lo que el driver manda a cada executor.
- Si el público está cansado, quedate solo con esto: Spark agrupa todo lo que no necesita red y corta donde sí la necesita.

**Para entender vos:**
- **DAG:** es un diagrama de pasos con flechas que nunca vuelven atrás.
- **Dónde corta un stage:** en las *dependencias anchas*, cuando una partición nueva necesita datos de muchas particiones anteriores (agrupar, ordenar, unir tablas).
- **Dónde no corta:** en las *dependencias angostas*, como filtrar o transformar fila por fila, que quedan en el mismo stage.

### 28 · Dos problemas que siempre aparecen

**Idea:** con miles de máquinas siempre hay alguna que se cae y alguna que anda lenta. Esta diapositiva plantea el problema; las dos siguientes son las soluciones.

**Cómo explicarlo:**
- Volvé a los problemas 3 y 4 de la diapositiva 7.
- **Nodo caído:** se pierden las particiones que tenía en memoria.
- **Nodo lento**, o *straggler*: como un stage termina cuando termina su última tarea, una máquina lenta frena a todas. Analogía: un grupo de trabajo práctico entrega cuando termina el último integrante.

### 29 · Solución 1: lineage

**Idea:** Spark no guarda copias de cada resultado intermedio: guarda la receta de cómo se calculó cada partición. Si se pierde una, la rehace en otro nodo siguiendo esa receta.

**Cómo explicarlo:**
- Analogía de cocina: si se te cae una torta, no necesitás tener otra torta de repuesto si tenés la receta y los ingredientes.
- Seguí el dibujo: P2 salía del bloque 2 de HDFS, filtrado y transformado. Se cae el worker, Spark repite solo esa cadena en otro worker, y P1 y P3 no se tocan.
- Conectá con la inmutabilidad (diapositiva 21): como nada se pisa, la receta siempre funciona.

**Para entender vos:**
- **Checkpoint:** si la receta es muy larga (cientos de iteraciones), rehacer todo sería lento, así que se puede guardar un *checkpoint* en disco cada tanto y la receta empieza desde ahí.
- **Si se cae el driver:** el lineage no lo cubre. Si se cae el driver se pierde el trabajo y hay que relanzarlo.

### 30 · Solución 2: ejecución especulativa

**Idea:** si una tarea tarda mucho más que las demás, Spark lanza una copia en un nodo libre y se queda con la que termine primero.

**Cómo explicarlo:**
- Leé el gráfico como línea de tiempo: cada fila es un worker. T3 cayó en un nodo lento.
- Spark lanza una copia de T3 en el worker 1, que ya estaba libre; la copia termina antes y la original se cancela. El stage termina en la línea verde, no al final.
- Funciona porque una tarea con los mismos datos siempre da el mismo resultado, así que no importa cuál copia gane.

**Para entender vos:** viene **desactivada por defecto** (`spark.speculation`). Con los valores por defecto actuales, una tarea es candidata cuando ya terminó el 90 % del stage y ella tarda más de 3 veces la mediana. La idea ya estaba en el paper de MapReduce de 2004.

---

## 04 · Machine learning con MLlib

El objetivo es mostrar que todo lo anterior sirve para entrenar modelos, con un ejemplo concreto (K-Means) que prepara la actividad.

### 31 · Un motor y varias bibliotecas

**Idea:** todo lo que vimos es Spark Core. Encima hay bibliotecas que lo usan, y una es MLlib, la de machine learning.

**Cómo explicarlo:**
- Las capas de abajo hacia arriba:
  1. Cluster manager.
  2. Spark Core, que es lo que vimos.
  3. Las bibliotecas: SQL, Streaming, MLlib y GraphX.
- Lo importante es que comparten el núcleo, así que en un mismo programa se puede leer con SQL y entrenar con MLlib sin mover los datos.

**Para entender vos:** Structured Streaming procesa datos que llegan en tiempo real. GraphX trabaja con grafos, o sea datos de redes y conexiones, como quién sigue a quién.

### 32 · MLlib: algoritmos ya distribuidos

**Idea:** MLlib trae algoritmos que ya saben trabajar con datos repartidos. No hay que programar la distribución.

**Cómo explicarlo:**
- Recorré las familias conectando con la diapositiva 12:
  - **Clasificación y regresión** son supervisado (categoría o número).
  - **Clustering** es no supervisado.
  - **Recomendación:** el "otros también compraron".
  - **Features:** convertir los datos en números, que es lo único que entienden los algoritmos.
  - **Pipelines:** encadenar los pasos.
- El mismo código corre en una computadora o en cientos.

**Para entender vos:**
- **Las dos APIs:** la API principal de MLlib hoy es la basada en DataFrames (`spark.ml`). La vieja, basada en RDD (`spark.mllib`), está en mantenimiento desde Spark 2.0.
- **Algoritmos que podés nombrar si preguntan:**
  - Clasificación: regresión logística, árboles de decisión y random forest.
  - Recomendación: ALS.
  - Clustering: K-Means.

### 33 · K-Means: agrupar sin etiquetas

**Idea:** K-Means recibe puntos y un número K, y encuentra K grupos de puntos parecidos. Repite dos pasos: asignar cada punto al centro más cercano y mover cada centro al promedio de su grupo.

**Cómo explicarlo:**
- Ejemplo: un supermercado quiere dividir a sus clientes en 3 grupos según cuánto gastan y cada cuánto compran, para hacerle una promo distinta a cada grupo.
- Los cuatro pasos de la diapositiva, señalando los centros en el gráfico.
- Analogía de los kioscos: hay que poner 3 kioscos en un barrio.
  1. Los ponés en cualquier lado.
  2. Cada vecino va al más cercano.
  3. Cada kiosco se muda al centro de sus vecinos.
  4. Repetís hasta que nadie se mude.
- Decí que es el algoritmo de la actividad.

**Para entender vos:** MLlib no elige los centros iniciales totalmente al azar: usa por defecto *k-means||*, una versión paralela de k-means++ que elige centros iniciales separados entre sí. K-Means siempre encuentra K grupos aunque los datos no tengan grupos claros: elegir K es una decisión de quien lo usa.

### 34 · K-Means sobre un clúster

**Idea:** asignar puntos se puede hacer en cada executor sin red, porque cada punto solo necesita conocer los centros. Mover los centros necesita información de todas las particiones, así que lo termina el driver.

**Cómo explicarlo:**
- Dejá que se vea el movimiento de los centros (la línea punteada es su recorrido).
- Conectá con la arquitectura: el driver manda los 3 centros a todos, que es chiquito; cada executor asigna sus puntos, que es el map; y el driver junta todo para mover los centros, que es el reduce.
- Terminá con la pregunta de la diapositiva, que es la de la actividad: **¿qué tiene que mandar cada executor para que el promedio dé bien?** Dejá unos segundos de silencio.

### 35 · Qué manda cada nodo al driver

**Idea:** hay tres opciones. Mandar todos los puntos es correcto pero satura la red; mandar el promedio de cada grupo es liviano pero da mal; mandar la suma y la cantidad es liviano y correcto, y es lo que hace MLlib.

**Cómo explicarlo:**
- Antes de que aparezca la opción C, preguntá cuál elegirían. Muchos van a elegir B, y eso está bien: es justo el error que la actividad muestra en vivo.
- Los tamaños: 19 MB contra 48 o 72 bytes. El punto no es el número exacto sino que A crece con los datos y B y C no.

**Para entender vos:** el cálculo de A asume un millón de puntos en dos dimensiones guardados como números de 8 bytes, más algo de información extra. Lo que sacás en limpio: lo que viaja tiene que ser un resumen de tamaño fijo, no los datos.

### 36 · Por qué B da mal

**Idea:** el promedio de los promedios no es el promedio real, porque se olvida cuántos puntos había detrás de cada número.

**Cómo explicarlo:**
- El ejemplo más chico: un executor tiene un punto en 10 y otro tiene tres puntos en 0.
  - Promedio de promedios: 5.
  - Promedio real: 2,5.
- Analogía: promediar el porcentaje de votos de dos mesas sin importar que en una votaron 10 personas y en otra 1.000.
- Con suma y cantidad: (10 + 0) / (1 + 3) = 2,5. Exacto y chiquito.

**Para entender vos:** el promedio de promedios solo da bien si todos los grupos tienen la misma cantidad de puntos. Mandar suma y cantidad es la forma general de combinar promedios: se llama promedio ponderado.

### 37 · Cómo se entrena un modelo en paralelo

**Idea:** lo que hicimos con K-Means es el patrón que usa MLlib para casi todo: difundir el modelo, calcular en cada executor, combinar los resúmenes y actualizar. Repetir.

**Cómo explicarlo:**
- Recorré el ciclo con K-Means como ejemplo:
  1. **Difundir:** el driver manda los centros.
  2. **Calcular en local:** cada executor calcula sumas y cantidades.
  3. **Combinar:** se suman los resúmenes.
  4. **Actualizar:** el driver mueve los centros.
- Decí que con otros algoritmos cambia qué se calcula, pero el ciclo es el mismo.
- Lo que viaja: el modelo a la ida y resúmenes chicos a la vuelta. Los datos no se mueven y están en memoria.

**Para entender vos:** **broadcast** es mandar una copia de algo chico a todos los executors una sola vez. **treeAggregate** suma los resúmenes de a pares, en forma de árbol, para que el driver no reciba cientos de mensajes juntos.

### 38 · Un pipeline encadena los pasos

**Idea:** en la práctica no se programa ese ciclo a mano: se arma un pipeline con piezas que transforman datos (transformers) y piezas que aprenden (estimators).

**Cómo explicarlo:**
- Analogía: una línea de producción. Cada estación hace un paso:
  1. Limpiar los datos.
  2. Pasarlos a números.
  3. Entrenar.
- **Transformer:** recibe una tabla y devuelve otra con una columna nueva.
- **Estimator:** aprende de los datos con `fit` y devuelve un transformer, que es el modelo entrenado.
- La ventaja: el mismo pipeline se aplica igual a datos nuevos, sin riesgo de preparar los datos de una forma al entrenar y de otra al predecir.

---

## 05 · Cierre y actividad

### 39 · Cuándo conviene usar Spark

**Idea:** Spark no es siempre la respuesta. Conviene cuando los datos no entran en una máquina o cuando el algoritmo recorre los mismos datos muchas veces. Si entran en tu computadora, hay herramientas más simples y más rápidas.

**Cómo explicarlo:** repartir tiene un costo, el de coordinar y mover datos por la red. Regla práctica: si cabe en tu computadora, probá primero sin Spark. Esto muestra criterio y suele gustarle a quien evalúa.

**Para entender vos:** pandas y scikit-learn son bibliotecas de Python pensadas para una sola máquina. Spark tampoco es una base de datos para responder consultas en milisegundos: está hecho para procesar mucho de una vez, no para muchas consultas chiquitas.

### 40 · Cada problema, su solución

**Idea:** los cuatro problemas del principio más el del machine learning, cada uno con su solución en Spark.

**Cómo explicarlo:**
- Leé las filas con cada clic, conectando con lo visto:

  | Problema | Solución en Spark | Diapositivas |
  |---|---|---|
  | Partir los datos | Particiones | 21–22 |
  | Red lenta | Se mueve el cálculo | 23–24 |
  | Fallas | Lineage | 29 |
  | Nodos lentos | Ejecución especulativa | 30 |
  | ML iterativo | Memoria | 25 |

- Es el cierre de la teoría: si alguien se perdió en el medio, acá se reengancha.

**Pasaje:** "Y ahora, en vez de escucharlo, lo van a vivir".

### 41 · Siete fases, unos quince minutos

**Idea:** anticipar qué va a pasar en la actividad para que nadie se pierda.

**Cómo explicarlo:**
- Contá las fases rápido, sin detalle:
  1. Se unen.
  2. Hacen el map a mano.
  3. Reduce con la elección A, B o C.
  4. Modo Spark.
  5. Fallos.
  6. Carrera Hadoop contra Spark.
  7. MLlib real.
- Lo importante: **el proyector es el driver y cada celular es un executor con su partición de 8 puntos.**

### 42 · El clúster son ustedes

**Idea:** instrucciones para entrar.

**Cómo explicarlo:**
- Instrucciones:
  1. Escaneen el QR o entren a la dirección.
  2. Pongan su nombre.
  3. Esperen su partición.
- En este momento cambiá a la pestaña del driver, que muestra el QR grande.
- Esperá a que entre la mayoría antes de arrancar.

**Para entender vos:** antes de la clase completá `[cluster.tudominio.com]` en la diapositiva con la dirección real y probá entrar desde un celular con datos móviles, no solo con el wifi de tu casa.

### 43 · Preguntas

**Idea:** cierre y referencias.

**Cómo explicarlo:** agradecé, nombrá los tres papers principales (RDD, MapReduce, MLlib) y decí que el código y el informe están en el repositorio.

---

## Durante la actividad: qué remarcar en cada fase

En cada fase conectá lo que pasa en los celulares con una diapositiva:

| Fase | Qué está pasando | Qué decir | Diapositiva |
|---|---|---|---|
| Unirse | Cada celular recibe 8 puntos | "Cada uno es un executor y esos 8 puntos son su partición" | 20–22 |
| Map a mano | Cada uno asigna sus puntos al centro más cercano | "Esto es el map: cada uno solo con lo suyo, sin hablar con nadie" | 10, 34 |
| Reduce | El driver junta lo que mandaron | Mostrá cómo la opción B mueve mal los centros | 35–36 |
| Modo Spark | Los celulares iteran solos | "Así funciona de verdad: los datos quedan en memoria y cada vuelta es solo cálculo"; si alguno anda lento, señalá la copia especulativa | 25, 30 |
| Fallos | Se apagan nodos | "Se perdió su partición, y Spark la rehace en otro con la receta" | 29 |
| Hadoop vs Spark | Carrera disco contra memoria | Volvé a las barras de tiempo | 25 |
| MLlib real | El mismo cálculo con MLlib | "Todo lo que hicimos a mano, MLlib lo hace en una línea" | 32, 37 |

---

## Preguntas que pueden hacer

**¿Spark reemplazó a Hadoop?**
Reemplazó a MapReduce, el motor de procesamiento. HDFS y YARN se siguen usando mucho, y Spark corre encima de ellos. También es común usar Spark con almacenamiento en la nube en lugar de HDFS.

**¿Qué pasa si los datos no entran en la memoria del clúster?**
Spark guarda lo que entra y el resto lo deja en disco o lo vuelve a calcular cuando hace falta. Sigue funcionando, solo que más lento. No es todo o nada.

**¿Qué pasa si se cae el driver?**
Se pierde ese trabajo y hay que relanzarlo. El lineage protege a las particiones de los executors, no al driver. En producción se configura para que el driver se reinicie automáticamente.

**¿Por qué no hacer todo con una base de datos SQL?**
Una base de datos tradicional corre en una sola máquina o en pocas, y está pensada para muchas consultas chicas y rápidas. Spark está pensado para procesar volúmenes enormes de una vez. De hecho, Spark tiene Spark SQL, así que se puede usar SQL encima de Spark.

**¿Cuánto más rápido es Spark que Hadoop?**
Depende. En algoritmos iterativos, el paper original midió hasta 20 veces. En trabajos de una sola pasada la diferencia es chica, porque igual hay que leer todo el disco una vez.

**¿Qué diferencia hay entre worker y executor?**
El worker es la máquina; el executor es el programa de Spark que corre en esa máquina y hace el trabajo. Una máquina puede tener varios executors.

**¿Qué diferencia hay entre master y driver?**
El master es el cluster manager del modo standalone: presta máquinas. El driver es tu programa: arma el plan y reparte las tareas. Son roles distintos y pueden estar en máquinas distintas.

**¿Spark sirve para redes neuronales o inteligencia artificial tipo ChatGPT?**
MLlib trae algoritmos clásicos, no modelos de lenguaje. Para redes neuronales grandes se usan otras herramientas (PyTorch, TensorFlow) con placas de video. Spark se usa mucho para preparar los datos con los que se entrenan esos modelos.

**¿Cómo se elige K en K-Means?**
Es una decisión de quien lo usa. Una técnica común es probar varios K y ver cuándo agregar un grupo más deja de mejorar mucho el resultado (el "método del codo").

---

## Glosario rápido

Para repasar antes de presentar. El número indica dónde aparece por primera vez.

| Término | Qué es, en una línea | Diap. |
|---|---|---|
| Big data / datos masivos | Datos que por volumen, velocidad o variedad no maneja una sola máquina | 3 |
| Escalar vertical | Comprar una máquina más grande | 5 |
| Escalar horizontal | Usar muchas máquinas comunes | 5 |
| Clúster | Grupo de computadoras conectadas que trabajan juntas | 6 |
| Nodo | Cada computadora del clúster | 6 |
| Straggler | Nodo que no falla pero anda lento y frena a todos | 7, 28 |
| MapReduce | Modelo de Google: el programador escribe map y reduce, y el sistema hace el resto | 8 |
| Hadoop | Versión libre de MapReduce, con HDFS y YARN | 8 |
| HDFS | Sistema de archivos que reparte bloques en muchas máquinas, con 3 copias | 9 |
| YARN | Administrador de máquinas de Hadoop; Spark lo puede usar | 8, 19 |
| Map | Cada máquina procesa su pedazo y anota pares clave-valor | 10 |
| Shuffle | Juntar por la red los pares con la misma clave | 10 |
| Reduce | Combinar los valores de cada clave | 10 |
| Par clave-valor | Un dato con etiqueta, como (gato, 1) | 10 |
| Machine learning | Que el programa aprenda reglas a partir de ejemplos | 12 |
| Modelo | Lo que aprendió el algoritmo, guardado como números | 12 |
| Entrenar | Ajustar el modelo a los ejemplos | 12 |
| Etiqueta | La respuesta correcta de un ejemplo (spam o no spam) | 12 |
| Supervisado / no supervisado | Con etiquetas / sin etiquetas | 12 |
| Iteración | Una pasada completa por los datos | 13 |
| Job | En Hadoop, un map y un reduce completos; en Spark, lo que dispara una acción | 14, 27 |
| RAM / memoria | Almacenamiento rápido que se borra al apagar | 15 |
| Caché | Guardar algo en memoria para reusarlo | 15 |
| Driver | El proceso que corre tu programa, arma el plan y reparte tareas | 17 |
| Cluster manager | Presta máquinas a Spark (standalone, YARN, Kubernetes); en standalone se llama master | 17 |
| Worker | Máquina que trabaja | 17 |
| Executor | Proceso de Spark en un worker que procesa particiones | 20 |
| Tarea (task) | Un pedazo de trabajo sobre una partición | 18, 27 |
| RDD | La colección repartida de Spark: particionada, inmutable y resiliente | 21 |
| Partición | Cada pedazo de un RDD; se procesa una tarea por partición | 21 |
| DataFrame | Un RDD con columnas, como una tabla | 22 |
| Localidad de datos | Procesar cada partición donde ya está | 22 |
| Transformación | Paso que describe un cálculo pero no lo ejecuta | 26 |
| Acción | Pedido de un resultado que dispara la ejecución | 26 |
| Evaluación perezosa | Anotar el plan y ejecutar recién cuando hace falta | 26 |
| Stage | Pasos que se hacen sin mover datos entre máquinas | 27 |
| DAG | Diagrama de pasos con flechas que no vuelven atrás | 27 |
| Lineage | La receta de cómo se calculó cada partición | 29 |
| Checkpoint | Guardar en disco un punto intermedio para acortar la receta | 29 |
| Ejecución especulativa | Lanzar una copia de una tarea lenta y usar la que termine primero | 30 |
| MLlib | La biblioteca de machine learning de Spark | 31 |
| Feature | Una columna que describe cada dato, en forma de número | 32 |
| K-Means | Algoritmo que agrupa puntos en K grupos | 33 |
| Centro (centroide) | El punto que representa a un grupo en K-Means | 33 |
| Broadcast | Mandar una copia de algo chico a todos los executors | 37 |
| treeAggregate | Sumar resúmenes de a pares, en árbol | 37 |
| Pipeline | Cadena de pasos de preparación y entrenamiento | 38 |
| Transformer / Estimator | Pieza que transforma datos / pieza que aprende (`fit`) | 38 |

---

## Antes de presentar

- [ ] Completar en la portada `[Cátedra y año]`, `[Nombre y apellido]` y `[Fecha]`.
- [ ] Completar en la diapositiva 42 `[cluster.tudominio.com]` con la dirección real.
- [ ] Pasar la presentación entera una vez en modo Presentar, para ver las animaciones.
- [ ] Levantar el servidor y el túnel, y probar entrar desde un celular con datos móviles.
- [ ] Tener abierta la pestaña del driver para cambiar a ella en la diapositiva 42.
- [ ] Ensayar en voz alta la parte de arquitectura (18–24): es la más larga y la más importante.
