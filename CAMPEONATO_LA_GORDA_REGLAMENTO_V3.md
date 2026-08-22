# CAMPEONATO LA GORDA

## Reglamento competitivo v3 · implementación pública V9

CAMPEONATO LA GORDA es un modo público de Comunidad disputado en 3, 5 o 7 rondas. No pertenece a Modo Evento.

### 1. Inscripción y posiciones competitivas

Cada jugador puede participar con entre 1 y 4 posiciones de cartón, hasta el máximo configurado por quien crea la sala. Los jugadores no tienen que participar con la misma cantidad.

Cada posición compite de forma independiente durante todo el Campeonato. Si Pedro participa con cuatro cartones, sus posiciones son Pedro C1, Pedro C2, Pedro C3 y Pedro C4. Sus puntos nunca se suman entre sí para crear una puntuación personal.

Al comenzar la Ronda 1 se cierra el ingreso de nuevos competidores y queda fijada la cantidad de posiciones de cada jugador.

### 2. Matrices nuevas al azar en cada ronda

Los jugadores no eligen matrices en Campeonato.

Al preparar cada ronda, el servidor genera y asigna aleatoriamente una matriz nueva a cada posición competitiva. C1/C2/C3/C4 conservan su identidad y sus puntos acumulados, pero reciben un cartón nuevo en cada ronda.

Actualizar la página, cerrar el navegador o reconectarse durante una misma ronda no cambia el cartón. La matriz cambia únicamente cuando comienza oficialmente la ronda siguiente.

### 3. Rondas

El Campeonato puede configurarse en 3, 5 o 7 rondas. Todas valen x1; la última no tiene multiplicador.

Cada ronda reinicia bolillero, secuencia de bolillas, puntos de ronda y logros de ronda. Los puntos acumulados, la posición competitiva y el historial permanecen.

### 4. Autoridad del servidor

El servidor determina matemáticamente, con la secuencia oficial de bolillas y la matriz asignada:

- números acertados;
- Primera Línea;
- Segunda Línea;
- Bingo;
- bolilla ordinal exacta en que se logra cada premio;
- puntos correspondientes;
- inicio del reloj del bonus de reacción.

El marcado manual o automático no cambia el momento matemático de un logro ni sus puntos principales.

### 5. Cierre de ronda: primer Bingo + 5

Cuando aparece el primer Bingo matemático, el servidor fija el cierre exactamente cinco extracciones después.

Ejemplo: primer Bingo en la extracción 64 -> la ronda termina después de la extracción 69.

Los Bingos posteriores no reinician la cuenta. Nunca se exceden las 90 bolillas en Bingo 90 ni las 75 en Bingo 75.

Durante esas cinco extracciones finales todos los cartones siguen sumando números, Líneas, Segundas Líneas y Bingo.

### 6. Puntos por números

Cada número del cartón extraído antes del cierre de la ronda vale +1 punto.

- Bingo 90: máximo 15 puntos por números.
- Bingo 75 con centro libre: máximo 24 puntos por números.

### 7. Bingo 90

#### Primera Línea

| Extracción | Puntos |
|---|---:|
| 1–35 | 10 |
| 36–40 | 9 |
| 41–45 | 8 |
| 46–50 | 7 |
| 51–55 | 6 |
| 56–60 | 5 |
| 61–65 | 4 |
| 66–70 | 3 |
| 71–75 | 2 |
| 76–90 | 1 |

#### Segunda Línea

| Extracción | Puntos |
|---|---:|
| 1–50 | 15 |
| 51–55 | 14 |
| 56–60 | 12 |
| 61–65 | 10 |
| 66–70 | 8 |
| 71–75 | 6 |
| 76–80 | 4 |
| 81–85 | 2 |
| 86–90 | 1 |

#### Bingo

| Extracción | Puntos |
|---|---:|
| 1–55 | 25 |
| 56–60 | 23 |
| 61–65 | 20 |
| 66–70 | 17 |
| 71–75 | 14 |
| 76–80 | 11 |
| 81–85 | 8 |
| 86–90 | 5 |

### 8. Bingo 75

Las líneas válidas son filas, columnas y diagonales. El centro LIBRE se considera cubierto.

#### Primera Línea

| Extracción | Puntos |
|---|---:|
| 1–20 | 10 |
| 21–25 | 9 |
| 26–30 | 8 |
| 31–35 | 7 |
| 36–40 | 6 |
| 41–45 | 5 |
| 46–50 | 4 |
| 51–55 | 3 |
| 56–60 | 2 |
| 61–75 | 1 |

#### Segunda Línea

