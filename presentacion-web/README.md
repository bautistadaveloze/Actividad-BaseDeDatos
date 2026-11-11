# Presentación web

Las pantallas de esta carpeta se sirven desde `public/` por el servidor Node.js del proyecto, que está en la raíz.

- `/fichas`: consola interactiva para registrar tiempos y precisión de las dos rondas presenciales.
- `/teoria`: cuatro láminas visuales sobre arquitectura, ejecución, MLlib/K-Means y comparación relacional.
- `/driver`: proyector para la actividad web de K-Means.
- `/`: pantalla de participación de los celulares.

[ACTIVIDAD.md](ACTIVIDAD.md) es el diseño y el contrato de la actividad web (`/` y `/driver`). Para probarla, `npm test` corre la prueba de punta a punta y `npm run bots -- 25` simula 25 celulares.

Para iniciar la aplicación, desde la raíz ejecuten `npm start`. La terminal imprime las direcciones para el proyector y los participantes; sigan el [README principal](../README.md) y los guiones en `../guiones/`.
