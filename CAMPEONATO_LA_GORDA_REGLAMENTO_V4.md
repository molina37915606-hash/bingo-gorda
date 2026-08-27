# CAMPEONATO LA GORDA

## Reglamento competitivo V4 · revisión V9.2.8

CAMPEONATO LA GORDA es un modo competitivo público de Comunidad. Este reglamento reemplaza por completo las reglas anteriores del modo Campeonato.

## 1. Formatos oficiales

Un Campeonato se disputa exclusivamente en **3, 5 o 7 rondas**:

- **3 rondas · Sprint**
- **5 rondas · Recomendado**
- **7 rondas · Extendido**

Todas las rondas valen x1. No existen formatos oficiales de 10, 20 o 30 rondas ni multiplicadores de final.

Para comenzar se requieren al menos **2 jugadores**.

## 2. Competencia por posición

Cada jugador puede participar con entre 1 y 4 cartones, hasta el máximo configurado para la sala.

Cada cartón es una **posición competitiva independiente** durante todo el Campeonato:

- C1
- C2
- C3
- C4

Los puntos de varias posiciones de una misma persona nunca se suman entre sí. El campeón siempre se identifica como **Jugador + posición**, por ejemplo: `Pedro · C2`.

Al comenzar la Ronda 1 se cierra el ingreso de nuevas posiciones competitivas.

## 3. Cartón nuevo en cada ronda

Los jugadores no eligen matrices en Campeonato.

Al preparar cada ronda normal, el servidor genera al azar un cartón nuevo para cada posición. La identidad C1/C2/C3/C4 y el puntaje acumulado se conservan, pero la matriz cambia en cada nueva ronda.

Recargar, cerrar el navegador o reconectarse dentro de una misma ronda no cambia el cartón asignado a esa ronda.

## 4. Autoridad del servidor

El servidor es la única autoridad competitiva. Determina, usando la matriz oficial y la secuencia oficial de bolillas:

- números acertados;
- Primera Línea;
- 4 Esquinas en Bingo 75;
- Segunda Línea;
- Triple Línea en Bingo 75;
- Bingo;
- primer Bingo de la ronda;
- puntos de cada posición;
- cierre de cada ronda;
- elegibilidad para ser Campeón;
- clasificación;
- desempate final.

El marcado manual o automático es una ayuda visual y no modifica los puntos matemáticos.

## 5. Puntuación oficial

La puntuación base de Campeonato mantiene +1 por cada número real extraído. Las jugadas de Bingo 90 y Bingo 75 se puntúan así:

| Acción | Bingo 90 | Bingo 75 |
|---|---:|---:|
| Cada número real del cartón extraído | +1 | +1 |
| Primera Línea | +10 | +10 |
| Primera posición que logra Primera Línea | +5 adicionales | +5 adicionales |
| 4 Esquinas | — | +15 |
| Primera posición que logra 4 Esquinas | — | +5 adicionales |
| Segunda Línea | +20 | +20 |
| Primera posición que logra Segunda Línea | +5 adicionales | +5 adicionales |
| Triple Línea | — | +30 |
| Primera posición que logra Triple Línea | — | +5 adicionales |
| Bingo | +60 | +60 |
| Primera posición que logra Bingo | +15 adicionales | +15 adicionales |

Los bonus de primero se determinan por la **bolilla matemática del logro**, nunca por quién toca antes el botón de canto. Si dos o más posiciones completan la misma jugada con la misma bolilla, todas reciben el bonus correspondiente.

No existen tablas de puntos variables según la bolilla en que se logra una jugada.

En Bingo 75, el centro **LIBRE** no vale +1 porque no corresponde a una bolilla extraída.

## 6. Primer Bingo y cierre +5

Cuando aparece el primer Bingo matemático de la ronda, el servidor fija el cierre después de **exactamente cinco bolillas adicionales**, sin superar el límite de 75 o 90 bolillas del formato.

Los Bingos posteriores no reinician la cuenta.

Durante esas cinco bolillas finales todas las posiciones continúan sumando números y las jugadas habilitadas. En Bingo 75 esto incluye Primera Línea, 4 Esquinas, Segunda Línea, Triple Línea y Bingo.

Si dos o más posiciones completan su primer Bingo con **la misma bolilla que activa el cierre**, todas reciben el bonus de **+15**. El servidor no elige arbitrariamente una sola por orden interno.

## 7. Cantes

Primera Línea, Segunda Línea y Bingo pueden cantarse manualmente por cada posición cuando la jugada ya existe matemáticamente. En Bingo 75 también pueden cantarse 4 Esquinas y Triple Línea.

El canto:

- es social y visible para la sala;
- se registra en el historial;
- no pausa el bolillero;
- no requiere una decisión manual del administrador;
- no decide quién recibe los bonus de primero;
- no afecta a los demás cartones.

Los puntos y bonus ya están determinados automáticamente por la bolilla en que cada cartón completa matemáticamente la jugada. La velocidad de conexión, el dispositivo o el tiempo de reacción **nunca otorgan puntos ni resuelven posiciones**.

