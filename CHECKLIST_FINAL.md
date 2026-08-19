# CHECKLIST — EL BINGO DE LA GORDA

## Acceso e inscripción

- [ ] El link general comienza cerrado.
- [ ] Abrir/cerrar inscripciones no inicia el sorteo.
- [ ] Cada ingreso por link general crea una sesión privada.
- [ ] Un link privado no se consume por previews GET/HEAD.
- [ ] Un jugador registrado puede entrar tarde con sus cartones ya asignados.
- [ ] Recuperación de un solo uso funciona durante una partida activa.

## Partida paga

- [ ] Admin configura precio, billetera/banco, titular receptor, alias y WhatsApp.
- [ ] Jugador elige cantidad y ve total correcto.
- [ ] Antes de informar transferencia puede modificar libremente la cantidad.
- [ ] Si ya informó una transferencia, un cambio de cantidad queda pendiente de revisión del Admin y no altera silenciosamente el pedido.
- [ ] Con pago confirmado, la cantidad solo puede modificarla el Admin.
- [ ] Jugador informa DNI y titular de la transferencia sin subir comprobante.
- [ ] Admin ve PENDIENTE / TRANSFERENCIA INFORMADA / PAGO OK.
- [ ] Pago confirmado habilita exactamente la cantidad autorizada de cartones.
- [ ] Un pago pendiente bloquea INICIAR SORTEO hasta resolverlo.

## Admin

- [ ] Se muestran cartones solicitados, confirmados y asignados.
- [ ] El dato “CARTONES JUGARÁN ESTA PARTIDA” es correcto.
- [ ] CERRAR INSCRIPCIONES y INICIAR SORTEO son acciones distintas.
- [ ] Jugadores desconectados pero registrados cuentan como participantes habilitados.
- [ ] Recuperación puede copiarse/enviarse por WhatsApp.

## Cobro de ganadores

- [ ] El WhatsApp de contacto/premios está disponible también en partidas gratuitas (por sala o heredado de Comunidad).
- [ ] Solo un jugador con premio confirmado puede guardar datos de cobro.
- [ ] El ganador informa alias, titular y billetera/banco opcional sin reutilizar los datos del pagador de cartones.
- [ ] El ganador puede abrir WhatsApp con sala, premio y cartón identificados.
- [ ] Un no ganador conserva un acceso secundario de WhatsApp para consultas.
- [ ] Admin ve los datos privados de cobro junto a los premios confirmados y puede copiar el alias.
- [ ] Los datos de cobro no aparecen en Comunidad, Transmisión, chat ni actas públicas.

## Juego

- [ ] Interfaz aprobada del jugador no presenta regresiones visuales.
- [ ] Estado `starting` mantiene el cartón visible.
- [ ] Tutorial contextual se puede avanzar/saltar y reabrir desde el botón Ayuda visible en móvil.
- [ ] Cada paso usa un globo anclado al elemento real con puntero visible.
- [ ] El globo se reposiciona dentro del viewport/safe area y no desborda la pantalla móvil.
- [ ] Solo se explican los premios activos y cada premio muestra una demostración visual de sus casillas sin alterar el estado del cartón.
- [ ] No sale ninguna bolilla antes de terminar la preparación controlada por servidor.
- [ ] Reclamos, verificación, Manual 20 s, chat móvil, Bingo 75/90, Transmisión y TV conservan su comportamiento.

## Agenda automática

- [ ] La hora programada representa la hora real de inicio de la partida.
- [ ] Una sala PREPARADA con automatización abre inscripciones los minutos configurados antes del inicio.
- [ ] A la hora programada cierra inscripciones automáticamente.
- [ ] Autoasigna cartones pendientes usando las reglas actuales.
- [ ] Solo inicia automáticamente si se cumplen las condiciones de inicio.
- [ ] Si no puede iniciar, queda en espera y Admin ve el motivo.
- [ ] Admin puede cancelar/reactivar la automatización sin tocar la interfaz del jugador ni Comunidad.

## Multisala e historial

- [ ] Admin muestra hasta 10 salas y permite alternar sin detener las demás.
- [ ] Varias salas pueden estar jugando simultáneamente sin cruzar bolillas, jugadores, chat, reclamos ni SSE.
- [ ] Un reinicio del proceso recupera todas las salas activas desde `BINGO_DATA_DIR`.
- [ ] Una programación oficial vinculada y todavía en espera permite editar horario, inscripción, intervalo y cartones con protecciones.
- [ ] Agenda AUTO puede crear/abrir varias salas en paralelo mientras haya capacidad.
- [ ] Finalizar una sala crea un registro histórico independiente con acta PDF/CSV, participantes e integridad.
- [ ] Finalizar otra sala no reemplaza el archivo histórico anterior.
- [ ] Una cancelación queda registrada como cancelada y no genera acta oficial falsa.
- [ ] `BINGO_DATA_DIR` apunta a almacenamiento persistente real en producción.

## Regreso automático a partida activa

