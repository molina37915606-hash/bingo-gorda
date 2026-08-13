# Arquitectura actual · BINGO DE LA GORDA ALFA

## Principio

Las salas GRATIS y PAGAS usan el mismo motor del servidor. La DEMO individual conserva su motor local estable en esta primera ALFA; se ajustaron sus reglas para coincidir con el juego real, pero todavía no se extrajo a un módulo físico común.

## Acceso

La clave compartida identifica la sala, no al jugador. Cada ingreso crea o recupera una sesión privada con token propio. Los cartones se reservan y validan en servidor para evitar colisiones.

## Partidas pagas

El jugador solicita una cantidad. El administrador puede modificarla y confirmar el pago externo. Solo después se habilita la elección de cartones exactos.

## Partidas gratuitas

No hay precio, WhatsApp ni estado de pago. El jugador entra y elige directamente dentro del máximo permitido.

## Reclamos

El servidor valida siempre la matemática del premio y conserva el orden de recepción. Si el administrador no resuelve un reclamo en 10 segundos, se verifica automáticamente. Línea 2 permanece bloqueada hasta adjudicar Línea 1.

## Persistencia

El estado se guarda actualmente bajo `BINGO_DATA_DIR`. Esta versión no incorpora todavía Supabase. En producción se necesita un volumen persistente.

## Cliente

- `admin.html` + `js/admin-simplificado.js`: administración principal.
- `jugador.html` + `js/online-room-player.js`: jugador real.
- `demo.html` + `js/demo-alfa.js`: DEMO individual conservada y ajustada.
- `transmision.html` + `js/transmision.js`: pantalla TV/transmisión.
- `admin-player-preview.html`: visor read-only de jugador/IA.
