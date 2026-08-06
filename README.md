# BINGO GORDA 2026.3

Aplicación web de bingo de 75 y 90 bolas con servidor Node.js, acceso de jugadores, transmisión, chat público, actas auditables y demostración jugable.

## Demostración para jugadores

Abrí `/demo` y elegí:

- Bingo de 75 o 90 bolas.
- Dos o tres rivales IA.
- Entre uno y cuatro cartones propios.
- Intervalo de 2, 4, 6 u 8 segundos.

El servidor crea cartones aleatorios y diferentes para todos. Zoe, Mateo y Owen reciben dos cartones cada uno. El visitante entra directamente como jugador, con automarcado obligatorio, y debe reclamar manualmente antes que las IA.

Los reclamos de la demostración se validan automáticamente. La partida se reanuda sin panel administrativo y termina con el mismo registro temporal y secuencial usado por el sistema real.

## Funciones principales

- Bolillero criptográfico controlado por el servidor.
- Cartones de 75 y 90 bolas con validación y diversidad.
- Hasta 60 jugadores, 4 cartones por jugador y 250 cartones activos.
- Automarcado obligatorio con más de 10 jugadores o más de 40 cartones.
- Chat público con moderación.
- Reclamos auditados con milisegundos y secuencia de recepción.
- Actas PDF y CSV.
- Copias de seguridad y recuperación.

## Ejecutar localmente

```bash
npm start
```

Luego abrí:

- Panel principal: `http://localhost:3210/admin-principal`
- Jugadores: `http://localhost:3210/jugador`
- Demostración: `http://localhost:3210/demo`

## Pruebas

```bash
npm test
```

Para producción, configurá almacenamiento persistente mediante `BINGO_DATA_DIR`.
