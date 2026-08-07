# Arquitectura actual

La aplicación usa un único servidor Node.js sin dependencias externas obligatorias.

## Pantallas activas

- `admin-principal.html`: acceso principal y moderación de Comunidad.
- `admin.html` + `js/admin-simplificado.js`: creación y operación de partidas.
- `jugador.html` + `js/online-room-player.js`: experiencia del jugador.
- `comunidad.html` + `js/community.js`: portada, chat y minijuegos.
- `transmision.html` + `js/transmision.js`: modo espectador de cada sala.
- `demo.html`: demostración.
- `cast-receiver.html`: receptor web preparado para Google Cast.

## Módulos compartidos

- `js/emoji-stickers.js`: emojis/stickers compartidos.
- `js/cast-sender.js`: integración del emisor Chromecast.
- `js/presenter-scripts.js`: guion compartido y voz de Vero para jugador y transmisión.

## Persistencia

Los datos operativos se guardan bajo `BINGO_DATA_DIR`. La carpeta `data/` del paquete se entrega vacía para no arrastrar partidas ni registros de prueba.

## Regla de transmisión

Toda sala activa tiene modo espectador. `roomSettings.transmission` solo controla presentación (chat, cartones, nombres, progreso y rotación); ya no existe un interruptor para crear o no crear la transmisión.
