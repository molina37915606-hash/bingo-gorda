# CHECKLIST — CUASIFINAL FUNCIONAL

## Admin e ingreso
- [ ] Crear una partida de 90 bolas con 1 línea.
- [ ] Crear una partida de 90 bolas con 2 líneas.
- [ ] Crear una partida de 75 bolas.
- [ ] Confirmar que Transmisión/TV existe siempre y no se configura al crear.
- [ ] En modo Normal, un jugador nuevo queda autorizado para 4 cartones por defecto.
- [ ] En Solo Manual, el máximo queda forzado a 2 cartones.
- [ ] Agregar dos jugadores con nombres distintos.
- [ ] Intentar repetir un nombre cambiando mayúsculas/acentos y confirmar que se rechaza.
- [ ] Copiar el link privado de cada jugador y enviarlo por WhatsApp.
- [ ] Abrir cada link en un dispositivo distinto y comprobar que entra directo, sin clave ni segundo login.
- [ ] Intentar reutilizar el mismo link inicial desde otro dispositivo y confirmar que no permite entrar.

## Sala de espera
- [ ] Ambos jugadores llegan a SALA DE ESPERA.
- [ ] Se ve la cantidad máxima de cartones autorizados.
- [ ] Un jugador confirma menos cartones que el máximo y conserva esa cantidad.
- [ ] El otro jugador no confirma ninguno.
- [ ] Ningún cartón puede ser elegido por dos jugadores.
- [ ] Chat disponible antes de iniciar.
- [ ] Emojis disponibles.
- [ ] Stickers disponibles.
- [ ] Emojis/stickers de La Gorda disponibles.
- [ ] No aparece ninguna opción GIF.
- [ ] Minijuego Rojo o Negro funciona.
- [ ] Minijuego Mayor o Menor funciona.

## Inicio y partida
- [ ] INICIAR SORTEO aparece claramente en Admin.
- [ ] Con al menos 2 jugadores conectados se puede iniciar.
- [ ] El jugador que no confirmó cartones recibe automáticamente la cantidad autorizada.
- [ ] El jugador que confirmó menos conserva exactamente su selección.
- [ ] Los números visibles de cartón son únicos dentro de la partida.
- [ ] Ambos dispositivos pasan de la sala de espera al juego.
- [ ] El cartón principal queda visible en celular sin scroll vertical excesivo.
- [ ] La bolilla moderna muestra número actual y progreso X/75 o X/90.
- [ ] Se ven las últimas bolillas.
- [ ] Manual funciona.
- [ ] Automarcado funciona en modo Normal.
- [ ] Automarcado no aparece/funciona en Solo Manual.
- [ ] Chat se minimiza y no desplaza el cartón.
- [ ] Números salidos y ganadores se pueden consultar.
- [ ] Tutorial se puede abrir nuevamente con ?.

## Reclamos y final
- [ ] Línea 1 funciona.
- [ ] En 90 con 2 líneas, los reclamos válidos se ordenan globalmente: 1.º = Línea 1 y 2.º = Línea 2, incluso si ocurrieron con la misma bolilla.
- [ ] Bingo funciona.
- [ ] Si Admin no resuelve un reclamo, el servidor lo verifica automáticamente a los 10 segundos.
- [ ] Gana el primer reclamo válido.
- [ ] Final muestra ganadores y cartones ganadores.
- [ ] Descargar sello SHA-256.
- [ ] Descargar acta PDF.

## Recuperación y TV
- [ ] Recargar el celular y seguir con la misma sesión.
- [ ] Ir a WhatsApp y volver sin perder sesión/cartones.
- [ ] Generar link de recuperación desde Admin y usarlo en otro dispositivo.
- [ ] Confirmar que el link de recuperación sirve una sola vez y la sesión anterior queda invalidada.
- [ ] Abrir Transmisión/TV.
- [ ] Ver bolilla, progreso, historial y ganadores en TV.
- [ ] Confirmar reconexión y Wake Lock cuando el navegador lo permita.

## DEMO
- [ ] /demo abre sin errores.
- [ ] 90 bolas solo ofrece 1/2 líneas + Bingo.
- [ ] 75 bolas permite los premios especiales correspondientes.
- [ ] Normal parte con 4 cartones por defecto.
- [ ] Solo Manual limita a 2.
- [ ] DEMO entra a la misma sala de espera social.
- [ ] DEMO usa la misma pantalla de juego que una partida real.


## Regresión 90 bolas — 5.1.1
- [ ] AmboCabeza aparece como premio opcional en Admin.
- [ ] AmboCabeza aparece como premio opcional en DEMO.
- [ ] Con 2 líneas y dos reclamos válidos en la misma bolilla: primero = Línea 1, segundo = Línea 2.
- [ ] Un tercer reclamo válido de línea queda sin premio si Línea 1 y Línea 2 ya fueron adjudicadas.
- [ ] Un mismo cartón no puede reutilizar la misma fila para cobrar Línea 1 y Línea 2.


## Regresión WhatsApp y reclamos — 5.1.2
- [ ] Generar un link privado y pegarlo en WhatsApp sin tocarlo.
- [ ] Esperar a que WhatsApp genere la vista previa y confirmar en Admin que el link sigue SIN USAR.
- [ ] Abrir el mismo link desde el celular: debe entrar directo a la sala y recién entonces quedar activado.
- [ ] Volver a abrir el link desde el mismo celular: debe recuperar/abrir la misma sesión.
- [ ] Abrir el link ya activado desde otro dispositivo: debe rechazar el acceso y ofrecer recuperación por Admin.
- [ ] Tocar LÍNEA: el reclamo debe enviarse inmediatamente, sin diálogo de confirmación.
- [ ] Tocar AMBOCABEZA: el reclamo debe enviarse inmediatamente, sin diálogo de confirmación.
- [ ] Tocar BINGO: el reclamo debe enviarse inmediatamente, sin diálogo de confirmación.
- [ ] Confirmar que el botón se bloquea inmediatamente para evitar doble toque mientras el servidor recibe el reclamo.

## Revisión 5.1.3 · pulido funcional
- [ ] Probar Modo Día/Noche en jugador y comprobar que queda guardado al recargar.
- [ ] Probar Modo Día/Noche en DEMO, Comunidad y Transmisión/TV.
- [ ] Confirmar que durante el sorteo ya no aparece un aviso flotante "Bolilla X" por cada extracción.
- [ ] Confirmar que el progreso se muestra de forma discreta como `X / 75` o `X / 90`.
- [ ] Activar VOZ y escuchar varias bolillas: el cantado debe ser breve y natural, sin repetir constantemente "Bolilla número...".
- [ ] Confirmar que Primera Línea / Segunda Línea / AmboCabeza / Bingo se anuncian con frases cortas y claras.
- [ ] Abrir el chat del juego: debe verse como el chat de Comunidad.
- [ ] Probar botón ☺ de emojis.
- [ ] Probar botón ✦ de stickers y comprobar que incluye los stickers de La Gorda.
- [ ] Confirmar que NO existe botón GIF.
- [ ] En celular, minimizar el chat y comprobar que el cartón vuelve a quedar completamente priorizado.
