## V9.2.8 — Campeonato: bonus por primer logro + desempate rápido

- Campeonato incorpora bonus matemáticos por orden de logro: **Primera Línea +5**, **primera Segunda Línea +5** y mantiene **primer Bingo +15**.
- Los bonus se asignan por la **bolilla en que se completa matemáticamente** la jugada, no por velocidad de toque ni conexión. Si varias posiciones completan la jugada con la misma bolilla, todas reciben el bonus correspondiente.
- El anuncio y la pantalla del jugador muestran el valor efectivo: por ejemplo, el primer Bingo se informa como **75 pts (60 + 15)** y los Bingos posteriores como **60 pts**.
- El desempate final conserva las **10 bolillas iniciales**: si hay líder único, gana. Si persiste el empate, comienza muerte súbita una bolilla por vez.
- En muerte súbita ya no se vuelve a comparar el acumulado: gana la primera posición activa que **marca la bolilla nueva cuando su rival no la marca**. Con más de dos finalistas, continúan sólo quienes marcaron esa bolilla diferencial.
- No se abre una nueva serie de 10 bolillas durante la muerte súbita de Campeonato.
- Nueva regresión automatizada: `tests/community-championship-v4-bonuses.js`; se reforzó `tests/community-championship-v4-tiebreak.js`.

## V9.2.7 — Premios visibles + anuncios automáticos sincronizados

- Cada mesa normal muestra en **Comunidad** los premios que realmente están habilitados: por ejemplo `SE JUEGA POR: LÍNEA + BINGO` o `AMBO CABEZA + 2 LÍNEAS + BINGO`.
- La misma lista permanece visible al **elegir cartones** y dentro de la **sala de espera**.
- En `AUTO + EMPATES`, una bolilla que completa un premio ya no salta de inmediato al resultado: el servidor hace una pausa breve y congela el bolillero.
- Después de la pausa se dispara un único anuncio sincronizado para Jugador, TV y Transmisión, con canto del premio, cartel y ganador/es.
- Los empates de la misma bolilla se resuelven antes de anunciar: todos los ganadores se muestran juntos.
- La secuencia es genérica para Ambo Cabeza, Línea/Segunda Línea, 4 Esquinas, Doble Línea, Triple Línea y Bingo.
- No puede salir otra bolilla ni forzarse una reanudación mientras el anuncio automático está activo.
- Si quedan premios, la partida continúa al terminar el cartel; si fue Bingo, el cierre/extracción final comienza recién después del anuncio.
- Se amplió `tests/automatic-claims-ties.js` y se agregó `tests/community-prizes-announcements.js`.

## V9.2.6 — Links directos a mesas públicas y privadas

- El link compartido de una **mesa pública** abre directamente el ingreso de esa mesa; ya no deja al invitado solamente en Comunidad.
- El link compartido por el creador de una **mesa privada** incluye una credencial de invitado segura: quien lo recibe entra directamente sin escribir la clave manualmente.
- La credencial del link privado **no es el código de titular** y nunca concede permisos para iniciar, cancelar, finalizar ni administrar la sala.
- La clave humana de la sala privada no se expone dentro del link.
- El lobby público no publica la credencial privada: el enlace directo con acceso sólo se obtiene desde la sesión autenticada del creador.
- Si una invitación privada abre una sala todavía programada, el navegador conserva temporalmente el permiso de acceso; al habilitarse la mesa puede continuar sin volver a escribir la clave.
- V9.2.6 es **acumulativa sobre V9.2.4**: también incluye la limpieza de salas manuales `0/N` tras 5 minutos sin actividad preparada en V9.2.5.
- Nueva regresión automatizada: `tests/community-direct-room-links.js`.

## V9.2.5 — Limpieza automática de salas vacías

- Una sala de Comunidad creada en modo **manual** puede existir con `0 jugadores`: el creador sigue siendo organizador y no está obligado a jugar.
- Si esa sala permanece con `0 jugadores` durante más de **5 minutos sin actividad**, el servidor la cierra automáticamente y deja de mostrarla en Comunidad.
- La actividad autenticada del creador en **VER MI SALA** renueva el plazo; también lo reinician ingresos/movimientos reales de jugadores.
- Si hay al menos un jugador inscripto, la regla de sala vacía no aplica, aunque esté desconectado: `1/30` sigue siendo `1/30`.
- Las salas **programadas** no usan este cierre por inactividad antes de su horario, y una partida ya iniciada tampoco.
- Nueva regresión automatizada: `tests/community-empty-idle-cleanup.js`.

