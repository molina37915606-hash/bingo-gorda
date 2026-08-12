# BINGO DE LA GORDA BETA 4.2

BETA 3 cierra el pulido de DEMO en celular: selección de cartones sin zoom, chat táctil con emojis/stickers y herramientas de transparencia SHA-256 dentro de la flecha lateral. La pantalla principal mantiene como prioridad cartón, bolilla y reclamos.
BETA 2 unifica la experiencia de juego entre DEMO y partida real. Cada jugador elige Manual o Automarcado antes de la primera bolilla, puede cambiar durante la partida y siempre debe reclamar los premios manualmente. El sistema ayuda a detectar atraso en Manual, cambia al cartón con premio disponible y refuerza visualmente Línea/Bingo.

Ver `BETA_NOTAS.txt` para el detalle de esta versión.

Aplicación web para partidas de bingo de 75 y 90 bolas con administración, jugadores, comunidad pública, modo espectador, minijuegos y actas auditables.

## Accesos principales

- Administración principal: `http://localhost:3210/admin-principal`
- Administración de partida: `http://localhost:3210/admin`
- Jugadores: `http://localhost:3210/jugador`
- Comunidad: `http://localhost:3210/comunidad`
- Demostración BETA: `http://localhost:3210/demo` — experiencia independiente que corre en el navegador, sin código privado, sin sala compartida y sin administrador.

## Funcionamiento actual

- Salas de prueba y salas oficiales.
- Hasta 60 jugadores, 4 cartones por jugador y 250 cartones activos.
- Bingo de 75 y 90 bolas con premios configurables según modalidad.
- Reclamos auditados por hora, milisegundos y secuencia de recepción.
- Vero como única presentadora, con voz femenina y guion compartido entre jugador y transmisión.
- Chat de partida con emojis y 12 stickers.
- Comunidad con nombre fijo por dispositivo, chat público, stickers, filtros, bloqueo de teléfonos/WhatsApp y reportes revisados por el operador.
- Minijuegos Rojo o Negro y Mayor o Menor.
- DEMO BETA reescrita desde cero: configuración → sala de espera → tutorial → partida local contra IA → final. No usa el login, los estados de espera ni las APIs de las partidas reales.
- Chat IA local con Zoe, Mateo y Owen; selección/recarga de cartones, Automarcado, reclamos, historial y ganadores funcionan dentro de la propia DEMO.
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

La batería incluye una prueba específica del motor DEMO BETA (sin red), además de pruebas funcionales, regresiones, comunidad, stickers, simulación, estrés, contingencia del administrador, recuperación tras reinicio y auditoría estructural.

Para producción, configurá `BINGO_DATA_DIR` sobre almacenamiento persistente y las variables de `.env.example` en el servicio de hosting.