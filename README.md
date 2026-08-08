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
- Reconexión reforzada de jugadores y recuperación del estado tras cortes.
- Contingencia del administrador: tras 60 segundos sin conexión, el servidor verifica reclamos automáticamente y mantiene el sorteo automático si correspondía.
- Sello SHA-256 público del bolillero, con revelación y comprobación del orden al finalizar.
- Wake Lock en jugador y modo espectador para mantener la pantalla activa cuando el navegador lo soporta.
- Selector de cartones optimizado para números más grandes y mejor lectura en pantallas pequeñas.
- Tutorial contextual con memoria de paso, adaptación táctil/PC/TV y acceso permanente desde ?.
- Indicador independiente de calidad de conexión y modo concentración durante el sorteo.
- Reclamos con feedback inmediato, bloqueo de doble toque y barra flotante cuando hay un premio listo.
- Automarcado rápido con aviso de cuántos números atrasados recuperó.
- Demo reiniciable desde la sala para repetir el recorrido completo.
- Acceso por QR desde la sala de administración.
- Recuperación del sorteo automático después de reiniciar el servidor.
- Cada partida crea automáticamente su modo espectador público.
- Modo espectador con pantalla completa, efectos, voz de Vero que canta las bolillas y carrera dinámica de cartones.
- Cierre oficial tras Bingo: extracción progresiva de bolillas restantes, habilitación del acta al completar y carrusel final de cartones ganadores en loop.
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

La batería incluye pruebas funcionales, regresiones, comunidad, stickers, simulación, estrés, contingencia del administrador, recuperación tras reinicio y una auditoría estructural de archivos/referencias.

Para producción, configurá `BINGO_DATA_DIR` sobre almacenamiento persistente y las variables de `.env.example` en el servicio de hosting.
