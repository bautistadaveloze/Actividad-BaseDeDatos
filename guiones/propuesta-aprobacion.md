# Propuesta de experiencia práctica · Grupo 8

**Institución:** ITS Villada · **Materia:** Base de Datos II  
**Tecnología:** Apache Spark / MLlib  
**Integrantes:** Leon Guchea, Bautista Daveloze, Riccioni Santiago, Sibona Luciano y Macias Luciano

### 1. Objetivo
Que la audiencia experimente una iteración distribuida de K-Means: recibir una partición de datos, asignar los puntos al centro más cercano, preparar un resumen y observar cómo el driver combina los resultados para actualizar los centroides. La clasificación con tarjetas será una apertura comparativa; la experiencia web será la práctica central de la propuesta.

### 2. Concepto que demuestra
La simulación hace visibles particiones, procesamiento local en executors, agregación parcial y reduce. Cada participante asigna manualmente un punto al centroide que considera más cercano; la aplicación procesa el resto de su partición. La mitad de la clase enviará todos sus puntos y la otra mitad enviará sumas y cantidades, para observar que el resumen transmite menos datos y permite calcular los mismos centroides. La página representa el flujo con fines didácticos y no ejecuta Apache Spark real.

### 3. Materiales
200 fichas numeradas, dos recipientes para pares/impares, cuatro lotes de 50 fichas, cronómetros, proyector, computadora con la presentación web, red local y celulares de los participantes.

### 4. Secuencia de pasos
**0–5 min:** una mesa de siete personas clasifica las 200 fichas sobre un montón compartido; luego cuatro mesas de cinco personas reciben 50 fichas cada una y trabajan en paralelo. Se anotan duración y fichas mal clasificadas. **5–6 min:** los expositores cargan solo segundos y errores en una pestaña aparte; la presentación muestra los resultados. **6–7 min:** se explica la diferencia entre el lote compartido, las esperas y las particiones en paralelo. **7–10 min:** se presentan arquitectura, ejecución, MLlib y la relación con bases relacionales. **10–17 min:** la audiencia participa en la simulación web de K-Means y compara el envío completo con el resumen antes del reduce. **17–20 min:** el grupo interpreta la experiencia, comenta casos de uso y cierra.

### 5. Rol de la audiencia
En las fichas, siete compañeros trabajan con el montón completo y otros veinte se dividen en cuatro mesas, con 50 fichas por mesa. En la actividad principal, cada participante opera un celular como executor simulado, procesa su partición y envía el formato indicado para su mitad del aula. Un expositor conduce el driver; los otros cuatro facilitan y registran las mesas.

### 6. Plan alternativo
Si falla la red, las mesas reciben puntos y centroides impresos, asignan puntos al centro más cercano, calculan sumas y cantidades por grupo y entregan sus resultados al expositor que representa el driver. Se combinan los resúmenes en la pizarra para actualizar los centroides.
