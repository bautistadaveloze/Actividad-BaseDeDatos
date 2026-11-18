# Guion de la presentación

Guía para presentar **Procesamiento distribuido y ML sobre datos masivos**, con Apache Spark (MLlib) como tecnología sugerida. No es un texto para leer en voz alta. Para cada diapositiva dice qué idea tiene que quedar, cómo explicarla para alguien que no sabe nada del tema y qué conviene saber por si preguntan.

La presentación es la del artifact de Slides (44 diapositivas). El orden va de lo general a lo particular: primero las ideas del procesamiento distribuido y del machine learning sobre datos masivos, que son el tema, y después Spark, que es la tecnología sugerida para aplicarlas. Las notas del orador de cada diapositiva tienen una versión más literal; esta guía es para entender y preparar.

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
| 01 · El problema | 1–8 | 7 min |
| 02 · Procesamiento distribuido | 9–15 | 8 min |
| 03 · ML sobre datos masivos (persona 1): qué es ML y K-Means | 16–19 | 4 min |
| 03 · ML sobre datos masivos (persona 2): entrenar con datos repartidos | 20–24 | 5 min |
| 04 · Apache Spark y MLlib | 25–40 | 12 min |
| 05 · Cierre y actividad | 41–44 | 2 min + unos 7 min de actividad |

Total: unos 38 minutos de teoría y 7 de actividad. Si tenés que recortar, pasá rápido la 37 (stack) y la 39 (pipeline). No saltees pasos del recorrido (26–36): es una línea de tiempo y cada paso se apoya en el anterior; si estás muy justo, en la 32 quedate solo con qué es el shuffle.

### Consejos generales

- **Lo general primero, Spark después.** El tema es el procesamiento distribuido y el ML sobre datos masivos; Spark es la tecnología sugerida. Cuando llegues a Spark, decí seguido "esto ya lo vimos" y nombrá la idea general.
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

**Cómo explicarlo:** presentate y decí el tema en una frase: "cómo se procesan datos que no entran en una computadora, y cómo se entrenan modelos de machine learning con esos datos". Mostrá el dibujo: un nodo azul que coordina y muchas máquinas con un pedazo de los datos cada una. Decí que toda la charla es desarmar ese dibujo. Aclará desde el principio que el tema es general y que **Apache Spark es la tecnología sugerida** para llevarlo a la práctica: va al final, cuando ya se entiendan las ideas.

**Pasaje:** "Vamos de lo general a lo particular".

### 2 · Agenda

**Idea:** el recorrido tiene un orden lógico: problema → procesamiento distribuido → machine learning sobre datos masivos → Spark, la tecnología sugerida → actividad.

**Cómo explicarlo:** no leas los cinco puntos. Decí el hilo: "primero vamos a ver por qué hace falta todo esto, después las ideas generales para procesar y entrenar modelos con datos repartidos, después cómo las aplica Spark, y al final lo van a hacer ustedes con el celular". Anunciar la actividad desde el principio mantiene la atención.

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

**Pasaje:** "Pero para que trabajen juntas, alguien tiene que organizarlas".

### 7 · Tres roles dentro del clúster

**Idea:** en un clúster no todas las computadoras hacen lo mismo. El driver coordina, el cluster manager administra las máquinas y los workers trabajan.

**Cómo explicarlo:**
- Una columna por clic:
  - **Driver:** donde corre tu programa; arma el plan y reparte el trabajo.
  - **Cluster manager:** sabe qué máquinas están libres y se las presta a cada programa. Nunca toca los datos.
  - **Workers:** procesan los datos y pueden ser cientos.
- Después la cocina: el jefe de cocina reparte los pedidos (driver), el encargado dice qué cocineros están libres (cluster manager) y los cocineros cocinan (workers). Esta analogía la podés retomar en las siguientes diapositivas.
- Aclará que los nombres son los de Spark, pero la idea está en cualquier clúster: cuando veamos Hadoop, YARN va a ser su cluster manager.

**Para entender vos:** en el modo standalone de Spark, al cluster manager se lo llama **master**. Por eso a veces se habla de "master y workers". El driver es otra cosa: es tu programa. En la actividad, el proyector hace de cluster manager, un alumno hace de driver desde su celular y el resto de los celulares son los workers.

**Pasaje:** "Con un jefe, un encargado y cocineros, repartir el trabajo parece fácil. Pero no lo es".

### 8 · Lo difícil de repartir el trabajo

**Idea:** usar mil máquinas como si fueran una trae cuatro problemas: partir los datos, la red lenta, las máquinas que fallan y las máquinas lentas.

**Cómo explicarlo:**
- Presentá los cuatro como preguntas que se haría cualquiera:
  - "¿Cómo divido los datos y quién procesa cada pedazo?"
  - "¿Cómo evito mover datos por la red?"
  - "¿Qué hago si se rompe una?"
  - "¿Qué hago si una anda lenta y todas la esperan?"
- Dato que impacta: en el primer año de un clúster nuevo de Google había del orden de mil fallas de máquinas. Con miles de máquinas, que algo se rompa es lo normal.
- Definí dos palabras: cada pedazo de los datos es una **partición**, y el trabajo de procesar una partición es una **tarea**.
- Pedí que se los guarden: primero los vamos a resolver en general, y al final de la teoría hay una diapositiva que los repasa.

**Para entender vos:** el dato de las fallas es de una charla de Jeff Dean (Google) de 2009. El problema de las máquinas lentas tiene nombre propio, *stragglers*, y aparece en la diapositiva 13.

---

## 02 · Procesamiento distribuido

El objetivo es mostrar las ideas generales del procesamiento distribuido con el primer sistema que funcionó a gran escala (MapReduce y Hadoop), y cómo se resuelven las máquinas que fallan y las que andan lentas. Nada de esta parte es exclusivo de Spark.

### 9 · MapReduce y Hadoop

**Idea:** Google inventó MapReduce en 2004 y Hadoop es la versión libre (2006). Hadoop tiene tres piezas: HDFS guarda, MapReduce procesa y YARN administra.

**Cómo explicarlo:**
- Contalo como historia. Google tenía el problema antes que nadie: indexar toda la web. Publicó cómo lo resolvía, pero no su código. Otros lo reimplementaron como software libre y así nació Hadoop.
- Las tres piezas con un verbo cada una, que es lo que está en las tarjetas: **guarda, procesa, administra.**
- YARN es el cluster manager de Hadoop: el encargado de la cocina de la diapositiva 7. Mencioná que va a volver cuando hablemos de Spark.

