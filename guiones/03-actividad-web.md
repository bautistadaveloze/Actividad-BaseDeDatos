# Guion 3 · Actividad web: el aula es un clúster

**Duración:** 7 minutos (minutos 10–17 de la exposición)  
**Necesitan:** computadora conectada al proyector, red local y celulares de la clase.

La actividad es una simulación didáctica: los celulares no ejecutan Spark real. La idea es que la clase viva, en orden, lo mismo que pasa en Spark: primero cada uno es **el driver** solo con todo el trabajo, después aparece **el cluster manager**, después los celulares se suman como **workers**, mandan **resúmenes**, y al final se cae una compu y **no se pierde nada**.

## Preparación previa

1. En la carpeta `Actividad-BaseDeDatos`, ejecutá `npm start`.
2. Abrí la dirección de **Presentación** que imprime la terminal. La actividad está en la última diapositiva.
3. Comprobá que el QR apunte a la dirección de red de la computadora. Esa dirección aparece en texto al lado del QR.
4. Probá todo el recorrido con dos celulares (o dos pestañas con `/?nombre=Ana` y `/?nombre=Beto`): con uno solo no hay driver de celular y lo hace el proyector.
5. Para ensayar sin clase, ejecutá `npm run bots -- 25`. Simula 25 celulares que pintan, se suman y mandan resúmenes solos.
6. Si los celulares no pueden conectarse, usá el plan alternativo del informe: puntos y centros impresos, cada mesa pinta a mano y los resúmenes se juntan en la pizarra.

## Qué ve y hace la clase

### 10:00–10:45 · Unirse

**Proyector:** "Sumate con tu celular", el QR grande y la dirección en texto. A la derecha, las compus conectadas.

**Clase:** escanea el QR, escribe su nombre y toca **Entrar**. Tiene que dejar la pantalla prendida.

**Vos:** cuando haya gente conectada, tocá **Empezar: cada uno es el driver**.

> "Ahora cada uno de ustedes es el driver: la compu que tiene el trabajo. Tienen 20 segundos."

### 10:45–11:30 · Paso 1 · Sos el driver

**Celular:** "Sos el driver", un reloj que baja de 20 a 0 y **todos** los puntos del trabajo (unos 6 por persona del aula: con 22 personas, 132). Hay que tocar el centro más cercano al punto que titila, uno por uno.

**Proyector:** la cuenta regresiva gigante y "Los que más pintaron" en vivo. Leé los nombres para meter presión.

**Cuando termina el tiempo:** el proyector dice "Nadie terminó", quién pintó más, cuánto tardaría un driver solo (por ejemplo, "unos 3 minutos") y "Ana va a ser el driver del clúster". Cada celular muestra cuánto le faltó.

**Vos:** tocá **Siguiente: aparece el cluster manager**.

> "Una sola compu con todos los datos no llega. Y esto eran 132 puntos: imagínense millones. Ana, que pintó más que nadie, va a ser nuestro driver. Pero ahora va a tener ayuda."

### 11:30–12:30 · Paso 2 · Aparece el cluster manager

**Proyector:** un diagrama de tres cajas: **Driver (Ana)** → **Cluster manager (el proyector)** → **Compus libres**. El cluster manager anota solo a todas las compus conectadas.

**Clase:** sin tocar nada, el celular vibra y dice **"Vas a ser un worker"**: el cluster manager vio que su compu está libre y la anotó. Ana, en cambio, ve "Sos el driver" y el botón **Pedir compus al cluster manager**.

**Vos:** dejá que lean su celular y pedile a Ana que toque **Pedir compus**. Si Ana no está o no quiere, tocá otra compu en la grilla para hacerla driver, o tocá **Pedir compus al cluster manager** en el proyector.

> "El cluster manager no hace el trabajo: sabe qué compus están libres y se las presta al driver. En Spark puede ser YARN, Kubernetes o el modo Standalone."

### 12:30–13:45 · Paso 3 · Los workers pintan su parte

**Celular (workers):** "Sos un worker: pintá tu parte". Ahora cada uno tiene **solo 6 puntos**. Al terminar ve su **resumen** (cuántos de cada color) y toca **Enviar resumen a Ana**.

**Celular (Ana):** "Llegaron 12 de 21 resúmenes" y la lista con los nombres a medida que llegan. Cuando llegan todos se habilita **Juntar resúmenes**.

