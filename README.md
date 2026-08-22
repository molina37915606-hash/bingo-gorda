# El Bingo de la Gorda

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