## V9.2.4 — Inscriptos persistentes + Cartones al azar

- La Comunidad muestra la cantidad de **jugadores inscriptos**, no la cantidad de conexiones SSE activas.
- Si un jugador cambia de app, minimiza, cierra la pestaña o pierde Internet, sigue contando en la mesa: `1 / 30` continúa siendo `1 / 30`.
- Solo `ABANDONAR SALA`, con confirmación explícita, libera el lugar antes de iniciar y reduce el contador.
- En la pantalla de elección se agrega **🎲 CARTONES AL AZAR**. El servidor asigna y confirma exactamente la cantidad de cartones que el jugador eligió al ingresar.
- La asignación aleatoria se resuelve en el servidor, sin repetir cartones entre jugadores y respetando la diversidad matemática vigente.
- La selección manual continúa disponible sin cambios.
- Nueva regresión automatizada: `tests/community-registration-random-cards.js`.

## V9.2.3 — Desconectarse no es abandonar

- `ABANDONAR SALA` es una acción explícita y exclusiva del botón del jugador.
- Cambiar a WhatsApp u otra app, bloquear el teléfono, dejar la pestaña en segundo plano, cerrar la pestaña o perder Internet no libera el cupo ni transfiere la titularidad.
- Al volver con la misma sesión, el jugador recupera su mesa y continúa normalmente.
- El servidor rechaza intentos de abandono que no lleven la confirmación explícita de la interfaz.
- Se mantiene V9.2.2: si el titular abandona de forma explícita, la sala se cierra si queda vacía o transfiere la titularidad al primer jugador restante.

## V9.2.2 — Titularidad automática al abandonar Comunidad

- Si el **titular/creador que está jugando abandona la sala** y no queda ningún otro jugador activo, la mesa se cierra automáticamente y deja de mostrarse como activa en Comunidad.
- Si queda al menos un jugador activo, la titularidad se transfiere automáticamente al **jugador restante que ingresó primero**.
- La transferencia es real: el nuevo titular recibe los permisos para iniciar/cancelar la sala, avanzar rondas de Campeonato y abrir revancha cuando corresponda.
- El nombre del creador mostrado en Comunidad se actualiza al nuevo titular.
- El código del titular anterior se invalida al transferirse la sala, evitando que quien ya salió siga administrándola.
- La regla es común a salas públicas y privadas y a las modalidades Normal, Flash y Campeonato.
- Con una partida ya iniciada, la participación del jugador que sale se conserva para no alterar resultados; solo la titularidad pasa a otro jugador activo. Si no queda ninguno, la mesa se cierra.
- Se amplió `tests/community-leave-and-flash-lobby.js` para cubrir transferencia antes y durante la partida, cierre de mesa vacía e invalidación del código anterior.

## V9.2.1 — Salida universal de Comunidad + limpieza de Flash

- Nuevo botón **ABANDONAR SALA** en la vista del jugador para cualquier mesa creada desde Comunidad, sin depender de si es pública, privada, Bingo 75/90, Normal, Flash o Campeonato.
- Si se abandona antes de iniciar, el jugador se elimina de la mesa y libera su cupo/cartones para otra persona.
- Si se abandona con la partida ya iniciada, se cierra la sesión del jugador pero se conserva su participación para no alterar resultados, cartones, Flash, Campeonato ni actas.
- Abandonar una sala no la cancela, incluso si quien sale es quien la creó; la administración sigue disponible con el código de creador.
- Las partidas **Flash finalizadas desaparecen inmediatamente del lobby de Comunidad**. Campeonato conserva su ventana de resultados/acta.
- Prueba automatizada: `tests/community-leave-and-flash-lobby.js`.

## V9.2.0 — Modo Flash en Comunidad

