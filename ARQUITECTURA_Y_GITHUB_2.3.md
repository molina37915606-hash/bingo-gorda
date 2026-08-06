# Arquitectura y actualización — versión 2.3

La aplicación usa un único servicio Node.js con cuatro vistas separadas:

- `/admin-principal`: ingreso del propietario con la clave configurada en Render.
- `/admin`: creación y control de salas.
- `/jugador`: ingreso con código privado, nombre y selección de cartones.
- `/transmision/<token>`: pantalla vertical de solo lectura para TikTok.

Los administradores temporales permanecen deshabilitados.

## Actualizar GitHub

1. Guardar una copia de la versión anterior.
2. Descomprimir `BINGO DE LA GORDA 2.3.zip`.
3. Copiar el contenido dentro de la carpeta local del repositorio.
4. Reemplazar los archivos anteriores conservando la estructura de carpetas.
5. Ejecutar `npm test`.
6. Confirmar los cambios y hacer push.

Etiqueta recomendada: `v2.3.0`.

No subir `.env`, claves reales, datos de salas ni resultados privados.