| Extracción | Puntos |
|---|---:|
| 1–30 | 15 |
| 31–35 | 14 |
| 36–40 | 12 |
| 41–45 | 10 |
| 46–50 | 8 |
| 51–55 | 6 |
| 56–60 | 4 |
| 61–65 | 2 |
| 66–75 | 1 |

#### Bingo / Blackout

| Extracción | Puntos |
|---|---:|
| 1–58 | 25 |
| 59–61 | 23 |
| 62–64 | 20 |
| 65–67 | 17 |
| 68–70 | 14 |
| 71–72 | 11 |
| 73–74 | 8 |
| 75 | 5 |

### 9. Bonus de reacción

Si el Campeonato fue creado con bonus manual de reacción, el Bingo puede sumar:

| Tiempo desde el Bingo matemático hasta que el servidor recibe RECLAMAR | Bonus |
|---|---:|
| Hasta 5 segundos | +3 |
| Más de 5 y hasta 10 segundos | +2 |
| Más de 10 y hasta 20 segundos | +1 |
| Más de 20 segundos o sin reclamo | 0 |

No existen puntos negativos por tardanza. Una sola acción de RECLAMAR registra todos los cartones de ese jugador que ya tengan Bingo matemático y aún no hayan sido reclamados.

Si el Campeonato se configura sin bonus de reacción, todos los puntos se calculan automáticamente y el reclamo no altera la puntuación.

### 10. Ventana final

Después de la última extracción de la ronda se mantiene una ventana de 20 segundos para registrar reclamos de reacción. No salen más bolillas y no cambian los puntos matemáticos.

### 11. Desconexiones

Una posición inscripta sigue participando matemáticamente aunque su dispositivo se desconecte. Al volver durante la misma ronda recupera exactamente su matriz y su estado. Si no logra reclamar, pierde únicamente el posible bonus de reacción.

### 12. Clasificación

La clasificación oficial es por posición de cartón: Jugador + C1/C2/C3/C4.

Después de cada ronda se muestran el resultado de esa ronda y la clasificación acumulada. La siguiente ronda sólo comienza cuando quien creó la sala la inicia.

### 13. Desempate final

A igualdad de puntos totales se compara, en este orden:

1. mayor cantidad de Bingos;
2. mayor suma de puntos de Bingo;
3. mayor cantidad de Segundas Líneas;
4. mayor suma de puntos de Segunda Línea;
5. mayor cantidad de Primeras Líneas;
6. mayor suma de puntos de Primera Línea;
7. mayor cantidad total de números acertados;
8. mejor Bingo individual, por menor cantidad de extracciones.

Si todo continúa exactamente igual existe empate oficial. La reacción no se usa como criterio adicional de desempate, aunque sus puntos ya formen parte del total si la modalidad la habilitó.

### 14. Final

La última ronda vale x1. Al cerrar la ronda 3, 5 o 7, el servidor aplica los criterios de clasificación y declara campeón al C1/C2/C3/C4 ubicado en el primer puesto. Si todas las reglas de desempate continúan iguales, puede haber campeones empatados.

### 15. Integridad

Toda decisión competitiva se realiza en el servidor. El navegador no decide matrices, bolillas, logros ni puntos. Las matrices de cada ronda, secuencia de bolillas, hitos y clasificación deben quedar persistidos para recuperación y acta.


---

## Aclaración V9.0.2 — Cantes de Campeonato

En modalidad manual, **cada cartón competitivo puede cantar su propia Primera Línea, Segunda Línea y Bingo** cuando la jugada exista matemáticamente.

Un canto no adjudica ni cierra la categoría para los demás cartones. Que un cartón haya cantado Primera Línea no impide que todos los demás cartones canten su propia Primera Línea posteriormente. Lo mismo se aplica a Segunda Línea y Bingo.

Los cantes de Línea y Segunda Línea no detienen el bolillero ni requieren verificación del administrador: el servidor conoce la matriz y la secuencia oficial, valida la jugada inmediatamente y registra el canto. La puntuación matemática ya obtenida por el cartón se conserva independientemente del momento del canto.

El Bingo también es individual por cartón. En Campeonato manual, el canto de Bingo puede añadir únicamente el bonus de reacción reglamentario. Si un mismo jugador tiene más de un cartón con Bingo habilitado al mismo tiempo, un único toque puede registrar esos Bingos simultáneos para no generar una desventaja artificial por tener que realizar varias pulsaciones.


---

## Aclaración V9.0.3 — Duración dinámica

Para Comunidad pública, los formatos oficiales disponibles son:

- **3 rondas · Sprint:** más rápido y más impredecible.
- **5 rondas · Recomendado:** equilibrio principal del modo.
- **7 rondas · Extendido:** mayor peso de la regularidad sin convertir la sala en una sesión demasiado larga.

Todas las rondas continúan valiendo x1. No existe multiplicador especial en la final.