**Para entender vos:**
- **El paper:** "MapReduce: Simplified Data Processing on Large Clusters", de Jeffrey Dean y Sanjay Ghemawat (OSDI 2004).
- **HDFS:** está basado en otro paper de Google, el de GFS (2003).
- **Origen de Hadoop:** lo empezaron Doug Cutting y Mike Cafarella y lo impulsó Yahoo. El nombre viene de un elefante de peluche del hijo de Cutting.
- **YARN:** llegó con Hadoop 2 (versión estable en 2013). Antes, MapReduce también administraba las máquinas.

### 10 · HDFS: archivos repartidos

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

### 11 · Map, shuffle y reduce

**Idea:** un programa MapReduce tiene tres fases. En map cada máquina procesa lo suyo, en shuffle se juntan los datos con la misma clave y en reduce se combinan. El programador escribe map y reduce; el shuffle lo hace el sistema.

**Cómo explicarlo:**
- Usá la elección, una tarjeta por vez:
  - **Map:** cada mesa cuenta sus propios votos, sola, sin hablar con nadie. Pasa en paralelo en todas las mesas a la vez.
  - **Shuffle:** los conteos de cada candidato se mandan a un mismo lugar. Acá sí hay que mover cosas, y por eso es lo caro.
  - **Reduce:** en ese lugar se suman todos los votos de cada candidato.
- Al final, el par clave-valor: es un dato con etiqueta. (gato, 1) significa "encontré la palabra gato una vez". La clave es la etiqueta por la que después se agrupa.

**Para entender vos:** *shuffle* en inglés quiere decir mezclar, como mezclar cartas. Lo que hace realmente el sistema es ordenar los pares por clave y mandarlos por la red a la máquina responsable de cada clave. Es la parte más costosa de casi cualquier trabajo distribuido, también en Spark.

### 12 · Ejemplo: contar palabras

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

### 13 · Dos problemas que siempre aparecen

**Idea:** con miles de máquinas siempre hay alguna que se cae y alguna que anda lenta. Esta diapositiva plantea el problema; las dos siguientes son las soluciones generales.

**Cómo explicarlo:**
- Volvé a los problemas 3 y 4 de la diapositiva 8.
- **Nodo caído:** se pierden los datos que tenía y las tareas que estaba corriendo.
- **Nodo lento**, o *straggler*: como un trabajo termina cuando termina su última tarea, una máquina lenta frena a todas. Analogía: un grupo de trabajo práctico entrega cuando termina el último integrante.

### 14 · Solución 1: repetir la tarea en otro nodo

**Idea:** si un nodo se cae, el coordinador repite sus tareas en otro nodo que tenga una copia de los mismos datos. No se pierde nada porque los datos están replicados.

**Cómo explicarlo:**
- Conectá con HDFS (diapositiva 10): cada bloque está guardado en más de una máquina. Esa copia es la que salva.
- Con cada clic: se cae la máquina 2 mientras hacía T2; la máquina 1 también tiene B2, así que T2 se repite ahí.
- Recalcá: **no se pierde ningún dato; solo se repite el trabajo de ese nodo.**
- Funciona porque una tarea con los mismos datos siempre da el mismo resultado: repetirla no cambia la respuesta.

**Para entender vos:**
- **Cómo se entera el coordinador:** cada nodo le manda una señal cada pocos segundos, el *heartbeat* o latido. Si deja de llegar, lo da por caído.
- **En MapReduce** los resultados intermedios del map se guardan en el disco local de cada máquina; si se cae una, también se repiten sus maps. Spark tiene otra variante para lo que guarda en memoria: el lineage (diapositiva 37).
- **Si se cae el coordinador:** es un punto débil. Los sistemas reales tienen un coordinador de repuesto o relanzan el trabajo.

**Pasaje:** "¿Y si la máquina no se cae, pero anda lenta?"

### 15 · Solución 2: ejecución especulativa

**Idea:** si una tarea tarda mucho más que las demás, el sistema lanza una copia en un nodo libre y se queda con la que termine primero.

**Cómo explicarlo:**
- Leé el gráfico como línea de tiempo: cada fila es un worker. T3 cayó en un nodo lento.
- El sistema lanza una copia de T3 en el worker 1, que ya estaba libre; la copia termina antes y la original se cancela. El trabajo termina en la línea verde, no al final.
- Funciona porque una tarea con los mismos datos siempre da el mismo resultado, así que no importa cuál copia gane.

**Para entender vos:** la idea ya estaba en el paper de MapReduce de 2004. En Spark viene desactivada por defecto (diapositiva 37).

**Pasaje:** "Con esto ya están resueltos, en general, los cuatro problemas. Ahora, la otra mitad del tema: el machine learning".

---

## 03 · Machine learning sobre datos masivos

El objetivo es entender qué es machine learning, cómo se entrena un modelo cuando los datos están repartidos (con K-Means, que prepara la actividad) y por qué el disco se vuelve el gran problema. Todavía sin Spark: son ideas generales.

### 16 · Qué es machine learning

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

### 17 · El machine learning repite pasadas

**Idea:** entrenar no es leer los datos una vez: el algoritmo los recorre decenas o cientos de veces. Si cada pasada lee del disco, el costo se multiplica.

**Cómo explicarlo:**
- Analogía: estudiar para un examen. No leés el apunte una vez: lo leés, te tomás una prueba, ves en qué le erraste y volvés a leer. Cada vuelta mejora un poco.
- Mostrá el ciclo con "× N": recorrer los datos, ajustar el modelo y volver a empezar.
- Conectá con la diapositiva 4: si leer una vez ya era caro, imaginate leer cien veces.

**Pasaje:** "Veamos un algoritmo concreto que hace exactamente esto: K-Means".

**Para entender vos:** muchos algoritmos funcionan así. Por ejemplo, el descenso por gradiente (regresiones, redes neuronales) mide el error, corrige un poco los pesos en la dirección que lo reduce y repite. K-Means también itera, hasta que los centros dejan de moverse.

### 18 · K-Means: agrupar sin etiquetas

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

