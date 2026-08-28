# HOTFIX 07 · SALA LIMPIA, MINIJUEGOS Y MÓVIL

Versión: `9.3.19-hotfix07.1`  
Fecha: 2026-08-28

## Sala de espera

- Los seis minijuegos ya no ocupan un bloque permanente.
- La espera muestra una tarjeta compacta **¿ABURRIDO MIENTRAS ESPERÁS?**.
- **JUGAR MINIJUEGOS** abre una capa grande sobre la misma sala: no cambia la URL, no abandona la mesa y no desconecta al jugador.
- Al cambiar el estado de `waiting` a inicio/juego, la capa se cierra automáticamente.
- Disponible en Tradicional, Campeonato, Flash y Antibingo, incluidas partidas Solitario.

## Minijuegos

- Rojo o Negro y Mayor o Menor conservan su mecánica con presentación grande.
- **21 de La Gorda**: corregido el enlace de controles `data-mini-21`; manos y totales visibles; La Gorda pide con 16 o menos y se planta con 17 o más; turno progresivo, empate, 21, bust y siguiente mano.
- **La Bolilla Fantasma**: secuencia mostrada como bolillas, sin desbordes de carta.
- **El Número Secreto**: interfaz de rango + intento + pista; al acertar muestra el número encontrado por separado y no `X–X`.
- **La Bolilla Intrusa**: bolillas grandes y respuestas táctiles.
- El ranking de la sala se mantiene por los seis tipos.

## Juego móvil

- En pantallas de juego compactas, el selector flotante de idioma se oculta y **MÁS** ofrece Español, Português e English.
- Pantalla completa también queda dentro de **MÁS**, manteniendo seis accesos en la barra.
- Bingo 75 reduce alturas/paddings del cartón y de la bolilla actual, conservando números de 20–25 px.
- Los cambios 75 aplican a Tradicional, Campeonato, Flash, Antibingo y Solitario; 90 conserva su diseño específico.

## Retiro de Demo

- Eliminados `demo.html`, `/demo`, `/demo/start`, `/api/demo/create` y endpoints públicos `/api/player/demo/*`.
- Eliminados assets exclusivos visibles de Demo.
- **JUGAR SOLO** en Comunidad sigue siendo la experiencia de prueba, con Mateo, Zoe y Owen obligatorios.
- Se mantienen únicamente helpers internos heredados que todavía participan en automatización virtual/limpieza de workspaces; no existe ruta pública para crear una Demo.

## Aplicación de actualización

El ZIP `SOLO_ACTUALIZACION` debe extraerse sobre HOTFIX 06. Además debe ejecutarse `node APLICAR_HOTFIX_07.js` una vez para retirar archivos obsoletos del Demo que un ZIP de reemplazo no puede borrar por sí solo.
