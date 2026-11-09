# Grupo 8 · Apache Spark y MLlib

La exposición dura 20 minutos:

| Minutos | Parte |
|---|---|
| 0–5 | Práctica presencial con tarjetas ([guion 1](guiones/01-practica-presencial.md)) |
| 5–6 | Carga y presentación de resultados |
| 6–7 | Explicación de la práctica |
| 7–10 | Cuatro diapositivas teóricas ([guion 2](guiones/02-exposicion-teorica.md)) |
| 10–17 | Actividad web de K-Means ([guion 3](guiones/03-actividad-web.md)) |
| 17–20 | Interpretación final y cierre |

## Ejecutar la presentación unificada

Desde PowerShell, entren a la carpeta `Actividad-BaseDeDatos` y arranquen el servidor:

```powershell
cd "D:\Leon\ITS Villada\Base de datos\bd2\presntacion\Actividad-BaseDeDatos"
npm start
```

La terminal imprime tres direcciones. Abran **Presentación** en la computadora conectada al proyector; esa URL ya incluye la clave para la actividad web.

### Orden de la exposición (20 minutos)

1. **0–5 · Práctica presencial:** siete personas clasifican 200 fichas en un montón compartido; después, cuatro mesas clasifican las mismas fichas en lotes de 50.
2. **5–6 · Resultados:** pulsen **Cargar resultados** en la presentación. En la pestaña aparte, ingresen solo segundos y fichas mal clasificadas: una ronda tradicional y cada una de las cuatro mesas. La presentación calcula el tiempo de la última mesa y suma sus errores.
3. **6–7 · Interpretación:** expliquen el montón compartido y las esperas del método tradicional frente a las cuatro particiones procesadas en paralelo. Aclaren que es una analogía de aula, no una medición de Spark.
4. **7–10 · Teoría:** avancen por las cuatro láminas integradas: arquitectura; particiones, DAG y evaluación perezosa; MLlib/K-Means; usos y comparación con una base relacional.
5. **10–17 · Actividad web:** en la última diapositiva, la consola del proyector representa el driver. La audiencia escanea el QR, ingresa su nombre, asigna un punto al centroide más cercano y envía el formato que le corresponda (A o C). Cuando todos enviaron, pulsen **Reducir**.
6. **17–20 · Cierre:** expliquen qué se observó en K-Means, dónde conviene Spark y cómo se complementa con una base relacional.

Avancen con **← / →**, **espacio** o los botones inferiores. Usen **F** o el botón de pantalla completa para proyectar. La carga de datos queda en otra pestaña y no forma parte de lo que se proyecta.

Los celulares y la computadora deben poder comunicarse por la red del aula. Ensáyenlo antes con un celular, no solamente desde la computadora del grupo.

## Organización de los materiales

- [informe/](informe/) contiene el informe en LaTeX, el PDF de referencia y la clase IEEE.
- [presentacion-web/](presentacion-web/) contiene la presentación unificada `/presentacion`, las pantallas del proyector y participantes, las láminas teóricas y la carga privada de resultados. El servidor y sus dependencias siguen en la raíz.
- [guiones/](guiones/) contiene tres guiones separados y la propuesta breve para aprobación.

El PDF incluido está actualizado con los datos del grupo y se generó desde [informe/informe.tex](informe/informe.tex). Si modifican la fuente antes de entregar, vuelvan a compilar el PDF desde la carpeta `informe` con LaTeX (dos pasadas de `pdflatex`) o con Tectonic.

La primera ronda usa siete personas con las 200 fichas en un montón compartido; la segunda usa cuatro mesas de cinco personas con las mismas fichas, 50 por mesa. La pantalla compara tiempos y fichas mal clasificadas, pero advierte que no es un benchmark controlado ni una medición de Apache Spark. La actividad web es otra experiencia breve: una simulación didáctica del flujo de K-Means; los teléfonos no ejecutan Spark real. En esta ronda, la mitad izquierda de la clase elige enviar los puntos completos y la derecha un resumen.