**Para entender vos:** las implementaciones reales no eligen los centros iniciales totalmente al azar. MLlib, por ejemplo, usa por defecto *k-means||*, una versión paralela de k-means++ que elige centros iniciales separados entre sí. K-Means siempre encuentra K grupos aunque los datos no tengan grupos claros: elegir K es una decisión de quien lo usa.

### 19 · K-Means sobre un clúster

**Idea:** asignar puntos se puede hacer en cada worker sin red, porque cada punto solo necesita conocer los centros. Mover los centros necesita información de todas las particiones, así que lo termina el driver.

**Cómo explicarlo:**
- Dejá que se vea el movimiento de los centros (la línea punteada es su recorrido).
- Conectá con los roles (diapositiva 7) y con MapReduce: el driver manda los 3 centros a todos, que es chiquito; cada worker asigna sus puntos, que es el map; y el driver junta todo para mover los centros, que es el reduce.
- Terminá con la pregunta de la diapositiva: **¿qué tiene que mandar cada worker para que el promedio dé bien?** Dejá unos segundos de silencio.

### 20 · Qué manda cada nodo al driver

**Idea:** hay tres opciones. Mandar todos los puntos es correcto pero satura la red; mandar el promedio de cada grupo es liviano pero da mal; mandar la suma y la cantidad es liviano y correcto, y es lo que hacen las bibliotecas reales, como MLlib.

**Cómo explicarlo:**
- Antes de que aparezca la opción C, preguntá cuál elegirían. Muchos van a elegir B, y eso está bien: es justo el error que explica la diapositiva siguiente. En la actividad cada celular va a mandar la opción C, un resumen, sin que nadie tenga que elegir.
- Los tamaños: 19 MB contra 48 o 72 bytes. El punto no es el número exacto sino que A crece con los datos y B y C no.

**Para entender vos:** el cálculo de A asume un millón de puntos en dos dimensiones guardados como números de 8 bytes, más algo de información extra. Lo que sacás en limpio: lo que viaja tiene que ser un resumen de tamaño fijo, no los datos.

### 21 · Por qué B da mal

**Idea:** el promedio de los promedios no es el promedio real, porque se olvida cuántos puntos había detrás de cada número.

**Cómo explicarlo:**
- El ejemplo más chico: un worker tiene un punto en 10 y otro tiene tres puntos en 0.
  - Promedio de promedios: 5.
  - Promedio real: 2,5.
- Analogía: promediar el porcentaje de votos de dos mesas sin importar que en una votaron 10 personas y en otra 1.000.
- Con suma y cantidad: (10 + 0) / (1 + 3) = 2,5. Exacto y chiquito.

**Para entender vos:** el promedio de promedios solo da bien si todos los grupos tienen la misma cantidad de puntos. Mandar suma y cantidad es la forma general de combinar promedios: se llama promedio ponderado.

### 22 · Cómo se entrena un modelo en paralelo

**Idea:** lo que hicimos con K-Means es el patrón general para entrenar en paralelo casi cualquier modelo: difundir el modelo, calcular en cada worker, combinar los resúmenes y actualizar. Repetir.

**Cómo explicarlo:**
- Recorré el ciclo con K-Means como ejemplo:
  1. **Difundir:** el driver manda los centros.
  2. **Calcular en local:** cada worker calcula sumas y cantidades.
  3. **Combinar:** se suman los resúmenes.
  4. **Actualizar:** el driver mueve los centros.
- Decí que con otros algoritmos cambia qué se calcula, pero el ciclo es el mismo.
- Lo que viaja: el modelo a la ida y resúmenes chicos a la vuelta. Los datos no se mueven. Pero cada vuelta los recorre otra vez, y dónde estén guardados va a importar muchísimo.

**Para entender vos:** **broadcast** es mandar una copia de algo chico a todos los workers una sola vez. **Combinar en árbol** es sumar los resúmenes de a pares, para que el driver no reciba cientos de mensajes juntos; en Spark esa operación se llama `treeAggregate`.

### 23 · El límite: cada paso pasa por el disco

**Idea:** en Hadoop, cada pasada es un job separado, y los jobs solo se pasan datos a través de HDFS, o sea, del disco. Con cien pasadas, se lee y escribe todo cien veces.

**Cómo explicarlo:**
- Primero definí **job**: un programa MapReduce completo, con su map, su shuffle y su reduce.
- Seguí la cadena: el job 1 lee de HDFS, calcula y escribe en HDFS; el job 2 vuelve a leer todo, y así.
- Recordá lo de las tres copias: cada escritura viaja tres veces por la red.
- Cerrá con la conclusión: para ML casi todo el tiempo se va en disco y red, no en calcular.

**Pasaje:** "¿Y si en vez de ir al disco dejáramos los datos en memoria?"

### 24 · Memoria contra disco

**Idea:** la memoria RAM es del orden de cien veces más rápida que el disco, pero es más chica y se borra al apagar. Dejar los datos en memoria entre pasadas es la salida, y es la idea central de Spark.

**Cómo explicarlo:**
- Todos lo conocen de su computadora: el disco guarda tus archivos aunque apagues; la RAM es donde está lo que estás usando ahora.
- Que se vean las barras: la del disco es casi invisible al lado de la de memoria.
- Definí **caché**: guardar algo en memoria para volver a usarlo sin ir a buscarlo de nuevo.

**Para entender vos:**
- **Los números son aproximados:** un disco rígido lee unos 200 MB/s; la RAM de un servidor, del orden de 20 GB/s o más. Con SSD rápidos la diferencia baja a "varias veces", pero la memoria sigue siendo mucho más rápida, sobre todo en accesos chicos y repetidos.
- **Si preguntan "¿y si los datos no entran en memoria?":** Spark guarda lo que entra y el resto lo deja en disco o lo vuelve a calcular. Funciona igual, solo más lento.

**Pasaje:** "Esa idea tiene nombre: Apache Spark, la tecnología sugerida".

---

## 04 · Tecnología sugerida: Apache Spark y MLlib

Hasta acá todo fue general. El objetivo ahora es que reconozcan en Spark cada idea que ya vieron: los roles, las particiones, mover el cálculo, la memoria, los fallos y el patrón de entrenamiento.

La parte central es **el recorrido (26–36)**: diez pasos en orden, desde que arranca el programa hasta que vuelve el resultado. No hay una diapositiva con el mapa completo a propósito: nombrar stages o particiones antes de explicarlos no le sirve a quien no sabe del tema. Cada diapositiva del recorrido tiene arriba una línea de pasos: los que ya vimos con su nombre, el actual resaltado y los que faltan solo con el número. Usala para ubicar al público: "estamos en el paso 6 de 10". Es la parte más larga: andá despacio.

