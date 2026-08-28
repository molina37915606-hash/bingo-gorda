# HOTFIX 08 · ANTIBINGO · DESEMPATE POR RESISTENCIA

Versión: `9.3.20-hotfix08.1`  
Fecha: 2026-08-28

## Cambio principal

Antibingo ya no termina con ganadores empatados cuando los últimos cartones completan Bingo en la misma extracción.

La partida usa el historial real de los cartones empatados y define un único ganador por **resistencia**:

1. Segunda línea completada más tarde.
2. Si sigue igual, primera línea completada más tarde.
3. Si sigue igual, se compara la cronología de marcas desde el final: penúltima marca, antepenúltima, etc. Gana la marca más tardía.
4. Respaldo técnico extremo: si toda la resistencia fuese idéntica, gana el número oficial de cartón más bajo. Esto evita un empate final incluso ante cartones equivalentes.

## Transición visual

Cuando los últimos sobrevivientes caen con la misma bolilla:

- la partida se pausa temporalmente;
- la última bolilla permanece visible;
- los cartones implicados muestran `🤝 EMPATE` en azul;
- no se reproduce la calavera de eliminado sobre esos finalistas;
- aparece `Resolviendo por resistencia…`;
- tras la pausa se muestra un único ganador.

La ventana final informa explícitamente:

- quién ganó;
- qué criterio decidió el desempate;
- la bolilla/hito de cada finalista relevante;
- por qué el ganador resistió más.

El mismo resultado se refleja en jugador, TV y transmisión.

## Compatibilidad

Funciona en Antibingo de 75 y 90 bolas, con uno o varios cartones por jugador y también dentro de Modo Solitario.

## Pruebas

Pruebas específicas superadas:

- `tests/hotfix05-antibingo.js`
- `tests/hotfix08-antibingo-resistance.js`
- `tests/community-solo.js`
- `tests/community-flash.js`
- `tests/community-championship.js`
- `tests/hotfix07-waiting-overlay.js`
- `tests/hotfix07-mobile-game.js`
- `tests/hotfix07-demo-removed.js`
- `tests/final-international-i18n.js`
- `tests/transmission-tv-stability.js`

La suite amplia se ejecutó por bloques. El único fallo conocido continúa siendo `tests/community-championship-v4-tiebreak.js` (`284` vs `274`), preexistente desde HOTFIX 06/07 y no relacionado con este cambio.