- Nueva modalidad **⚡ Flash** disponible al crear salas desde Comunidad.
- Exactamente **1 cartón por jugador**.
- Se extraen **10 bolas iniciales** y cada número real acertado vale **1 punto**. En Bingo 75, el centro LIBRE no suma.
- Gana quien tenga más aciertos tras la décima bola.
- Si dos o más jugadores empatan en el máximo, sólo ellos pasan a **muerte súbita**: se extrae una bola por vez y gana cuando exactamente uno de los finalistas marca esa bola.
- Si excepcionalmente se agotara el bolillero sin romper el empate, el servidor entrega cartones nuevos a los finalistas y abre una nueva serie de muerte súbita.
- El conteo es oficial y automático del servidor: Flash no usa reclamos, premios de Línea/Bingo ni velocidad de reacción.
- Integrado en jugador, creador, lobby de Comunidad, TV, Transmisión, persistencia y acta.
- Prueba automatizada: `tests/community-flash.js`.
- Reglamento específico: `MODO_FLASH_REGLAMENTO_V1.md`.

## V9.1.0 — Campeonato La Gorda V4

- Campeonato reconstruido con un único reglamento vigente de **3, 5 o 7 rondas**.
- Puntuación fija: número +1, Primera Línea +10, Segunda Línea +20, Bingo +60 y primer Bingo +15.
- Para ser Campeón Oficial es obligatorio haber conseguido al menos un Bingo.
- Los cantes siguen siendo manuales y públicos, pero no otorgan puntos ni dependen de la velocidad de reacción.
- Empate final por el primer puesto: cartones nuevos, 10 bolillas y, si sigue igual, muerte súbita bola por bola hasta un Campeón único.
- Campeonato interrumpido: se conserva lo disputado como **INCOMPLETO · SIN CAMPEÓN OFICIAL**.
- Acta final y vistas de jugador, creador, TV y Transmisión alineadas con V4.
- Reglamento vigente: `CAMPEONATO_LA_GORDA_REGLAMENTO_V4.md`.

## V9.0.1 · Pantalla TV

Se agregó una herramienta simple para mostrar una placa o imagen fija en un televisor:

- Admin principal: botón **📺 Pantalla TV**.
- **CARGAR / CAMBIAR IMAGEN** sube la imagen inmediatamente; no requiere guardar otra configuración.
- La imagen se adapta a 1920 × 1080 con fondo negro, sin recorte.
- Link público estable: `/pantalla`.
- `/pantalla` muestra únicamente la imagen, sin interfaz ni controles visibles.
- Tocar la imagen intenta activar pantalla completa y Wake Lock cuando el navegador lo permite.
- Si la imagen cambia desde Admin, la TV se actualiza automáticamente sin cambiar el link.
- La imagen queda guardada en `BINGO_DATA_DIR/tv-screen`, por lo que persiste en reinicios cuando `BINGO_DATA_DIR` usa almacenamiento persistente.

También se cerró la prueba de carga pendiente de Campeonato: **30 jugadores × 4 posiciones = 120 cartones**, con matrices únicas, cierre Primer Bingo +5, cambio de matrices en la siguiente ronda y conservación de puntos.


Software web para crear, administrar y jugar partidas recreativas de Bingo desde celular o computadora.

La plataforma V6 funciona en modo **gratuito**: no vende cartones, no procesa apuestas, no registra transferencias de participación, no administra fondos de premios y no procesa pagos a ganadores. Los cartones son elementos de juego dentro de una sala.

## Funciones principales

- Bingo de 75 y 90 bolillas.
- Salas administradas y salas públicas creadas desde Comunidad.
- Comunidad gratuita con chat, salas, invitaciones y minijuegos.
- Selección manual de cartones, asignación inmediata al azar o asignación automática al iniciar.
- Marcado manual o automático según la configuración de la sala.
- Reclamo tradicional o detección automática con empates, elegible antes de iniciar.
- Validación de Línea, Bingo y jugadas opcionales en el servidor.
- Transmisión, TV y receptor Cast.
- Recuperación de acceso de jugadores.
- Historial, acta PDF/CSV/JSON y sello SHA-256 del sorteo.
- Multisala y reinicio con persistencia.
- Banner horizontal para sponsors en la vista del jugador: aparece 10 segundos al inicio y cada 10 bolillas, debajo de RECLAMAR.
- Demo separada para probar el sistema.

## Modelo gratuito

Todas las salas de Comunidad y las partidas programadas desde el administrador son gratuitas dentro del software.

El backend no acepta ni necesita precio por cartón, alias de cobro, medio de pago, estado de transferencia, importes asociados a jugadas ni datos de cobro del ganador. Los campos financieros de versiones antiguas se eliminan al cargar los archivos de datos.