## 8. Elegibilidad para ser Campeón

Para ser **Campeón Oficial de La Gorda**, una posición debe haber conseguido **al menos un Bingo** en alguna ronda normal del Campeonato.

Una posición sin Bingo conserva todos los puntos realmente obtenidos y figura en la clasificación, pero es **NO ELEGIBLE PARA EL TÍTULO**.

Por lo tanto, una posición que no hizo ningún Bingo nunca puede ser Campeona, aunque su puntaje total sea superior al de una posición elegible.

## 9. Clasificación

La clasificación acumulada se ordena así:

1. posiciones elegibles para el título;
2. dentro de cada grupo, mayor puntaje total.

No existen criterios matemáticos ocultos posteriores como cantidad de Bingos, mejor Bingo, cantidad de Líneas, bolilla del logro, tiempo de reacción o identificadores internos.

Si dos posiciones tienen la misma condición de elegibilidad y el mismo puntaje, comparten el mismo rango en la tabla hasta que corresponda resolver el título.

La clasificación de una ronda se ordena únicamente por los puntos obtenidos en esa ronda. Igual puntaje de ronda significa mismo puesto de ronda.

## 10. Desempate final de 10 bolillas

Si al terminar la última ronda dos o más posiciones **elegibles** comparten el mayor puntaje total, el Campeonato no termina empatado: se disputa un desempate visible.

El desempate se juega solamente entre las posiciones empatadas por el primer puesto elegible.

El servidor:

1. genera un cartón nuevo y aleatorio para cada finalista;
2. crea un bolillero nuevo e independiente;
3. utiliza la misma secuencia de bolillas para todos los finalistas;
4. cuenta **1 punto de desempate por cada número real acertado**;
5. no otorga puntos por Línea, Segunda Línea, Bingo o canto.

Después de **10 bolillas exactas** se realiza la primera comparación.

- Si existe un líder único, es Campeón.
- Si varios siguen empatados en el mayor puntaje de desempate, las posiciones con menor puntaje quedan eliminadas y los líderes empatados continúan con **los mismos cartones y el mismo bolillero**.
- Desde la bolilla 11 se juega en **muerte súbita, una bolilla por vez**. El acumulado de las primeras 10 ya no vuelve a compararse.
- En cada bolilla extra se observa únicamente esa bolilla: si todos los finalistas activos la marcan o ninguno la marca, el desempate continúa.
- Si sólo una parte de los finalistas activos marca esa bolilla, continúan únicamente quienes la marcaron. Con dos finalistas, si uno la marca y el otro no, el que la marca es Campeón inmediatamente.
- No se abre una nueva serie de 10 bolillas durante esta muerte súbita.

Los puntos del desempate no se agregan al puntaje normal del Campeonato: sirven únicamente para determinar al Campeón Oficial.

Un Campeonato completado siempre tiene **un único Campeón Oficial**.

## 11. Cambio de ronda

Al finalizar una ronda normal se publican:

- resultado de la ronda;
- puntos de cada posición;
- clasificación acumulada;
- historial de cantes.

La siguiente ronda comienza únicamente cuando quien creó la sala la inicia, salvo futuras modalidades expresamente documentadas.

## 12. Desconexiones y recuperación

Una posición ya inscripta continúa compitiendo matemáticamente aunque su dispositivo se desconecte.

Al reconectarse durante la misma ronda recupera la matriz, bolillas, puntos y estado persistidos por el servidor.

La desconexión no elimina puntos ni genera penalizaciones por no cantar.

## 13. Interrupción de un Campeonato

Si el Campeonato es cancelado antes de comenzar, no existe competencia disputada.

Si el creador lo interrumpe después de iniciado, se conserva el historial disponible de rondas, bolillas, posiciones y clasificación, pero el resultado se identifica como:

**CAMPEONATO INCOMPLETO · SIN CAMPEÓN OFICIAL**

Las rondas ya disputadas no convierten una tabla parcial en resultado final y no se declara Campeón.

## 14. Acta e integridad

Al completar el Campeonato, el servidor conserva el resultado competitivo final, incluyendo:

- participantes y posiciones;
- matrices de las rondas;
- bolillas extraídas;
- puntaje por concepto;
- cantes;
- clasificación;
- elegibilidad;
- desempate final, si existió;
- Campeón Oficial.

El **Sello SHA-256 del resultado competitivo** identifica la representación final almacenada por el servidor. No debe confundirse con el hash binario del archivo PDF descargado.

## 15. Regla de cierre

No forman parte del Campeonato V4:

- formatos de 10, 20 o 30 rondas;
- tablas de puntuación variables por número de extracción;
- bonus de reacción;
- ventana final de 20 segundos;
- criterios ocultos de desempate;
- campeones oficiales empatados.

Ante cualquier contradicción con documentación anterior del modo Campeonato, **prevalece este Reglamento V4**.
