# Guion 3 · Actividad web de K-Means

**Duración:** 7 minutos (minutos 10–17 de la exposición)  
**Necesitan:** computadora conectada al proyector, red local y celulares de los participantes.

## Preparación previa

1. En la carpeta `Actividad-BaseDeDatos`, ejecutar `npm start`.
2. Abrir la URL de **Presentación** que imprime la terminal. La consola del driver está integrada en la última diapositiva y recibe la clave automáticamente.
3. Comprobar que el QR del último tramo apunta a la dirección de red local de la computadora. Los alumnos deben poder abrir esa dirección.
4. Probar con un celular antes de exponer: unirse, asignar un punto, procesar, enviar y reducir. La comparación de tarjetas y sus resultados se presentan en las primeras diapositivas.
5. Si los teléfonos no pueden conectarse al servidor, usar el plan alternativo del informe: puntos y centroides impresos, asignación manual y combinación de sumas y cantidades en la pizarra.

## Qué ve y hace la audiencia

### 10:00–11:00 · Unirse

En la última diapositiva ya está visible el QR de la consola. Pidan que la clase lo escanee y escriba su nombre. Expliquen:

> “La pantalla del proyector representa al driver que coordina. Cada celular representa un executor para esta simulación.”

No presenten los celulares como executors de Spark reales.

### 11:00–12:00 · Repartir

Cuando haya participantes conectados, inicien la actividad desde la consola. A cada celular le llegará una partición de ocho puntos.

> “El conjunto se dividió en particiones; cada participante recibió solo una parte.”

### 12:00–13:30 · Asignar un punto y procesar la partición

Cada celular muestra ocho puntos y tres centroides. La persona ubica en el gráfico el punto rodeado, elige el color del centroide que le parece más cercano y toca **Confirmar y procesar**. La aplicación confirma si acertó y asigna automáticamente los otros siete puntos.

> “La asignación al centroide más cercano es un paso de K-Means. Ustedes hicieron ese paso para un punto; el executor lo repite para el resto de su partición.”

### 13:30–15:00 · Comparar qué mandar

Dividan el aula en dos mitades. La mitad izquierda selecciona A; la mitad derecha, C:

- **A · Todos mis puntos:** manda cada punto y su grupo.
- **C · Sumas y cantidad:** manda por grupo la suma de coordenadas y cuántos puntos hay.

Elijan la opción indicada y luego envíen. Así la clase verá en el proyector cómo cambia el volumen de datos entre ambas formas. Expliquen que las sumas y cantidades permiten calcular los mismos promedios que los puntos completos, pero con un mensaje más pequeño. La asignación A/C es para comparar los mensajes en esta simulación; no significa que los estudiantes estén configurando la arquitectura real de Spark.

### 15:00–16:00 · Enviar y mirar el proyector

Todos tocan **Enviar al driver**. En la consola, muestren cuántos mensajes llegaron y el volumen de datos reportado.

> “Los executors procesaron localmente y enviaron resultados parciales. En una aplicación distribuida, el intercambio necesario por la red se llama shuffle; enviar menos datos puede reducir comunicación.”

### 16:00–17:00 · Reducir y cerrar la actividad

Cuando hayan enviado los participantes activos, cambien a **Reduce**. El driver combina los resúmenes y mueve los centroides. Digan:

> “Eso completa una iteración de K-Means: los puntos se asignan a centros y los centros se actualizan con los resultados combinados. La web representa el flujo con fines didácticos; no ejecuta Apache Spark.”

## Si falta participación

- Si alguien no logra conectarse, puede seguir el flujo desde la pantalla; no hace falta reiniciar.
- No reduzcan antes de que los participantes activos hayan enviado, porque las particiones pendientes quedarían fuera.
- Si no hay Wi-Fi utilizable, ejecuten el plan alternativo con tarjetas de coordenadas que describe el informe.
