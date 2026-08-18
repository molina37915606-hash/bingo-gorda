# EL BINGO DE LA GORDA

Plataforma web de Bingo 75 y Bingo 90 para celular, PC y TV. La interfaz de juego del jugador se mantiene como base aprobada. Esta entrega mantiene el motor aprobado, amplía la operación a hasta diez salas activas independientes, conserva el historial acumulativo y permite que los jugadores creen salas públicas gratuitas desde Comunidad.

## Flujo de una partida

1. El Admin crea una partida gratuita o paga.
2. Puede agregar jugadores mediante invitaciones privadas y/o abrir el link general reutilizable.
3. En partidas pagas, el jugador indica nombre y cantidad de cartones, ve el total, la billetera/banco, el titular receptor y el alias, e informa DNI y nombre del titular que realizó la transferencia. No se suben comprobantes.
4. El Admin verifica el dinero por fuera del sistema y confirma el pago manualmente.
5. El Admin ve en tiempo real cartones solicitados, confirmados y asignados, con el dato destacado de cuántos cartones jugarán.
6. El Admin cierra inscripciones sin iniciar el sorteo. Los jugadores ya registrados conservan su derecho a entrar o recuperar acceso.
7. Al pulsar INICIAR SORTEO, el servidor asigna automáticamente los cartones faltantes de jugadores habilitados y mantiene un período de preparación/tutorial antes de la primera bolilla.
8. El juego continúa con el mismo motor compartido por jugador, DEMO, Admin, Transmisión y TV.

## Accesos

- Link privado individual: seguro, personal y compatible con vistas previas de WhatsApp sin consumir la invitación.
- Link general de partida: se abre/cierra desde Admin; crea una sesión privada distinta para cada jugador.
- Recuperación: link temporal de un solo uso generado por Admin. Puede utilizarse aunque la partida ya haya comenzado.
- Un jugador previamente registrado puede abrir su link privado tarde y entrar a la partida en curso con los cartones que el servidor le asignó al inicio.
- Si ese navegador ya tiene una sesión real en una partida iniciada, abrir Comunidad lo devuelve automáticamente a sus mismos cartones durante `starting`, `playing`, `paused`, `verifying`, `resuming` y `finalizing`. Un link explícito hacia otra mesa se respeta.

## Partidas pagas

El Admin configura precio por cartón, billetera/banco, titular de la cuenta receptora, alias y WhatsApp de contacto. El jugador elige la cantidad, que fija la cantidad exacta de cartones a jugar una vez confirmado el pago. Antes de informar la transferencia puede corregir esa cantidad libremente. Si ya informó que transfirió, un cambio queda pendiente de revisión administrativa; después de confirmar el pago, solo el Admin puede modificar la cantidad. El formulario registra solamente los datos necesarios para identificar la transferencia: DNI y nombre del titular transferente.

Estados operativos: PAGO PENDIENTE, TRANSFERENCIA INFORMADA y PAGO OK. Los pagos pendientes bloquean el inicio hasta que el Admin confirme o quite explícitamente al jugador.

Los datos de transferencia no forman parte de Comunidad, Transmisión, chat ni actas públicas.

## Preparación y tutorial

INICIAR SORTEO es independiente de CERRAR INSCRIPCIONES. Durante el estado de preparación, el jugador ya ve su interfaz real de juego y puede recorrer un tutorial contextual por globos anclados a bolilla, cartones, marcado, RECLAMAR, premios, chat y herramientas. En móvil, cada globo calcula su posición usando el viewport visible para mantenerse dentro de la pantalla. Los premios activos se explican uno por uno y se resaltan temporalmente las casillas involucradas sin modificar el cartón ni sus marcas. El servidor controla el tiempo previo a la primera bolilla para mantener a todos sincronizados.


## Multisala e historial

El servidor mantiene hasta diez workspaces operativos persistentes (`Sala 1` a `Sala 10`) con estado, jugadores, SSE, temporizadores, chat, reclamos y transmisión independientes. Pueden estar esperando o jugando al mismo tiempo. Admin puede cambiar de una a otra sin detener las demás.

Las partidas programadas oficiales pueden ocupar cualquiera de los lugares operativos. Una programación oficial ya vinculada a una sala en espera conserva la edición segura de hora, inscripción, intervalo y cartones. Las partidas oficiales próximas reservan capacidad con prioridad frente a las salas públicas creadas por jugadores.

Al finalizar, cada partida se archiva en `BINGO_DATA_DIR/historial` con resultados, acta PDF/CSV, participantes, metadatos e integridad. Las canceladas dejan registro administrativo sin generar un acta oficial falsa. `BINGO_DATA_DIR` debe apuntar a almacenamiento persistente real en producción.

## Lobby de Comunidad: PÚBLICA / PRIVADA / OFICIAL

Comunidad funciona como lobby de mesas. Las salas **PÚBLICAS** y **PRIVADAS** pueden crearlas los jugadores y son siempre gratuitas; las **OFICIALES** solo se crean desde Admin/Agenda y se distinguen visualmente.