Las diapositivas del recorrido se explican con dibujos, no con texto: la compu azul es el driver, las compus violeta, celeste y rosa son los workers, y la hoja color papel es el plan (y después, la receta del lineage). Señalá los dibujos mientras hablás.

### 25 · Qué es Spark

**Idea:** Spark es un motor de procesamiento distribuido que mantiene los datos en memoria entre un paso y el siguiente.

**Cómo explicarlo:**
- Marcá el cambio de parte: "hasta acá vimos ideas generales; ahora, una tecnología concreta que las aplica". Desde acá, cada vez que puedas decí "esto ya lo vimos".
- Leé la frase despacio y desarmala: "motor de procesamiento distribuido" es lo mismo que hacía MapReduce; "mantiene los datos en memoria" es lo nuevo.
- Contexto en una línea: nació en Berkeley en 2009, hoy es el estándar y se usa desde Python, SQL y otros lenguajes.

**Para entender vos:**
- **Origen:** lo creó Matei Zaharia en el AMPLab de UC Berkeley. Se liberó en 2010, entró a la Fundación Apache en 2013 y en 2014 pasó a ser proyecto principal (*top-level*).
- **Lenguaje:** está escrito en Scala.
- **Databricks:** sus creadores fundaron esta empresa, que es la que más lo desarrolla.
- **Si preguntan si Spark reemplaza a Hadoop:** reemplaza a MapReduce, el motor. Muchas veces Spark corre usando HDFS para guardar y YARN para administrar las máquinas.

**Pasaje:** "Ahora vamos a abrirlo, paso a paso: qué pasa desde que arranca un programa hasta que vuelve el resultado."

### 26 · Paso 1 · Todo empieza en el driver

**Idea:** el driver es el proceso que corre tu programa. Coordina todo, pero no procesa los datos.

**Cómo explicarlo:**
- Mostrá la línea de arriba: "son diez pasos; cada uno aparece con su nombre cuando lo explicamos".
- Arrancá recordando los tres roles de la diapositiva 7.
- "Es el jefe de cocina, pero todavía no tiene cocineros." Remarcá que todavía no hay máquinas trabajando ni tareas: está solo.

**Para entender vos:** "proceso" es un programa en ejecución. El driver puede correr en tu computadora o dentro del clúster. En código, aparece cuando creás la sesión de Spark (`SparkSession`).

### 27 · Paso 2 · El driver pide recursos

**Idea:** el driver le pide máquinas y memoria al cluster manager.

**Cómo explicarlo:**
- Un ejemplo concreto: "necesito tres máquinas con cuatro núcleos y ocho gigas cada una".
- Nombrá los tres cluster managers posibles: standalone, que viene con Spark; YARN, el de Hadoop que vimos; y Kubernetes, muy usado hoy para administrar servidores en la nube.
- Remarcá la confusión más común: **el cluster manager no procesa ni un dato.** Es como una agencia que te consigue cocineros, pero no cocina.

### 28 · Paso 3 · En cada worker arranca un executor

**Idea:** en cada worker se lanza un executor, el proceso que hace el trabajo de verdad, con su propia CPU y memoria. Por ahora están vacíos.

**Cómo explicarlo:**
- Distinguí worker de executor: el **worker** es la máquina; el **executor** es el programa de Spark que corre en esa máquina.
- En la cocina, el worker es la hornalla y el executor el cocinero parado ahí.
- Los executors se presentan ante el driver, y desde ahí el driver habla directo con ellos.
- Señalá que dicen "sin datos todavía": falta lo más importante.

**Para entender vos:** una máquina puede tener más de un executor, y cada executor corre varias tareas a la vez (una por núcleo). Para la charla alcanza con uno por worker.

### 29 · Paso 4 · Los datos se parten en particiones

**Idea:** los datos ya estaban guardados en bloques. Spark los ve como una sola colección, el RDD, pero la guarda en pedazos llamados particiones. Se corre una tarea por partición.

**Cómo explicarlo:**
- RDD son las siglas de *Resilient Distributed Dataset*: un conjunto de datos distribuido y resiliente. Para el programador es una lista enorme; por dentro, está en pedazos.
- Conectá con HDFS: "es la misma idea que los bloques, pero del lado del procesamiento". Muchas veces cada bloque de HDFS se convierte en una partición.
- Las tres propiedades, una por clic:
  - **Particionado:** se procesa en paralelo.
  - **Inmutable:** no se modifica; cada operación crea uno nuevo.
  - **Resiliente:** si se pierde una partición, se puede recalcular.
- Avisá que lo de resiliente lo vamos a ver en el paso 10 (diapositiva 36).

**Para entender vos:** que sea inmutable es lo que permite recalcular: como nada se pisa, siempre se puede rehacer un pedazo desde el original.

### 30 · Paso 4 · Cada worker recibe sus particiones

**Idea:** cada executor trabaja con las particiones que tiene en su propia máquina. Eso es **localidad de datos**.

**Cómo explicarlo:**
- Mirá cómo las particiones vuelan a cada worker: P1 y P2 al primero, P3 y P4 al segundo, P5 y P6 al tercero.
- Esto responde al problema 2 de la diapositiva 8, la red lenta: en vez de traer los datos al programa, se lleva el programa a los datos.
- Cerrá la preparación: "tenemos máquinas y datos, y todavía no se procesó nada. Ahora el programa empieza a pedir cosas".

**Para entender vos:**
- **Qué pasa realmente:** la animación simplifica. Cada executor lee del almacenamiento (por ejemplo HDFS) los bloques que tiene en su misma máquina, y si se le pide, los guarda en memoria.
- **DataFrame:** es lo que más se usa hoy. Es lo mismo que un RDD pero con columnas y un esquema, como una tabla, y eso permite optimizar las consultas.

### 31 · Paso 5 · Primero se anota, después se hace

**Idea:** Spark no ejecuta cada operación cuando la escribís. Las transformaciones solo se anotan en un plan; recién una acción pone a trabajar al clúster. A eso se le dice evaluación perezosa.

