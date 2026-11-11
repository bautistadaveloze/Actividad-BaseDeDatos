# Guion 3 · Actividad web de K-Means

**Duración:** 7 minutos (minutos 10–17 de la exposición)  
**Necesitan:** computadora conectada al proyector, red local y celulares de la clase.

La actividad es una simulación didáctica: los celulares no ejecutan Spark real. Cada celular es una compu que pinta sus puntos y manda un resumen al coordinador.

## Preparación previa

1. En la carpeta `Actividad-BaseDeDatos`, ejecutá `npm start`.
2. Abrí la dirección de **Presentación** que imprime la terminal. La actividad está en la última diapositiva.
3. Comprobá que el QR apunte a la dirección de red de la computadora. Esa dirección aparece en texto al lado del QR.
4. Probá todo el recorrido con un celular antes de exponer: unirse, pintar los 6 puntos, enviar, juntar, repetir, apagar una compu y cierre.
5. Para ensayar sin clase, ejecutá `npm run bots -- 25`. Simula 25 celulares que se conectan solos.
6. Si los celulares no pueden conectarse, usá el plan alternativo del informe: puntos y centros impresos, cada mesa pinta a mano y los resúmenes se juntan en la pizarra.

## Qué ve y hace la clase

### 10:00–11:00 · Unirse

**Proyector:** "Sumate con tu celular", el QR grande y la dirección en texto. A la derecha, las compus conectadas.

**Clase:** escanea el QR, escribe su nombre y toca **Entrar**. Tiene que dejar la pantalla prendida.

**Celular:** "Sos la compu 07", con su nombre.

Cuando haya gente conectada, tocá **Empezar: repartir los puntos**.

> "Tu celular ahora es una compu del clúster. El proyector es el coordinador; en Spark se llama driver."

### 11:00–12:30 · Pintar

Cada celular recibe 6 puntos y hay 3 centros de colores.

**Proyector:** todos los puntos en gris y los 3 centros. Cuando alguien envía, sus puntos se pintan. Muestra "Listos: 14 de 22".

**Clase:** toca el centro (violeta, celeste o rosa) que le queda más cerca del punto que titila. Si se equivoca, la app le dice "Casi. Fijate otra vez" y puede volver a probar. Al pintar los 6, toca **Enviar al coordinador**.

**Vos:** cuando ya envió la mayoría, tocá **Juntar los resultados**. El botón se habilita con el primer envío.

> "Cada compu pinta sus 6 puntos del centro que le queda más cerca. Lo que manda es un resumen, no los puntos."

### 12:30–13:30 · Juntar

**Proyector:** "Paso 2 · El coordinador junta todo". Los centros se mueven con una línea punteada desde su posición anterior. Dato destacado: "Por la red viajaron 22 resúmenes, no 132 puntos."

**Clase:** mira cómo se mueven los centros. En su celular aparece "El coordinador juntó todo".

**Vos:** tocá **Repetir**.

> "Cada compu mandó cuántos puntos tiene de cada color y dónde están. Con eso el coordinador movió los centros."

### 13:30–15:00 · Repetir

**Proyector:** "Paso 3 · Repetir hasta que no cambie". Contador "Vuelta 3" y un gráfico chico con una barra por vuelta. Botones **Otra vuelta** y **Seguir solo**.

**Clase:** los celulares pintan solos. En cada vuelta los centros se acomodan un poco más.

**Vos:** tocá **Seguir solo** o **Otra vuelta**. Cuando los centros dejan de moverse, aparece "Listo: los centros ya no se mueven". Después tocá **Siguiente: apagar una compu**.

> "Repetir lo mismo sobre los mismos datos es entrenar un modelo. Esto es K-Means."

### 15:00–16:00 · Se apaga una compu

**Proyector:** "Paso 4 · ¿Y si se apaga una compu?" Podés tocar una compu para apagarla, o usar **Apagar una al azar**. Después aparece un cartel como "Se apagó la compu de Ana. Sus 6 puntos ahora los pinta Bruno. No se perdió nada." Esos puntos quedan marcados con un anillo.

**Clase:** el celular apagado muestra "Tu compu se apagó". Es de mentira: sus puntos los pinta otra compu. El celular que heredó dice "Heredaste 6 puntos de Ana. Ahora tenés 12."

**Vos:** si hace falta, tocá **Prender todas**. Después tocá **Cierre**.

> "Si una compu se apaga, otra hace su parte y no se pierde nada."

### 16:00–17:00 · Cierre

**Proyector:** "Lo que hicimos es lo que hace un clúster". Una tabla compara el aula con un clúster de verdad. Abajo, los números: "22 compus · 132 puntos · 6 vueltas".

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

**Clase:** mira la tabla. En su celular aparece "Gracias por ser parte del clúster", con sus números.

**Vos:** si la clase quiere otra ronda, usá **Reiniciar actividad**. Pide confirmación.

> "Con Spark MLlib, todo esto se escribe así: `modelo = KMeans(k=3).fit(datos)`."

## Teclas del proyector

| Tecla | Acción |
|---|---|
| → / ← | Fase siguiente / anterior (cuando se puede) |
| Espacio o R | Otra vuelta (en Repetir y en Se apaga una compu) |
| S | Seguir solo / pausar |
| K | Apagar una al azar (en Se apaga una compu) |
| Q | Mostrar u ocultar el QR grande |
| T | Alto contraste |
| F | Pantalla completa |
| Esc | Cierra el QR |

## Si algo falla

- **Alguien no se conecta:** puede mirar el proyector. La actividad sigue sin él.
- **Alguien entra tarde:** recibe puntos igual.
- **Alguien no termina de pintar:** se puede juntar igual. El servidor completa sus puntos.
- **Sin wifi:** usá el plan alternativo del informe, con puntos y centros impresos.