Al crear una sala, el jugador elige nombre, Bingo 75/90, máximo de jugadores, 1–2 cartones por persona, velocidad, qué jugadas se disputan y si empieza manualmente o queda programada. Una PRIVADA agrega una clave de 4–12 letras/números. Esa misma clave protege tanto el ingreso como la Transmisión y nunca se publica en el lobby. El código secreto del creador es independiente y sirve solo para recuperar su control desde otro dispositivo.

El inicio programado admite hasta 36 horas. Si faltan más de 2 horas existe solo una placa; a 2 horas se abre la sala de espera y a la hora indicada comienza automáticamente si hay al menos 2 jugadores. Las placas futuras no consumen uno de los diez lugares activos.

Cualquier jugador dentro de una sala puede invitar por WhatsApp o copiar el link estable. Cada sala conserva chat, jugadores, bolillas, reclamos y Transmisión aislados. El chat general de Comunidad continúa separado del chat de cada sala.

Al finalizar un Bingo, la partida se archiva inmediatamente como una entrada histórica independiente. Durante 3 minutos la sala queda abierta para **JUGAR OTRA PARTIDA**: los jugadores pueden anotarse y el creador puede abrir una nueva ronda manteniendo el mismo nombre, link, clave y chat, pero con cartones, bolillas, reclamos y acta nuevos. Si nadie continúa, la sala se cierra automáticamente y libera el lugar activo.

## Comunidad y agenda

El Admin puede programar futuras partidas indicando hora de inicio, modalidad, gratuita/paga, precio por cartón, minutos de inscripción y si desea automatización. Una sala previamente PREPARADA puede abrir inscripciones automáticamente (15 minutos antes por defecto), cerrarlas al llegar la hora, autoasignar cartones pendientes e iniciar el sorteo si se cumplen las condiciones. Si faltan jugadores o existe un bloqueo, no fuerza el inicio: registra el motivo y queda bajo control del Admin.

En Comunidad móvil, la tarjeta principal cambia según el estado: próxima partida, inscripciones abiertas, por comenzar o en vivo. Cuando una sala oficial tiene el ingreso general abierto, el botón principal es ENTRAR A JUGAR y lleva directamente al formulario general. Las partidas programadas muestran horario y precio; las gratuitas muestran CARTÓN GRATIS. Demo, WhatsApp y Transmisión usan accesos compactos.

El chat de Comunidad conserva mensajes, emojis, stickers y moderación, pero en móvil funciona como panel inferior desplazable similar al chat del jugador, sin ocupar permanentemente toda la pantalla.

## Cobro de premios

Al finalizar una partida real, cada jugador con uno o más premios confirmados ve un bloque propio para coordinar el cobro. Puede guardar alias, titular de la cuenta y billetera/banco opcional. Esos datos se asocian al jugador ganador, no a la persona que pagó la inscripción, y solo aparecen en su sesión y en Admin.

El ganador puede abrir WhatsApp con un mensaje prearmado que identifica sala, premio y cartón. Los jugadores sin premio también conservan un acceso pequeño a WhatsApp para consultas. El WhatsApp de contacto/premios se configura por sala y, si se deja vacío, toma como respaldo el número configurado en Comunidad.

Los datos de cobro del ganador no se publican en Comunidad, Transmisión, chat ni actas. Admin ve cada premio confirmado junto con el alias informado y puede copiarlo para realizar el pago por fuera del sistema.

## Reglas preservadas

- Reclamos siempre manuales; Automarcado solo marca.
- En Manual no hay pista visual durante los primeros 20 segundos de un número salido sin marcar.
- Durante verificación/pausa/reanudación el jugador permanece visualmente en su cartón.
- Bingo 90 con dos líneas usa orden global de reclamos válidos; dos líneas válidas pueden adjudicarse sobre la misma bolilla.
- Cartones exclusivos del lado servidor.
- Integridad SHA-256, sello, acta y resultados oficiales se mantienen.
- La interfaz del jugador, el motor y TV no fueron rediseñados. Transmisión conserva la vista completa y agrega adaptación para celular horizontal; en vertical muestra un aviso para girar el dispositivo.

## Transmisión móvil horizontal

En teléfonos, `transmision.html` se utiliza en orientación horizontal. En vertical aparece un aviso simple para girar el dispositivo y un acceso a pantalla completa. En horizontal se conserva la transmisión completa: Vero, bolilla actual, últimas bolillas, premio confirmado, carrera de hasta seis cartones, chat y overlays de reclamo/cierre/ganadores. El botón de pantalla completa intenta bloquear orientación horizontal cuando el navegador lo permite, pero el Bingo no depende de esa API. TV no fue modificada.

## Desarrollo y pruebas

```bash
npm start
npm test
```

Antes de publicar, configurar las variables de `.env.example`. En producción, `BINGO_DATA_DIR` debe apuntar a almacenamiento persistente.