**Cómo explicarlo:**
- Ejemplo que sirve para este paso y los siguientes: contar cuántos errores hay de cada tipo en los logs de un servidor.
- Antes del primer clic, describí el dibujo: a la izquierda el driver; en el medio, la hoja donde anota el plan; a la derecha, los workers con sus particiones, dormidos ("zzz").
- Clics 1 a 4: aparece un paso por clic en la hoja (leer los logs, quedarse con los errores, sacar el tipo de error, agrupar por tipo). Después de cada uno preguntá: "¿algún worker se movió?". No. Con el cuarto aparece "Transformaciones: solo se anotan".
- **Transformaciones:** cada una recibe un RDD y devuelve uno nuevo, sin tocar el original. Pero cuando la escribís, Spark no lee ni un byte ni manda ninguna tarea: solo la anota. Por eso la línea vuelve al instante aunque el archivo pese un terabyte.
- Clic 5: aparece **Contar**, con el rayo. Es una **acción**: un pedido de un resultado concreto (contar, guardar, traer datos al driver). Las flechas verdes salen hacia los workers, se prenden sus pantallas y desaparece el "zzz": es lo único que dispara la ejecución.
- Analogía: la lista del súper. Anotar "leche, pan, huevos" no te trae nada a casa; vas una vez, cuando la lista está completa, y elegís el mejor recorrido.
- Por qué conviene esperar: con el plan completo, Spark lo optimiza.
  - Encadena pasos: filtrar y transformar se hacen en una sola pasada, sin guardar un RDD intermedio.
  - Filtra apenas lee y lee solo las columnas que usa (con DataFrames).
  - No calcula lo que nadie pidió: si pedís las primeras diez filas, no procesa todo el archivo.
- Ojo: no confundas este paso con la memoria (paso 9). Si pedís dos acciones sobre el mismo RDD, Spark ejecuta el plan dos veces desde la lectura, salvo que lo guardes en memoria con `cache()`.

**Para entender vos:** en código, `filter` y `map` son transformaciones; `count`, `collect` y `write` son acciones. Con DataFrames hay un optimizador (Catalyst) que reordena el plan automáticamente.

### 32 · Paso 6 · El trabajo se corta en stages

**Idea:** cada acción dispara un job. Spark lo corta en stages donde hace falta un shuffle, y cada stage se divide en tasks, una por partición.

**Cómo explicarlo:** todo con el dibujo y el ejemplo de los logs. Cada figurita es un error, y la forma dice de qué tipo es: triángulo, círculo o cuadrado. Cada tipo tiene el color de la compu que lo va a juntar.
- Al llegar se ve el **stage 1**: los mismos tres workers, cada uno con errores de los tres tipos mezclados. Leer, quedarse con los errores y sacar el tipo se hace línea por línea, así que cada worker lo hace solo, con lo suyo. **Stage:** una tanda de pasos que cada partición puede hacer sola, sin pedirle datos a otra máquina.
- **Task:** señalá la pantalla de cada compu (T1 T2, T3 T4, T5 T6). Una task es un stage aplicado a una partición, lo que el driver le manda a un executor. Seis particiones, seis tasks.
- Primer clic, **fin del stage 1:** las figuritas de cada compu se ordenan en sobres, uno por tipo. Cada worker deja sus sobres en su propio disco y le avisa al driver: "terminé, mis sobres están acá". El driver no recibe los datos: solo anota dónde quedó cada sobre.
- Preguntá: "para contar los triángulos, ¿qué problema hay?". Hay un sobre de triángulos en cada una de las tres compus: las particiones se arman por posición en el archivo, no por contenido.
- Segundo clic, **el driver arma el stage 2:** aparece el driver en el medio y manda tres tasks nuevas, una por tipo. T7: "vos juntás los triángulos"; T8, los círculos; T9, los cuadrados. Al lado de cada compu queda la silueta punteada del tipo que le toca. Cada task es un mensaje chico: qué juntar y en qué compus están los sobres. Ojo con el orden: primero llegan las tasks y después se mueven los datos.
- Tercer clic, **shuffle:** el driver se va de la escena porque ya no participa. Cada task va a buscar sus sobres a todas las compus; todos le piden a todos, por eso las líneas se cruzan. Los datos viajan de worker a worker y nunca pasan por el driver. Analogía: el escrutinio de una elección. Cada mesa armó un sobre por candidato, y la persona que suma a García pasa por todas las mesas juntando los sobres de García. Es el mismo shuffle de MapReduce (diapositiva 11) y es lo más caro, porque usa la red y el disco. Por eso Spark corta ahí: el stage 2 no arranca hasta que termina el stage 1.
- Cuarto clic, **cada task cuenta su tipo:** 7 triángulos, 5 círculos, 4 cuadrados. Al driver vuelve solo el número. Tres particiones, tres tasks.
- Quinto clic, **job:** la llave de abajo junta todo. Un job es todo el trabajo que dispara una acción, en este caso Contar. Una acción, un job: si el programa tiene tres `count`, son tres jobs.
- Resumí: una acción dispara un job, el job se corta en stages en cada shuffle, y cada stage se reparte en una task por partición.

**Para entender vos:**
- **DAG:** el driver arma el job a partir del plan del paso 5, que por dentro es un DAG: un grafo de pasos con flechas que siempre van para adelante. No hace falta nombrarlo si no preguntan.
- **Dónde corta un stage:** en las *dependencias anchas*, cuando una partición nueva necesita datos de muchas particiones anteriores (agrupar, ordenar, unir tablas).
- **Dónde no corta:** en las *dependencias angostas*, como filtrar o transformar fila por fila, que quedan en el mismo stage.
- **Qué hay en cada sobre:** en un conteo, cada máquina suele contar lo suyo antes de guardar, así que el sobre lleva el conteo parcial ("timeout: 40") y no cada línea. Es la misma idea que los resúmenes de la actividad. El dibujo muestra las figuritas para que se vea qué se mueve.
- **Quién mueve los datos:** en el shuffle de Spark, las tasks del stage 2 piden los sobres (*shuffle read*). Las del stage 1 solo los dejan escritos en su disco (*shuffle write*). El driver guarda el registro de qué sobre está en qué compu y se lo pasa a cada task.
- **A qué compu va cada task del stage 2:** a cualquier executor libre. No tiene la ventaja de la localidad del paso 7, porque sus datos están repartidos en todas las compus.

### 33 · Paso 7 · El driver manda las tareas