**Proyector:** todos los puntos en gris; cada parte se pinta cuando llega su resumen. Al costado, "Resúmenes que llegaron al driver: 12 de 21".

**Vos:** si alguien tarda mucho, se puede juntar igual desde el proyector. Lo ideal es que toque Ana.

> "Fíjense: antes cada uno tenía 132 puntos; ahora tiene 6, y todos trabajan al mismo tiempo. Y a Ana no le mandan los puntos: le mandan un resumen."

### 13:45–14:45 · Paso 4 · El driver junta los resúmenes

**Proyector:** los centros se mueven con una línea punteada. Dos barras comparan "Con el clúster · 9 s" contra "Un driver solo · unos 3 minutos" (medido con lo que pintaron en el paso 1). Dato destacado: "Por la red viajaron 21 resúmenes, no 126 puntos."

**Celular (Ana):** "Juntaste los resúmenes" y el botón **Repetir solo hasta que no cambie**. Pedile que lo toque: los celulares calculan solos varias vueltas hasta que los centros dejan de moverse. Cae una lluvia de formas en el proyector y los celulares vibran.

**Vos:** después tocá **Siguiente: se cae una compu**.

> "Entre todos tardamos segundos; solo, minutos. Y el clúster termina cuando termina el último. Repetir esto hasta que no cambie es entrenar un modelo: K-Means."

### 14:45–16:15 · Paso 5 · ¿Y si se cae una compu?

**Celular:** empieza otra vuelta a mano: cada worker vuelve a pintar su parte.

**Vos:** mientras pintan, tocá **Girar la ruleta** (o la tecla K). Las compus se iluminan de a una hasta frenar en una víctima. También podés tocar un worker en la grilla para que se caiga directo.

**Qué pasa:**
- La víctima ve "¡Se cayó tu compu!" (es de mentira).
- Otra compu ve "Te llegó trabajo extra" y después de su parte pinta la de la víctima.
- El proyector dice "Se cayó la compu de Bruno. El cluster manager le pasó su parte a Beto." y esos puntos quedan con un anillo.
- Ana ve llegar "Beto · hizo la parte de Bruno".

Generá suspenso con la ruleta y pedile a la víctima que levante la mano. Cuando llegan todos, Ana toca **Juntar resúmenes**: "Llegaron las 21 partes con 20 compus. No se perdió nada."

**Si alguien se desconecta de verdad** (cierra la pestaña o se queda sin wifi) en el medio de una vuelta a mano, a los 6 segundos pasa lo mismo sin ruleta: el cluster manager le da su parte a otra compu. Aprovechalo.

**Vos:** tocá **Cierre**. Si hace falta, **Prender todas** devuelve cada parte a su compu.

> "En un clúster de verdad se rompen máquinas todos los días. El cluster manager se da cuenta y el driver vuelve a mandar esa tarea a otra compu. Eso es tolerancia a fallos."

### 16:15–17:00 · Cierre

**Proyector:** "Lo que hicimos es lo que hace un clúster", con la tabla:

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

Debajo: "21 partes · 126 puntos · 4 vueltas · 1 compu caída y ningún dato perdido".

**Clase:** en el celular aparecen sus medallas: fuiste el driver, pintaste más que nadie solo, hiciste el trabajo de otra compu, se cayó tu compu y no se perdió nada, sobreviviste a la ruleta o fuiste un worker.

**Vos:** si la clase quiere otra ronda, usá **Reiniciar actividad**. Pide confirmación.

> "Con Spark MLlib, todo esto se escribe así: `modelo = KMeans(k=3).fit(datos)`."

## Teclas del proyector

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
| Esc | Cierra el QR |

## Si algo falla

- **Alguien no se conecta:** puede mirar el proyector. La actividad sigue sin él.
- **Alguien entra tarde:** el cluster manager lo anota como worker solo y recibe su parte en el momento.
- **El driver se queda sin batería o no quiere:** en el paso 2, tocá otra compu en la grilla para hacerla driver. Después del paso 2, todo lo que hace el driver se puede hacer desde los botones del proyector.
- **Alguien no termina de pintar:** se puede juntar igual desde el proyector; el driver completa lo que falta.
- **Sin wifi:** usá el plan alternativo del informe, con puntos y centros impresos.
