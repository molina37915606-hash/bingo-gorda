# Arquitectura 2.1

La aplicación mantiene una sola base de código, pero separa la información por espacios de trabajo.

## Roles

- **Propietario:** administra la plataforma y su propio bingo.
- **Operador temporal:** administra solo las partidas creadas con su enlace.
- **Jugador:** elige cartones y envía reclamos.
- **Transmisión:** lectura pública limitada mediante token.

## Persistencia

- `data/plataforma-2.1.json`: operadores y vencimientos.
- `data/sala-online.json`: sala del propietario.
- `data/operadores/<workspace>/`: salas y resultados de cada operador.

La carpeta `data` está excluida de GitHub. En producción debe respaldarse o reemplazarse por almacenamiento persistente.

## Flujo de publicación

1. Probar en una rama de desarrollo.
2. Ejecutar `npm test`.
3. Revisar que `.env` y `data` no estén incluidos.
4. Fusionar a `main`.
5. Crear la etiqueta `v2.1.0`.
6. Publicar en Render.