**Idea:** cada tarea va al executor que ya tiene su partición. Lo que viaja por la red es la tarea, que es chiquita, no los datos.

**Cómo explicarlo:**
- Aclaralo al empezar: "volvamos al stage 1 y miremos de cerca adónde va cada task".
- T1 y T2 van al worker 1 porque ahí están P1 y P2.
- "Es llevarle la receta al cocinero que ya tiene los ingredientes en su heladera."
- Señalá que el cluster manager quedó en gris: ya prestó las máquinas y no participa más. Desde acá el driver habla directo con los executors.

**Para entender vos:** si preguntan por qué las tareas recién aparecen acá, es porque el driver las arma cuando llega la acción (paso 6).

### 34 · Paso 8 · Vuelven resultados, no datos

**Idea:** cada executor procesa sus particiones ahí mismo y devuelve al driver un resultado chico. **Se mueve el cálculo, no los datos.**

**Cómo explicarlo:**
- Las flechas verdes son los resultados parciales: un conteo, una suma, unos pocos números.
- Hacé notar lo que no se movió: las particiones siguen en cada worker. Por la red viajaron las tareas a la ida y los resultados a la vuelta.
- Si la próxima iteración necesita los mismos datos, siguen ahí, en memoria. Eso conecta con el paso siguiente.

**Pregunta al público:** "¿Qué pesa más, una tarea o una partición de 128 MB?"

### 35 · Paso 9 · Cinco iteraciones: Hadoop contra Spark

**Idea:** con los datos en memoria, las iteraciones siguientes son solo cálculo. Con cinco iteraciones, Spark tarda casi tres veces menos, y la diferencia crece con más iteraciones.

**Cómo explicarlo:**
- Leé los colores: naranja y gris son disco, azul es calcular. La barra de Hadoop es casi toda disco: cada vuelta es un job que lee, calcula y escribe.
- Spark, con `cache()`, lee una vez en la primera acción y deja las particiones en la memoria de cada executor. Las vueltas siguientes son solo azul.
- En la cocina: Hadoop va a buscar los ingredientes a la heladera en cada vuelta; Spark los deja sobre la mesada.
- **Decí que los tiempos son de ejemplo**, para ver la forma. El dato real es que el paper de Spark midió hasta 20 veces más rápido en algoritmos iterativos.

**Para entender vos:**
- El paper de los RDD es de Zaharia y otros, NSDI 2012. La ganancia depende del caso: en trabajos de una sola pasada la diferencia es chica, porque igual hay que leer todo una vez.
- Sin `cache()`, cada acción volvería a leer del disco (naranja, azul, naranja, azul…). Igual sería más corto que Hadoop, porque no escribe al disco entre paso y paso: dentro de un stage, Spark encadena los pasos en memoria.

### 36 · Paso 10 · Si se cae un worker: lineage

**Idea:** en general, si se cae un nodo se repite su tarea con una copia de los datos (diapositiva 14). Pero Spark tiene los resultados intermedios en memoria, sin copias. Por eso no guarda copias de cada resultado intermedio: guarda la receta de cómo se calculó cada partición. Si se pierde una, la rehace en otro nodo siguiendo esa receta.

**Cómo explicarlo:**
- Analogía de cocina: si se te cae una torta, no necesitás tener otra torta de repuesto si tenés la receta y los ingredientes.
- Seguí el dibujo: a la izquierda, tres workers con P1, P2 y P3; en el medio, la receta de P2, que son los mismos pasos que el driver anotó en el paso 5.
  - Primer clic: se cae el worker celeste (la cruz roja) y P2 se pierde.
  - Segundo clic: Spark repite la receta y P2 aparece rehecha en el worker rosa. P1 y P3 no se tocan.
- Conectá con la inmutabilidad (paso 4): como nada se pisa, la receta siempre funciona.
- Cerrá el recorrido: "del driver al resultado, aunque se caiga una máquina".

**Para entender vos:**
- **Checkpoint:** si la receta es muy larga (cientos de iteraciones), rehacer todo sería lento, así que se puede guardar un *checkpoint* en disco cada tanto y la receta empieza desde ahí.
- **Si se cae el driver:** el lineage no lo cubre. Si se cae el driver se pierde el trabajo y hay que relanzarlo.
- **Nodos lentos en Spark:** usa la ejecución especulativa de la diapositiva 15. Viene **desactivada por defecto** (`spark.speculation`). Con los valores por defecto actuales, una tarea es candidata cuando ya terminó el 90 % del stage y ella tarda más de 3 veces la mediana.

### 37 · Un motor y varias bibliotecas

**Idea:** todo el recorrido es Spark Core. Encima hay bibliotecas que lo usan, y una es MLlib, la de machine learning.

**Cómo explicarlo:**
- Las capas de abajo hacia arriba:
  1. Cluster manager.
  2. Spark Core, que es el recorrido que vimos.
  3. Las bibliotecas: SQL, Streaming, MLlib y GraphX.
- Lo importante es que comparten el núcleo, así que en un mismo programa se puede leer con SQL y entrenar con MLlib sin mover los datos.

**Para entender vos:** Structured Streaming procesa datos que llegan en tiempo real. GraphX trabaja con grafos, o sea datos de redes y conexiones, como quién sigue a quién.

### 38 · MLlib: algoritmos ya distribuidos

**Idea:** MLlib trae algoritmos que ya saben trabajar con datos repartidos. No hay que programar la distribución.

**Cómo explicarlo:**
- Definí antes de usar:
  - **MLlib:** la biblioteca de machine learning de Spark. Uno llama al algoritmo y MLlib reparte el trabajo con todo el recorrido: particiones, tareas y memoria.
  - **DataFrame:** una tabla con filas y columnas con nombre, como una tabla de SQL, pero partida en particiones entre los workers. Por eso el mismo código corre en una computadora o en cientos.
  - Recordá **supervisado** (aprende de ejemplos con la respuesta correcta) y **no supervisado** (busca patrones sin respuesta), de la diapositiva 16.
- Primer clic:
  - **Clasificación:** supervisado; la respuesta es una categoría. Miles de mails marcados como spam o no spam, y aprende a decidir con mails nuevos.
  - **Regresión:** supervisado; la respuesta es un número, como las ventas del mes que viene.
  - **Clustering:** no supervisado; agrupa lo parecido. Es K-Means, el de la actividad.
