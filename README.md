# BINGO DE LA GORDA

Aplicación web para partidas de bingo de 75 y 90 bolas con administración, jugadores, comunidad pública, modo espectador, minijuegos y actas auditables.

## Accesos principales

- Administración principal: `http://localhost:3210/admin-principal`
- Administración de partida: `http://localhost:3210/admin`
- Jugadores: `http://localhost:3210/jugador`
- Comunidad: `http://localhost:3210/comunidad`
- Demostración: `http://localhost:3210/demo`

## Funcionamiento actual

- Salas de prueba y salas oficiales.
- Hasta 60 jugadores, 4 cartones por jugador y 250 cartones activos.
- Bingo de 75 y 90 bolas con premios configurables según modalidad.
- Reclamos auditados por hora, milisegundos y secuencia de recepción.
- Vero como única presentadora, con voz femenina y guion compartido entre jugador y transmisión.
- Chat de partida con emojis y 12 stickers.
- Comunidad con nombre fijo por dispositivo, chat público, stickers, filtros, bloqueo de teléfonos/WhatsApp y reportes revisados por el operador.
- Minijuegos Rojo o Negro y Mayor o Menor.
- Demos contra IA con Zoe, Mateo y Owen; la prueba masiva del administrador usa nombres genéricos.
- Reanudación automática 5 segundos después de confirmar un premio, con opción del administrador para mantener la pausa.
- Cada partida crea automáticamente su modo espectador público.
- Modo espectador con pantalla completa, efectos, voz de Vero que canta las bolillas y carrera dinámica de cartones.
- Link corto de espectador personalizable por el administrador.
- Integración Chromecast preparada mediante `CAST_APP_ID`.
- Actas PDF/CSV, copias de seguridad y recuperación.

## Ejecutar localmente

```bash
npm start
```

## Pruebas

```bash
npm test
```

La batería incluye pruebas funcionales, regresiones, comunidad, stickers, simulación, estrés y una auditoría estructural de archivos/referencias.

Para producción, configurá `BINGO_DATA_DIR` sobre almacenamiento persistente y las variables de `.env.example` en el servicio de hosting.
