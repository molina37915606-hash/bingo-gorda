# BINGO GORDA 2026.4

Aplicación web de bingo de 75 y 90 bolas con servidor Node.js, acceso de jugadores, transmisión, chat público, actas auditables y demostración jugable.

## Pantalla del jugador 2026.4

La interfaz móvil muestra un cartón grande por vez y permite cambiar entre los cartones mediante pestañas o un gesto lateral. Mantiene la paleta original del juego, moderniza el encabezado BINGO y usa a La Gorda en la casilla central LIBRE de los cartones de 75 bolas.

La barra superior incluye accesos compactos a:

- Ajustes esenciales.
- Tema día/noche.
- Guía rápida.
- Pantalla completa.

La pantalla completa abarca toda la aplicación y no oculta el chat, los ajustes ni los paneles. El chat incluye un menú cerrado de ocho emojis: 😀 😂 😭 👏 ❤️ 🍀 🎱 🎉.

Una pestaña lateral permite consultar ganadores confirmados y números salidos. Los números se presentan ordenados de menor a mayor; en 75 bolas se agrupan por B, I, N, G y O. Al terminar la partida, el acta PDF puede verse dentro del juego y también descargarse.

## Demostración para jugadores

Abrí `/demo` y elegí:

- Bingo de 75 o 90 bolas.
- Dos o tres rivales IA.
- Entre uno y cuatro cartones propios.
- Intervalo de 2, 4, 6 u 8 segundos.

El servidor crea cartones aleatorios y diferentes para todos. Zoe, Mateo y Owen reciben dos cartones cada uno. El visitante entra directamente como jugador, con automarcado obligatorio, y debe reclamar manualmente antes que las IA.

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