- Segundo clic:
  - **Recomendación:** el "otros clientes también compraron".
  - **Features:** las columnas que describen cada dato (en un mail, cuántos links tiene o qué palabras usa). Los algoritmos solo entienden números, así que estas herramientas pasan texto y categorías a números.
  - **Pipelines:** encadenar los pasos y medir qué tan bien predice el modelo, probándolo con datos que no vio y comparando con la respuesta real. Es la próxima diapositiva.
- Conectá con la parte 03: por dentro, MLlib usa el patrón de la diapositiva 22, y su K-Means manda suma y cantidad, la opción C de la diapositiva 20.

**Para entender vos:**
- **Las dos APIs:** la API principal de MLlib hoy es la basada en DataFrames (`spark.ml`). La vieja, basada en RDD (`spark.mllib`), está en mantenimiento desde Spark 2.0.
- **Algoritmos que podés nombrar si preguntan:**
  - Clasificación: regresión logística, árboles de decisión y random forest.
  - Recomendación: ALS.
  - Clustering: K-Means.

### 39 · Un pipeline encadena los pasos

**Idea:** en la práctica no se programa el ciclo de entrenamiento a mano: se arma un pipeline con piezas que transforman datos (transformers) y piezas que aprenden (estimators).

**Cómo explicarlo:** armalo con un ejemplo, el del spam, siguiendo los clics.
- Un **pipeline** es una cadena de pasos, como una línea de producción: los datos entran por un lado, pasan por cada estación y salen transformados.
- Primer clic: entran los **datos**, un DataFrame con el texto del mail y si es spam o no.
  - **Limpiar:** pasa todo a minúsculas y separa las palabras.
  - **A números:** convierte cada mail en una lista de números (un **vector**), por ejemplo cuántas veces aparece cada palabra.
  - Las dos son **transformers**: reciben una tabla y devuelven la misma tabla con una columna nueva. Aplican una regla fija; no aprenden nada.
- Segundo clic: el **algoritmo** es un **estimator**, una pieza que primero tiene que aprender.
- Tercer clic: aprender se llama **`fit`** (entrenar). Lo que devuelve es el **modelo**, que es otra vez un transformer: le das mails nuevos y les agrega la columna "predicción".
- Con K-Means se ve clarísimo: `KMeans(k=3)` es el estimator; `fit` es repetir las vueltas hasta que los centros no se mueven; el modelo son los tres centros, y como transformer le agrega a cada punto nuevo la columna "grupo".
- La ventaja: se entrena toda la cadena de una vez y después a los datos nuevos se les aplican los mismos pasos en el mismo orden, sin riesgo de preparar los datos de una forma al entrenar y de otra al predecir.

### 40 · Cuándo conviene usar Spark

**Idea:** Spark no es siempre la respuesta. Conviene cuando los datos no entran en una máquina o cuando el algoritmo recorre los mismos datos muchas veces. Si entran en tu computadora, hay herramientas más simples y más rápidas.

**Cómo explicarlo:** repartir tiene un costo, el de coordinar y mover datos por la red. Regla práctica: si cabe en tu computadora, probá primero sin Spark. Esto muestra criterio y suele gustarle a quien evalúa.

**Para entender vos:** pandas y scikit-learn son bibliotecas de Python pensadas para una sola máquina. Spark tampoco es una base de datos para responder consultas en milisegundos: está hecho para procesar mucho de una vez, no para muchas consultas chiquitas.

---

## 05 · Cierre y actividad

### 41 · Cada problema, su solución

**Idea:** los cuatro problemas del principio más el del machine learning, cada uno con su solución general y cómo la aplica Spark.

**Cómo explicarlo:**
- Leé las filas con cada clic, conectando con lo visto:

  | Problema | Solución general | En Spark | Diapositivas |
  |---|---|---|---|
  | Partir los datos | Particiones, una tarea por partición | RDD y DataFrames | 8, 29–30 |
  | Red lenta | Mover el cálculo, no los datos | Tareas al executor que tiene la partición | 10, 33–34 |
  | Fallas | Rehacer lo perdido en otro nodo | Lineage | 14, 36 |
  | Nodos lentos | Ejecución especulativa | `spark.speculation` | 15 |
  | ML iterativo | Datos en memoria entre pasadas | `cache()` | 24, 35 |

- Es el cierre de la teoría: si alguien se perdió en el medio, acá se reengancha.

**Pasaje:** "Y ahora, en vez de escucharlo, lo van a vivir".

### 42 · Los pasos, unos siete minutos

**Idea:** anticipar qué va a pasar en la actividad para que nadie se pierda.

**Cómo explicarlo:**
- Contá los pasos rápido, sin detalle (si la diapositiva todavía dice "Seis pasos", usá esta lista):
  1. Se unen con el celular.
  2. Cómo se juega: el proyector muestra un ejemplo y cada uno practica con 3 puntos que no cuentan. El reloj arranca cuando vos lo decidís.
  3. Cada uno es **el driver**, solo con todos los puntos y 20 segundos. Quien pinta más queda como driver.
  4. Aparece **el cluster manager** (el proyector) y le dice a cada celular libre que va a ser un worker.
  5. Los celulares son **workers**: cada uno pinta su parte de 6 puntos y le manda un resumen al driver.
  6. El driver junta los resúmenes, mueve los centros y repite hasta que no cambian.
  7. Se cae una compu y otra hace su parte: no se pierde nada.
  8. Cierre: qué fue cada cosa.
- Es el mismo orden del recorrido (26–36): el driver, el driver pide recursos, los workers, las particiones, las tareas y los resultados que vuelven.

### 43 · El clúster son ustedes

**Idea:** instrucciones para entrar.

**Cómo explicarlo:**
- Instrucciones:
  1. Escaneen el QR o entren a la dirección.
  2. Pongan su nombre.
  3. Esperen: van a arrancar siendo el driver.
- En este momento cambiá a la pestaña del proyector (`/driver`), que muestra el QR grande.
- Esperá a que entre la mayoría antes de arrancar. Quien entra tarde se puede sumar como worker en cualquier paso.

**Para entender vos:** la diapositiva no tiene la dirección escrita: la gente entra con el QR del proyector. Antes de la clase probá entrar desde un celular con datos móviles, no solo con el wifi de tu casa. Para ensayar sin gente, `npm run bots -- 25` simula 25 celulares. El paso a paso de la actividad está en `guiones/03-actividad-web.md`.

