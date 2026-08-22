## V9.0.3 — Campeonato dinámico

- Campeonato público: 3 / 5 / 7 rondas.
- 5 rondas queda como opción recomendada y predeterminada.
- Salas nuevas ya no aceptan 10 / 20 / 30 rondas.
- Campeonatos antiguos persistidos con 10 / 20 / 30 siguen siendo legibles y recuperables.

# El Bingo de la Gorda

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
- Selección de cartones o asignación automática al iniciar.
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

## V9 · Campeonato La Gorda 1.0 — Comunidad pública

- Nuevo tipo de sala pública en **Comunidad → Crear sala → Campeonato**.
- Campeonatos públicos de **3, 5 o 7 rondas** en Bingo 90 o Bingo 75; **5 rondas es el formato recomendado**.
- Cada jugador puede inscribirse con **1 a 4 posiciones de cartón**, hasta el máximo de la sala; no es obligatorio que todos tengan la misma cantidad.
- Cada posición (C1/C2/C3/C4) acumula puntos de forma independiente durante todo el Campeonato.
- Los jugadores **no eligen matrices**. El servidor genera y asigna una matriz nueva al azar a cada posición al comenzar cada ronda.
- Reconectar durante una ronda conserva exactamente la misma matriz; sólo cambia al iniciar oficialmente la siguiente ronda.
- Reutiliza el bolillero, la interfaz normal de jugador, marcado, voz, chat y Transmisión.
- Puntuación matemática en servidor por números, Primera Línea, Segunda Línea y Bingo, según la extracción ordinal del logro.
- El primer Bingo matemático activa **5 bolillas adicionales** y luego una ventana final de 20 segundos para el bonus de reacción cuando corresponda.
- Entre rondas se muestran resultados de ronda y clasificación general; el creador inicia manualmente la ronda siguiente.
- La última ronda vale x1 y el desempate usa el reglamento competitivo; pueden existir empates oficiales completos.
- El reglamento implementado está documentado en `CAMPEONATO_LA_GORDA_REGLAMENTO_V3.md`.


## V9.0.2 — Hotfix Reclamos Campeonato

- En Campeonato manual, cada posición/cartón puede cantar **Primera Línea, Segunda Línea y Bingo**.
- Las jugadas de Campeonato **no se cierran globalmente** cuando otro cartón canta: cada cartón conserva su propio estado de reclamo.
- Cantar una Línea o Segunda Línea no pausa el bolillero ni abre verificación administrativa; el servidor valida matemáticamente la jugada y la registra al instante.
- Los puntos principales siguen calculándose automáticamente por el servidor. El reclamo no cambia la bolilla matemática ni bloquea a otros cartones.
- Bingo conserva el bonus de reacción +3/+2/+1 cuando el Campeonato es manual.
- Si un jugador tiene varios Bingos propios habilitados al mismo tiempo, un toque de Bingo los registra juntos para no penalizar la segunda pulsación.