Antes de reescribir un archivo antiguo que contenga esos campos, V6 conserva una copia con sufijo `.pre-free-v6.bak` en el mismo directorio de datos.

Las actas históricas ya archivadas se consideran registros cerrados y no se reescriben automáticamente.

## Comunidad

Comunidad permite:

- crear salas públicas gratuitas;
- entrar como jugador solo cuando la persona elige **Ingresar a jugar**;
- administrar una sala creada sin convertirse obligatoriamente en jugador;
- compartir el enlace de ingreso;
- iniciar/cancelar la sala según permisos;
- recuperar accesos;
- consultar transmisión;
- programar partidas gratuitas desde Admin.

El servidor fuerza este comportamiento gratuito aunque un cliente antiguo intente enviar campos financieros.

## Jugadas y reclamos

Las reglas de juego se configuran antes del inicio. Una vez iniciado el sorteo, las reglas relevantes quedan bloqueadas.

### Reclamo tradicional

El jugador utiliza **RECLAMAR**. El servidor valida el cartón contra las bolillas oficiales y registra el orden de recepción de los reclamos.

### Automático + empates

Después de cada bolilla, el servidor revisa los cartones habilitados. Si dos o más cartones completan la misma jugada con esa misma extracción, todos quedan registrados como ganadores empatados para esa jugada.

## Publicidad y sponsors

El banner de sponsor es independiente de la mecánica del Bingo. No modifica cartones, probabilidades, jugadas, validaciones ni resultados.

La versión actual admite una imagen horizontal configurable desde Admin. La referencia de diseño es **1200 × 500 px**.

## Futuro Modo Evento Premium

La arquitectura prevista para Premium es la de un servicio de software: branding del evento, sponsors, personalización visual, capacidad y herramientas de organización. Premium no debe convertirse en un cobro por cartón ni quedar ligado al resultado de una partida.

## Ejecución local

Requiere Node.js 18 o superior.

```bash
npm install
npm start
```

Por defecto el servidor usa el puerto configurado en `PORT` o su valor interno de desarrollo.

## Persistencia

Para separar los datos del código puede definirse:

```bash
BINGO_DATA_DIR=/ruta/a/datos
```

El sistema conserva en ese directorio el estado operativo, la configuración de plataforma y los archivos generados por el historial.

En el primer arranque de V6, si detecta estructuras financieras antiguas, crea una copia de seguridad antes de normalizarlas.

## Pruebas

```bash
npm test
```

La batería cubre acceso, administración, Comunidad, salas públicas, programación gratuita, Bingo 75/90, reclamos, reclamo automático con empates, recuperación, reinicio, móvil, transmisión, multisala, historial, publicidad y simulación.

## Principio de diseño

La lógica crítica vive en el servidor. El cliente presenta el juego, pero no decide por sí solo qué cartón es válido, qué bolillas salieron ni quién completó una jugada ganadora.


### Bolillero de Comunidad
Incluye Modo Libre del 1 al 250, con máximo configurable de 1 a 10 apariciones por número y voz robótica del dispositivo.


## Modo Evento Premium - Fase 1 (2026-08-22)

Se agregó `/evento-admin` para crear eventos con nombre, logo, colores, sponsor, modalidad y tandas de hasta 300 cartones. Cada tanda tiene código `EVT-XXXXXX`, SHA-256 y códigos privados por cartón. Genera PDF de impresión con 6 cartones por hoja sin códigos, ZIP con PDFs individuales (código + QR), `tanda.json` y `control.csv`. La vinculación de jugadores y la integración con sala/transmisión corresponden a Fase 2 y siguientes.


## Modo Evento Premium · Fase 2 (2026-08-22)

Sobre la Fase 1 se agregó gestión persistente de jugadores y cartones. Un jugador puede tener varios cartones de una o varias tandas del mismo Evento. Cada cartón conserva su código privado original y, cuando está vinculado, ingresar con cualquiera de esos códigos abre automáticamente todos los cartones de ese jugador.

El panel `evento-admin.html` permite alta, corrección y baja de jugadores; vinculación/desvinculación por código privado o número de cartón; importación CSV atómica; vista grande de cada cartón; control de cartones sin asignar y presencia reciente del jugador. `evento.html` incorpora mosaico de cartones y vista grande anterior/siguiente. Las vinculaciones se guardan en los datos del Evento y no modifican la matriz ni el SHA-256 de la tanda.