### 44 · Preguntas

**Idea:** cierre y referencias.

**Cómo explicarlo:** agradecé, nombrá los tres papers principales (RDD, MapReduce, MLlib) y decí que el código y el informe están en el repositorio.

---

## Durante la actividad: qué remarcar en cada paso

En cada paso conectá lo que pasa en los celulares con una diapositiva:

| Paso | Qué está pasando | Qué decir | Diapositiva |
|---|---|---|---|
| Unirse | Cada celular entra y recibe un número | "Cada celular es una compu" | 6 |
| Cómo se juega | Ejemplo en el proyector y 3 puntos de práctica en el celular | "Cada punto va con el centro más cercano: eso es asignar en K-Means" | 18–19 |
| Driver solo | Cada uno pinta solo todos los puntos durante 20 segundos y nadie termina | "El driver es el programa que tiene el trabajo. Solo, con todos los datos, no llega" | 5, 26 |
| Cluster manager | Aparece el proyector como cluster manager y anota a cada celular libre como worker | "El cluster manager no trabaja: sabe qué compus están libres y se las presta al driver" | 7, 27 |
| Workers | Cada uno pinta su parte de 6 puntos y le manda un resumen al driver | "Cada parte es una partición; pintarla es una tarea. Viajan resúmenes, no puntos" | 28–34 |
| Juntar | El driver junta los resúmenes, mueven los centros y repiten solos | "Juntar es el reduce. Repetir hasta que no cambie es entrenar. Por eso conviene la memoria" | 20, 22, 35 |
| Se cae una | Se cae una compu y otra pinta su parte | "No se perdió nada: el cluster manager se dio cuenta y la tarea se hizo en otra compu" | 14, 36 |
| Cierre | Tabla del aula contra un clúster de verdad | "Todo lo que hicimos a mano, MLlib lo hace en una línea" | 38 |

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
| Driver | El proceso que corre tu programa, arma el plan y reparte tareas | 7 |
| Cluster manager | Presta máquinas a cada programa (standalone, YARN, Kubernetes); en standalone se llama master | 7 |
| Worker | Máquina que trabaja | 7 |
| Straggler | Nodo que no falla pero anda lento y frena a todos | 8, 13 |
| Tarea (task) | Un pedazo de trabajo sobre una partición | 8, 32 |
| Partición | Cada pedazo de los datos; se procesa una tarea por partición | 8, 29 |
| MapReduce | Modelo de Google: el programador escribe map y reduce, y el sistema hace el resto | 9 |
| Hadoop | Versión libre de MapReduce, con HDFS y YARN | 9 |
| YARN | Administrador de máquinas de Hadoop; Spark lo puede usar | 9, 27 |
| HDFS | Sistema de archivos que reparte bloques en muchas máquinas, con 3 copias | 10 |
| Map | Cada máquina procesa su pedazo y anota pares clave-valor | 11 |
| Shuffle | Reacomodar por la red los datos para juntar los de la misma clave | 11, 32 |
| Reduce | Combinar los valores de cada clave | 11 |
| Par clave-valor | Un dato con etiqueta, como (gato, 1) | 11 |
| Heartbeat / latido | Señal periódica con la que el coordinador sabe que un nodo sigue vivo | 14 |
| Ejecución especulativa | Lanzar una copia de una tarea lenta y usar la que termine primero | 15 |
| Machine learning | Que el programa aprenda reglas a partir de ejemplos | 16 |
| Modelo | Lo que aprendió el algoritmo, guardado como números | 16 |
| Entrenar | Ajustar el modelo a los ejemplos | 16 |
| Etiqueta | La respuesta correcta de un ejemplo (spam o no spam) | 16 |
| Supervisado / no supervisado | Con etiquetas / sin etiquetas | 16 |
| Iteración | Una pasada completa por los datos | 17 |
| K-Means | Algoritmo que agrupa puntos en K grupos | 18 |
| Centro (centroide) | El punto que representa a un grupo en K-Means | 18 |
| Broadcast | Mandar una copia de algo chico a todos los workers | 22 |
| Combinar en árbol | Sumar resúmenes de a pares; en Spark se llama treeAggregate | 22 |
| Job | En Hadoop, un map y un reduce completos; en Spark, lo que dispara una acción | 23, 32 |
| RAM / memoria | Almacenamiento rápido que se borra al apagar | 24 |
| Caché | Guardar algo en memoria para reusarlo | 24 |
| Executor | Proceso de Spark en un worker que procesa particiones | 28 |
| RDD | *Resilient Distributed Dataset*: la colección repartida de Spark, particionada, inmutable y resiliente | 29 |
| DataFrame | Un RDD con columnas, como una tabla | 30 |
| Localidad de datos | Procesar cada partición donde ya está | 30 |
| Transformación | Paso que describe un cálculo pero no lo ejecuta | 31 |
| Acción | Pedido de un resultado que dispara la ejecución | 31 |
| Evaluación perezosa | Anotar el plan y ejecutar recién cuando hace falta | 31 |
| Stage | Pasos que se hacen sin mover datos entre máquinas | 32 |
| DAG | Diagrama de pasos con flechas que no vuelven atrás (no aparece en pantalla) | 32 |
| Lineage | La receta de cómo se calculó cada partición | 36 |
| Checkpoint | Guardar en disco un punto intermedio para acortar la receta | 36 |
| MLlib | La biblioteca de machine learning de Spark | 37 |
| Feature | Una columna que describe cada dato, en forma de número | 38 |
| Pipeline | Cadena de pasos de preparación y entrenamiento | 39 |
| Transformer / Estimator | Pieza que transforma datos / pieza que aprende (`fit`) | 39 |

---

## Antes de presentar

- [ ] Completar en la portada `[Cátedra y año]`, `[Nombre y apellido]` y `[Fecha]`.
- [ ] Pasar la presentación entera una vez en modo Presentar, para ver las animaciones.
- [ ] Levantar el servidor y el túnel, y probar entrar desde un celular con datos móviles.
- [ ] Tener abierta la pestaña del proyector (`/driver`) para cambiar a ella en la diapositiva 43.
- [ ] Ensayar la actividad una vez con `npm run bots -- 25`.
- [ ] Ensayar en voz alta el recorrido (26–36) de corrido, como una sola historia: es la parte más larga y la más importante.
