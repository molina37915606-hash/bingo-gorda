# HOTFIX 06 · MODO SOLITARIO + 6 MINIJUEGOS

Versión: `9.3.18-solo-community.1`  
Fecha: 2026-08-28

## Modo Solitario en Comunidad

- Se reemplaza el acceso visible al Demo por **JUGAR SOLO** dentro de Comunidad.
- `/demo` redirige a `/comunidad` para que el producto ya no tenga una entrada Demo separada.
- El configurador de Comunidad se reutiliza para crear una partida solitaria con los motores reales.
- Rivales fijos obligatorios: **Mateo, Zoe y Owen**.
- Los nombres Mateo/Zoe/Owen quedan reservados y no pueden usarse como nombre del jugador humano en Solitario.
- Las partidas solitarias son workspaces efímeros y no consumen lugares de las mesas públicas de Comunidad.
- No se publican en el lobby ni generan link para invitar.
- Modos soportados:
  - Tradicional 75 / 90.
  - Flash 75 / 90.
  - Antibingo 75 / 90.
  - Campeonato 75 / 90, con 3 / 5 / 7 rondas.
- Flash, Antibingo y Campeonato reconocen a las IA como competidores únicamente cuando `communityPlayMode === 'solo'`. En salas públicas se mantiene la exclusión de jugadores virtuales.
- El humano sigue el flujo real de cartones/marcado; las IA usan automatización y cartones propios.

## Sala de espera · 6 minijuegos

La espera del jugador ahora ofrece los seis minijuegos en Tradicional, Campeonato, Flash y Antibingo, tanto en salas de Comunidad como en Solitario:

1. Rojo o Negro (`red_black`)
2. Mayor o Menor (`higher_lower`)
3. 21 de La Gorda (`gorda_21`)
4. La Bolilla Fantasma (`ghost_ball`)
5. El Número Secreto (`secret_number`)
6. La Bolilla Intrusa (`intruder_ball`)

El servidor mantiene ranking independiente por minijuego durante la espera.

## Archivos principales modificados

- `server.js`
- `comunidad.html`
- `js/community.js`
- `js/player.js`
- `css/platform.css`
- `player.html`
- `package.json`
- `package-lock.json`
- pruebas de regresión relacionadas con Comunidad/minijuegos
- nuevo `tests/community-solo.js`

## Verificación

Pasaron las pruebas específicas de:

- Modo Solitario Tradicional 90.
- Modo Solitario Flash 75 con Mateo/Zoe/Owen en leaderboard.
- Modo Solitario Antibingo 90 con IA como cartones competitivos.
- Modo Solitario Campeonato 75 con 3 rondas y posiciones para los cuatro jugadores.
- Los seis minijuegos y sus seis rankings de sala de espera.
- Salas públicas, Flash, Antibingo y Campeonato existentes.
- Agenda Comunidad, lobby, voz, transmisión, Evento y pruebas internacionales ejecutadas durante la regresión.

### Prueba preexistente conocida

`tests/community-championship-v4-tiebreak.js` falla en la comparación de puntaje acumulado. Se repitió la misma prueba sustituyendo temporalmente `server.js` por el archivo original previo a este hotfix y falla de la misma forma, por lo que no fue provocada por Modo Solitario y no se alteraron reglas de Campeonato para ocultar ese problema.

El comando global `npm test` además supera el límite de ejecución del entorno por la duración total de la suite; las pruebas restantes se ejecutaron por bloques.