El CSV de control y los PDFs individuales descargados después de vincular jugadores incluyen el nombre asociado. La Transmisión Premium y el motor de partida del Evento se mantienen fuera de esta fase.


## Modo Evento Premium · Fase 2.1

Se agrega gestión segura del ciclo de vida de los eventos:

- **Archivar evento:** conserva tandas, cartones, códigos y jugadores, pero bloquea nuevos accesos y modificaciones hasta restaurarlo.
- **Restaurar evento:** devuelve un evento archivado al estado activo/borrador con todos sus datos intactos.
- **Eliminar definitivamente:** sólo está habilitado para eventos archivados y exige escribir el código exacto `EV-XXXXXX`. Borra el evento, sus tandas y logos propios.
- El panel separa **Eventos activos** y **Archivados** para reducir eliminaciones accidentales.

El motor de partida continúa sin cambios en esta fase.


## Modo Evento Premium — Fase 2.2 Hotfix (2026-08-22)

- Corrige el botón **VINCULAR** del gestor de jugadores: ahora obtiene los controles desde la fila real del jugador y ya no intenta usar selectores CSS como si fueran IDs.
- Vinculación validada tanto por **código privado** como por **número de cartón**.
- Agrega **ASIGNAR A…** directamente en la lista de cartones sin asignar para reducir pasos durante la preparación del evento.
- Los errores de vinculación quedan visibles en el panel y el campo sólo se limpia después de una vinculación exitosa.
- Incluye prueba de regresión específica `tests/event-mode-phase2-2.js`.


## Modo Evento Premium · Fase 3

La Fase 3 agrega el **Panel del Conductor** y las pantallas **TV Premium / Transmisión Premium**. Un Evento se vincula explícitamente a una sala operacional existente; por debajo se reutiliza el mismo motor, estado, bolillero y endpoints de conducción. Las pantallas públicas usan un token de visualización propio y de solo lectura, sin exponer credenciales de administrador.

La integración matemática de la tanda Evento con los cartones y jugadores operacionales de la sala se mantiene fuera de esta fase y queda reservada para Fase 4.


## Modo Evento Premium · Fase 4

La Fase 4 conecta matemáticamente la tanda con el motor real. Al **preparar/sincronizar** el Evento antes de la primera bolilla, la sala reemplaza sus cartones generados por las matrices exactas de los cartones vinculados del Evento y crea los jugadores operacionales correspondientes. El acceso por código privado utiliza esa misma sala para bolillas, marcado, reclamos, validación, pausa, reconexión y cierre.

La integridad se protege verificando el SHA-256 de las tandas al cargarlas y congelando jugadores/cartones cuando la partida deja el estado `waiting`. Los límites operativos continúan siendo los del motor actual: hasta 60 jugadores, 250 cartones activos y 4 cartones por jugador (2 en SOLO MANUAL).


## Modo Evento Premium · Fase 4.1

- Tandas Evento de **6 a 1.000 cartones exactos**.
- En Bingo 90, los 6 cartones por hoja son sólo maquetación de impresión: ya no forman series matemáticas.
- Auditoría obligatoria de toda la tanda: 0 duplicados, códigos únicos, estructura válida, filas no idénticas ni con 4/5 números compartidos y máximo de 6/15 números comunes entre dos cartones Bingo 90 en tandas de hasta 500; para 501–1.000 el perfil de calidad usa un máximo explícito de 7/15. El límite elegido queda registrado en la auditoría.
- La auditoría queda dentro de `tanda.json` y protegida por el SHA-256 de la tanda.
- Modo Evento: hasta **150 jugadores** y **250 cartones activos por partida**. Una tanda puede tener hasta 1.000 cartones aunque sólo se vinculen/activen hasta 250 en una partida.
- Salas normales y Comunidad conservan sus límites anteriores.


## Modo Evento Premium · Fase 5 (2026-08-22)

