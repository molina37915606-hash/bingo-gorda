# El Bingo de la Gorda

Software gratuito para crear y administrar partidas recreativas de Bingo.

## Qué incluye

- Comunidad gratuita con creación de salas públicas y privadas.
- Bingo 75 y Bingo 90.
- Generación y asignación de cartones.
- Bolillero y control del sorteo.
- Reclamo tradicional o validación automática con empates, configurable antes de iniciar.
- Transmisión y vista TV.
- Publicidad visual opcional en la pantalla del jugador.
- Recuperación de acceso de jugadores.
- Historial, actas y auditoría de partidas.
- Demo para probar el funcionamiento sin crear una partida real.

## Modelo de uso

La plataforma no procesa apuestas, cobros, depósitos, transferencias ni pagos a ganadores. Comunidad funciona exclusivamente como un espacio gratuito para organizar partidas entre usuarios.

Las jugadas configurables (por ejemplo Línea y Bingo) son condiciones de juego y no representan importes monetarios dentro del software.

## Inicio rápido

```bash
npm install
npm start
```

Por defecto el servidor usa el puerto definido en `PORT` o `3000`.

## Pruebas

```bash
npm test
```

La batería cubre acceso, salas, Comunidad, Demo, Bingo 75/90, reinicios, historial, transmisión, publicidad, multisala, reclamo automático y empates.

## Datos y migración

Al iniciar una versión V6 sobre datos de versiones anteriores, el servidor elimina del estado activo los campos financieros antiguos. Antes de migrar crea una copia de respaldo con sufijo `.pre-free-v6.bak` cuando corresponde.

Las menciones a campos antiguos de pago que puedan permanecer dentro del migrador existen únicamente para reconocer y retirar datos heredados; no forman parte del funcionamiento actual.

## Despliegue

El proyecto puede ejecutarse como una aplicación Node.js. Para Render, mantener el comando de inicio:

```bash
npm start
```

## Alcance

El objetivo del proyecto es ofrecer herramientas de software para partidas recreativas: crear salas, generar cartones, realizar sorteos, validar jugadas, transmitir resultados y conservar actas.

Funciones comerciales futuras como branding de eventos o espacios para sponsors deben mantenerse separadas de la participación en las partidas y del motor de juego.
