# BINGO DE LA GORDA - Final

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

## Salas públicas creadas por jugadores

Desde Comunidad, un jugador puede crear una sala pública gratuita, ponerle un nombre y elegir Bingo 75/90, máximo de jugadores, 1–2 cartones por persona, velocidad y qué jugadas se disputan. No existen precios, transferencias ni un panel de anfitrión para estas salas.

El inicio puede ser manual o programado. En modo manual, quien creó la sala entra como un jugador más y es el único que ve **INICIAR PARTIDA**. En modo programado, se puede elegir un horario hasta 36 horas hacia adelante: si faltan más de 2 horas solo se publica una placa liviana; a 2 horas se abre automáticamente la sala de espera y a la hora indicada el sorteo comienza solo si hay al menos 2 jugadores.

Cada sala tiene un link público estable para invitar. Cualquier jugador que ya esté dentro puede compartirlo por WhatsApp o copiarlo. El creador recibe además un código secreto para recuperar su permiso desde otro dispositivo. El chat, las bolillas, los jugadores y los reclamos permanecen aislados por sala.

Las placas programadas futuras no consumen uno de los diez lugares activos hasta que llega su ventana de apertura. Cuando una partida termina o se cancela, libera su lugar.

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
