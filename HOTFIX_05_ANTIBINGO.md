# HOTFIX 05 · ANTIBINGO V1

Fecha: 28 de agosto de 2026

## Objetivo

Agregar ANTIBINGO como modalidad real de Comunidad sin modificar las reglas de Bingo normal, Flash ni Campeonato.

**Regla central:** NO HAGAS BINGO. Cada cartón compite de forma independiente. El último cartón que siga sin completar Bingo gana.

## Reglas V1

- Disponible en Bingo 75 y Bingo 90.
- Cada C1/C2/C3/C4 es un superviviente independiente.
- La eliminación es automática y la decide el servidor según las bolillas oficialmente extraídas.
- No existen reclamos tradicionales ni premios intermedios de Línea/Bingo.
- Al completar matemáticamente Bingo, el cartón queda eliminado inmediatamente.
- Si un jugador conserva otro cartón vivo, continúa participando.
- Cuando queda un único cartón vivo, gana en ese momento.
- Si los últimos cartones vivos completan Bingo con la misma bolilla y no queda ninguno vivo, hay EMPATE ANTIBINGO.
- El estado de eliminados se persiste y no se pierde por reconexión/reinicio.

## Jugador

- Mantiene la interfaz general de la plataforma.
- RIVALES cambia a SOBREVIVIENTES únicamente en Antibingo.
- La lista se muestra por cartón individual y ordena primero a los más comprometidos.
- Cada fila indica cuántos números quedan sin marcar para completar Bingo y quedar eliminado.
- Los eliminados recientes aparecen en rojo/tachados y dejan de mostrarse como recientes después de unos segundos.
- Un cartón propio eliminado conserva su pestaña C1/C2 en rojo, tachada y con calavera hasta el final.
- Al abrir un cartón eliminado queda apagado/desaturado y muestra `☠ ELIMINADO`.
- En la bolilla que elimina un cartón propio se reproduce la animación aprobada: impacto de la última casilla, calavera que sube desde abajo hacia el centro, sello ELIMINADO y transición al estado apagado.

## TV / Transmisión

- Muestra `SOBREVIVIENTES MÁS COMPROMETIDOS`.
- Informa cantidad exacta de cartones vivos.
- Cada cartón destacado indica cuántos números conserva sin marcar.
- Al finalizar muestra ÚLTIMO SOBREVIVIENTE o EMPATE ANTIBINGO.
- La transmisión pública corta `/v/...` y la TV simple reconocen el modo.

## Compatibilidad

No se cambian las reglas ni el funcionamiento de:

- Bingo normal 75/90.
- Flash.
- Campeonato.
- Reclamos tradicionales fuera de Antibingo.
- Marcado, cartones, extracción, voz, chat y transmisión de los modos anteriores.

## Pruebas incluidas

`tests/hotfix05-antibingo.js` cubre:

- Bingo 75 y 90.
- Eliminación automática.
- C1 eliminado con C2 del mismo jugador todavía vivo.
- Último superviviente.
- Empate de los últimos cartones.
- Persistencia tras reinicio.
- Bloqueo de reclamos tradicionales en Antibingo.
- Acta PDF.
- Estado del creador.
- Sobrevivientes, animación, TV simple y transmisión pública.