- Verificación obligatoria antes de iniciar: modalidad, auditoría/SHA de tandas, jugadores, cartones, preparación, fingerprint y persistencia.
- Si se cambian asignaciones después de preparar la sala, el inicio se bloquea hasta volver a sincronizar.
- Estado de salud en el Panel del Conductor: sala, recuperación, jugadores conectados y presencia reciente de TV/Transmisión Premium.
- Recuperación comprobable después de reinicio: la vinculación Evento → workspace y el estado de la partida se recuperan desde disco.
- Al finalizar se congela un acta Premium del Evento en PDF, CSV y JSON dentro del historial de la partida.
- El Evento conserva un historial de cierres (hasta 30) con sala, jugadores, cartones, ganadores e integridad.
- Los cartones del jugador quedan en modo consulta después del cierre.
- Se mantienen los límites de Fase 4.1: 150 jugadores / 250 cartones activos y tandas de hasta 1.000.


## Modo Evento Premium · Fase 5.1 — Carrera de Cartones

- TV Premium y Transmisión Premium incorporan una **Carrera de Cartones** con hasta 6 posiciones, calculadas por el mismo motor oficial que ya usa la transmisión tradicional.
- Cada posición muestra jugador, número de cartón, miniatura real, jugada objetivo y cantidad faltante.
- El ranking se recalcula con cada bolilla y no altera probabilidades, reclamos ni validaciones.
- El jugador Evento no ve datos de otros participantes: en `evento.html` sólo se destaca cuál de **sus propios cartones** está más cerca y cuánto le falta para la jugada objetivo.
- Reclamos, ganador y cierre Premium conservan prioridad visual sobre la carrera.


## Modo Evento Premium · Fase 5.2 (2026-08-22)

- El Evento crea su propia sala operacional desde el Panel del Conductor; ya no requiere crear una partida auxiliar en Admin general.
- Jugadas configurables por Evento, incluido **SOLO BINGO** en Bingo 75 y Bingo 90. Bingo permanece siempre activo.
- Sala de espera del jugador: el código privado abre sus cartones antes del inicio y la pantalla pasa al juego en vivo automáticamente.
- El código queda recordado sólo en el almacenamiento local de ese navegador/dispositivo. Al volver desde el mismo navegador no se pide otra vez; en otro dispositivo o navegador se debe ingresar o escanear nuevamente.
- Al finalizar, un jugador participante puede descargar el Acta Premium oficial en PDF desde su pantalla.


## Modo Evento Premium · Fase 5.3 (2026-08-22)

- La partida del jugador Evento adopta la misma estructura funcional del jugador normal: cartón principal, marcado y botón RECLAMAR grande y permanente.
- Los selectores de cartón son grandes, cuadrados y visibles, con 2 por fila en celular para facilitar el cambio a jugadores ocasionales.
- Skin Premium en rojo vino/bordó con acentos dorados; sala de espera y cierre conservan el branding del Evento.
- Manual/Automarcado funciona también desde Evento mediante un endpoint protegido propio.
- Comunidad reconoce una Sala Evento activa y muestra **ENTRAR A MI CARTÓN**; en el mismo navegador se reutiliza el acceso guardado y en otro dispositivo se solicita el código privado.


## Modo Evento Premium · Fase 5.4

Acceso fácil desde PDF, link general para compartir, respaldo/restauración exacta de eventos y tandas, y links de selección con reserva de cartones y confirmación manual del administrador.

## Campeonato La Gorda V4

- Formatos oficiales: **3, 5 o 7 rondas**; mínimo 2 jugadores.
- Cada C1/C2/C3/C4 es una posición competitiva independiente.
- Cada ronda normal asigna una matriz nueva al azar; la posición y el puntaje acumulado se conservan.
- Puntuación fija: **número +1 · Primera Línea +10 · Segunda Línea +20 · Bingo +60 · primer Bingo +15**.
- El primer Bingo activa exactamente **5 bolillas adicionales**. Si varias posiciones hacen Bingo con la misma bolilla que activa el cierre, todas reciben el +15.
- Los cantes son manuales/sociales y no otorgan puntos, no pausan el bolillero y no dependen de la latencia.
- Para ser Campeón Oficial es obligatorio haber conseguido **al menos un Bingo** durante las rondas normales.
- La clasificación oficial usa elegibilidad y puntaje total; no existen criterios ocultos de desempate.
- Empate por el primer puesto elegible: **cartones nuevos + 10 bolillas**. Si persiste, muerte súbita bola por bola con los mismos cartones y bolillero hasta un ganador único.
- Un Campeonato interrumpido después de comenzar queda **INCOMPLETO · SIN CAMPEÓN OFICIAL**.
- Reglamento único: `CAMPEONATO_LA_GORDA_REGLAMENTO_V4.md`.