- [ ] Entrar a Comunidad con una sesión real en `starting`, `playing`, `paused`, `verifying`, `resuming` o `finalizing` vuelve directamente a `/jugar`.
- [ ] Se conserva el mismo jugador, cartones y marcas porque se reutiliza la sesión privada vigente.
- [ ] Una invitación explícita a otra mesa (`?mesa=`) no es interceptada por el regreso automático.
- [ ] DEMO y partidas terminadas no provocan redirección automática desde Comunidad.

## Lobby PÚBLICA / PRIVADA / OFICIAL

- [ ] Comunidad muestra PÚBLICAS, PRIVADAS y OFICIALES con identificación visual distinta.
- [ ] Solo Admin/Agenda puede crear una sala OFICIAL.
- [ ] Un jugador puede crear PÚBLICA o PRIVADA, siempre gratuita y sin montos.
- [ ] Crear sala permite nombre, Bingo 75/90, jugadores, 1–2 cartones, velocidad, jugadas e inicio manual/programado.
- [ ] PRIVADA exige clave de 4–12 letras/números; la clave no aparece en payloads públicos.
- [ ] La misma clave de PRIVADA protege ingreso y Transmisión.
- [ ] Código de creador y clave privada son credenciales distintas.
- [ ] Inicio programado permite hasta 36 horas; >2 h es placa, a 2 h abre espera y a la hora inicia con mínimo 2 jugadores.
- [ ] Cualquier jugador dentro de la sala puede invitar por WhatsApp/copiar link estable.
- [ ] Chat general de Comunidad y chats de sala permanecen separados.
- [ ] Máximo 10 salas activas; placas futuras no cuentan y las OFICIALES conservan prioridad de capacidad.
- [ ] Bolillas, chat, jugadores, reclamos, timers, SSE y Transmisión no se cruzan entre salas.
- [ ] Al terminar, la partida se archiva por separado y se abre una ventana de 3 minutos para jugar otra.
- [ ] El creador puede abrir otra partida manteniendo sala/link/clave/chat; cada nueva partida reinicia cartones, bolillas, reclamos y acta.
- [ ] Si no se abre otra partida, la sala se cierra sola y libera el workspace.
- [ ] El mismo link, una vez cerrada, informa que la partida terminó en lugar de mostrar una sala inexistente.
- [ ] Historial conserva tipo (public/private/official), nombre y vínculo de Comunidad por partida.

## Transmisión móvil horizontal

- [ ] En celular vertical, Transmisión muestra GIRÁ EL CELULAR y no una vista recortada.
- [ ] En celular horizontal siguen visibles Vero, bolilla actual, últimas bolillas, premio confirmado y chat.
- [ ] Bingo 90 mantiene hasta 6 cartones de carrera en horizontal.
- [ ] En Bingo 90 horizontal los cartones ocupan celdas independientes y no se superponen.
- [ ] Bingo 75 mantiene la carrera completa, incluidos cartones compactos secundarios.
- [ ] Reclamos, premio confirmado, Bingo, extracción final y showcase de ganadores siguen visibles en horizontal.
- [ ] Pantalla completa intenta bloquear orientación landscape si el navegador lo permite y funciona igualmente si no lo soporta.
- [ ] Escritorio y TV conservan su comportamiento aprobado.

## Salas comunitarias · jugadas y espera

- [ ] Solo el creador ve nombre, cantidad de cartones y estado Listo/Eligiendo de cada jugador.
- [ ] Un jugador común no recibe la lista privada de control del creador.
- [ ] En inicio manual, el creador no puede comenzar mientras algún jugador registrado todavía no confirmó sus cartones.
- [ ] Bingo 90 permite Solo Bingo, 1 Línea + Bingo o 2 Líneas + Bingo.
- [ ] Bingo 75 permite desactivar Línea y demás jugadas para jugar Solo Bingo.
- [ ] La sala de espera muestra jugadores actuales/máximo y cantidad total de cartones para la partida.

## Validación técnica

- [ ] `node --check server.js`.
- [ ] `node --check` de todos los archivos `js/*.js`.
- [ ] `npm test` completo.
- [ ] Paquete GitHub con menos de 100 archivos y sin archivos individuales pesados.
- [ ] Lógica funcional común idéntica entre Completo y GitHub.

## Comunidad — accesos principales

- [ ] DEMO muestra el bot/cartones y abre `/demo`.
- [ ] CREAR SALA usa la ilustración de mesa/bolillero y abre el creador actual.
- [ ] WHATSAPP muestra a La Gorda con teléfono y abre las opciones de grupo/ayuda.
- [ ] En móvil, los tres accesos entran en una fila compacta sin taparse ni cortar ilustraciones.
- [ ] En escritorio, las tarjetas mantienen texto, ilustración y área táctil clara.

## 2026-08-18 2248 · Comunidad móvil + 4 cartones
- Comunidad móvil compactada: cabecera/estado más bajos, accesos DEMO/CREAR SALA/WHATSAPP en una fila y Mesas visible antes.
- Barra de chat y navegación móvil reducidas para tapar menos contenido.
- Texto sin partida oficial orientado a entrar o crear una mesa.
- Salas creadas por jugadores: máximo configurable de 1, 2, 3 o 4 cartones por persona.
- Servidor valida y conserva máximo 4; espera y control del creador siguen mostrando los totales reales.
