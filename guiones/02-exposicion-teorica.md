# Guion 2 · Exposición teórica y cierre

**Duración:** 5 minutos (minutos 5–10 de la exposición; incluye resultados y teoría)  
**Meta:** enlazar los resultados de las tarjetas con la arquitectura de Spark, su ejecución y MLlib.

Todo se pasa desde `/presentacion`; no cambien a otra diapositiva web.

## 5:00–6:00 · Mostrar los resultados

Pulsen **Cargar resultados**: se abre otra pestaña. Ingresen la duración de la ronda tradicional, sus fichas mal clasificadas y, para cada mesa distribuida, segundos y errores. Vuelvan a la presentación y avancen a la diapositiva 2. Los cambios aparecen automáticamente. No proyecten la pestaña con los campos de carga.

Comenten qué ronda terminó antes y cuántas fichas quedaron mal clasificadas. Si algún resultado sorprende, muéstrenlo tal como ocurrió; no alteren los datos.

## 6:00–7:00 · Interpretar la actividad

En la diapositiva 3 expliquen:

> “Los lotes representan particiones. Cada mesa procesó sus 50 fichas al mismo tiempo y después reunimos los resultados. En Spark, el driver coordina tareas que los executors ejecutan sobre las particiones.”

Aclaren que es una analogía, no una prueba de velocidad de Spark: son personas y hay coordinación manual.

## 7:00–7:50 · Diapositiva 4: arquitectura

Muestren **Driver → tareas → Executors en Workers → resultados al Driver**.

- **Clúster:** conjunto de máquinas que trabaja como sistema.
- **Driver:** ejecuta el programa principal, planifica y reúne resultados.
- **Worker:** máquina que aporta recursos de cómputo.
- **Executor:** proceso de un worker que ejecuta tareas y puede mantener datos en memoria.

Una máquina puede alojar más de un executor. El driver coordina; los executors procesan. En la web, el proyector y los celulares solo representan esos roles.

## 7:50–8:40 · Diapositiva 5: ejecución y DAG

> “Una transformación, como `filter`, describe el trabajo pero no lo ejecuta de inmediato. Una acción, como `count`, dispara el cálculo. Spark arma un DAG para planificar los pasos.”

Mencionen brevemente que `cache()` permite reutilizar datos en memoria y que el linaje permite recalcular una partición perdida. No digan que Spark replica automáticamente cada dato.

## 8:40–9:25 · Diapositiva 6: MLlib y K-Means

> “MLlib es la biblioteca de aprendizaje automático de Spark. Vamos a usar K-Means, que agrupa puntos: cada punto se asigna al centro más cercano y luego cada centro se mueve al promedio de los puntos que recibió. El algoritmo repite esos pasos.”

El ejemplo web usa puntos bidimensionales y tres centros para que se vean la asignación y el movimiento.

## 9:25–10:00 · Diapositiva 7 y transición

Expliquen en una frase la diferencia con el modelo relacional:

> “Una base relacional es adecuada para registrar operaciones y transacciones; Spark sirve para analizar grandes conjuntos y entrenar modelos. Pueden complementarse: la base registra ventas y Spark las analiza.”

Al minuto 10, avancen a la última diapositiva. La consola del driver y el QR ya están integrados; sigan el [guion de la actividad web](./03-actividad-web.md).

## Después de la actividad web · 17:00–20:00

### 17:00–19:00 · Casos de uso y modelo relacional

> “Spark es útil para transformar millones de registros, calcular agregados o entrenar modelos sobre datos distribuidos. No suele reemplazar una base relacional que registra operaciones pequeñas y transacciones, como actualizar el saldo de una cuenta. Es habitual que la base guarde las operaciones y Spark las analice después.”

### 19:00–20:00 · Cierre

> “Con las fichas vimos la diferencia entre trabajar sobre un montón compartido y procesar particiones al mismo tiempo. Con la web, cada executor simulado procesó una partición y el driver combinó los resultados de K-Means. Ambas prácticas conectan la idea de distribuir trabajo con Apache Spark y MLlib.”
