# HOTFIX 09 · Cierre de Campeonato

Versión: `9.3.21-hotfix09.1`  
Fecha: 2026-08-28

## Objetivo

Evitar que las rondas y el Campeonato terminen de golpe al salir la quinta bolilla reglamentaria posterior al primer Bingo matemático.

## Cambios funcionales

- La quinta bolilla extra completa primero su ciclo visual y matemático.
- Después de esa extracción se abre una ventana final de reclamos de Campeonato.
- Durante esa ventana ya no pueden extraerse nuevas bolillas.
- Un Bingo que se completa precisamente en la quinta bolilla extra puede cantarse y queda registrado antes del cierre.
- Producción: la ventana final dura 5 segundos por defecto (`BINGO_CHAMPIONSHIP_FINAL_CLAIM_WINDOW_MS`).
- Finalizada la ventana, recién entonces se calcula el resultado de la ronda o el Campeonato.

## Nueva transición visual del jugador

Al finalizar una ronda, la pantalla del cartón se conserva unos segundos y muestra la mejor posición del jugador:

- `2º · PUESTO EN LA RONDA`, por ejemplo, antes de pasar al resumen.
- Se muestran puntos de la ronda y posición general.

Al finalizar el Campeonato:

- se muestra la posición final sobre el cartón;
- `2º` se presenta como `SUBCAMPEÓN`;
- `3º` como `TERCER PUESTO`;
- el ganador recibe `👑 1º · CAMPEÓN`;
- sólo el campeón recibe corona y confeti/papelitos.

El resumen oficial existente se abre después de esta transición; no se reemplazan actas, clasificación ni auditoría.

## Desempate V4

No se modificó la puntuación oficial. Se actualizó la prueba histórica `community-championship-v4-tiebreak.js`, que todavía equilibraba únicamente Línea, Esquinas, Segunda y Triple Línea. Campeonato 75 ya incluye también bonus de primera Cuádruple y Quinta Línea; la prueba ahora contempla los cinco hitos de línea actuales.

## Archivos principales

- `server.js`
- `js/player.js`
- `css/platform.css`
- `player.html`
- `package.json`
- `package-lock.json`
- `tests/hotfix09-championship-close.js`

También se actualizaron pruebas históricas de Campeonato para contemplar la nueva ventana final.

## Validación

Se verificó específicamente:

- Bingo en la quinta bolilla extra;
- bloqueo de extracción durante la ventana final;
- cierre posterior a los reclamos;
- posición de ronda disponible para la animación;
- overlay de posición;
- corona y confeti del campeón;
- Campeonato 75/90 y desempate V4;
- Solitario, Flash, Antibingo, Comunidad, Evento, TV, móvil e internacionalización mediante la suite existente.
