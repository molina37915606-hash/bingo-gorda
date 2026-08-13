# PRUEBAS PRIORITARIAS — ALFA 6 NUEVO JUGADOR

- [ ] Entrar desde PC por link directo: nombre → cantidad → /jugar sin segunda clave.
- [ ] Entrar desde celular por el mismo link con otro nombre y comprobar sesión independiente.
- [ ] Intentar registrar el mismo nombre con mayúsculas/tildes diferentes: debe rechazarlo.
- [ ] Confirmar que conocer la clave general NO permite abrir la ventana de otro jugador.
- [ ] Partida paga: solicitar cantidad → WhatsApp → volver sin perder sesión → Admin ajusta/OK → elegir cartones.
- [ ] Dos jugadores intentan el mismo cartón: solo el primero puede reservar/confirmar.
- [ ] Confirmar que un jugador no puede marcar/reclamar con un cartón ajeno.
- [ ] Recargar /jugar varias veces: debe conservar sesión y cartones.
- [ ] Cerrar pestaña y volver desde /jugador: si la sesión sigue válida debe volver a /jugar.
- [ ] Admin → RECUPERAR ACCESO: link funciona una sola vez y vence a los 15 minutos.
- [ ] Usar recuperación en otro dispositivo: el dispositivo anterior debe quedar desconectado.
- [ ] Chat móvil: abrir, minimizar, mensajes compactos, emojis/stickers.
- [ ] Si aparece premio reclamable con chat abierto, debe minimizarse el chat.
- [ ] Iniciar con jugadores sin elegir cartones: autoasignar sin duplicados.

# Checklist de pruebas · BINGO DE LA GORDA ALFA

## Crear sala
- [ ] Admin abre directamente en `/admin`.
- [ ] Crear partida GRATIS.
- [ ] Crear partida PAGA.
- [ ] Crear modo NORMAL.
- [ ] Crear modo SOLO MANUAL.
- [ ] Solo Manual no permite más de 2 cartones.
- [ ] Definir clave compartida.
- [ ] Escribir clave compartida y comprobar que primero valida la sala.
- [ ] Después de validar clave aparecen nombre y cantidad.
- [ ] Copiar ENLACE DIRECTO y comprobar que abre directamente nombre/cantidad, sin pedir clave.
- [ ] Copiar MENSAJE PARA WHATSAPP y verificar que incluya el enlace.
- [ ] QR abre el acceso directo sin pedir clave.

## Jugador gratis
- [ ] Entrar: clave → nombre/cantidad → sala.
- [ ] Entrar con enlace directo + nombre.
- [ ] No aparece WhatsApp ni precio.
- [ ] Elegir cartones.
- [ ] Otro jugador no puede tomar los mismos cartones.
- [ ] Recargar y conservar sesión/cartones.
- [ ] Recargar `/jugar` y comprobar que NO vuelve a pedir clave.
- [ ] Abrir WhatsApp, volver al navegador y comprobar que NO vuelve a pedir clave.

## Jugador pago
- [ ] Entrar: clave → nombre/cantidad solicitada → sala.
- [ ] Solicitar cantidad de cartones.
- [ ] Aparece botón de WhatsApp.
- [ ] Ir a WhatsApp y volver sin perder sesión.
- [ ] Antes del OK no puede elegir cartones.
- [ ] Admin puede bajar cantidad.
- [ ] Admin puede subir cantidad dentro del máximo.
- [ ] Admin confirma pago.
- [ ] Recién entonces el jugador elige cartones.
- [ ] Elegir exactamente la cantidad autorizada.
- [ ] Recargar y recuperar sesión.
- [ ] Probar enlace/token de recuperación en otro dispositivo.

## Inicio de partida
- [ ] Con 2 jugadores conectados y habilitados aparece INICIAR SORTEO activo.
- [ ] Un jugador elige sus cartones y otro no elige ninguno.
- [ ] Al iniciar, quien no eligió recibe automáticamente al azar la cantidad autorizada.
- [ ] Verificar que los cartones automáticos no se repitan con los de otros jugadores.
- [ ] Si el jugador no eligió Manual/Auto, comienza en MANUAL.
- [ ] En partida PAGA, un jugador con pago pendiente NO recibe cartones ni entra en esa ronda.
- [ ] Admin muestra resumen: habilitados / asignación automática / pagos pendientes.
- [ ] Probar INICIAR SORTEO con 40–60 jugadores sin esperar selección manual individual.

## Juego
- [ ] Bingo 75.
- [ ] Bingo 90 con 1 Línea.
- [ ] Bingo 90 con 2 Líneas.
- [ ] Manual.
- [ ] Automarcado en modo Normal.
- [ ] Solo Manual no muestra/permite Auto.
- [ ] Línea 1.
- [ ] Línea 2 solo después de Línea 1.
- [ ] Bingo.
- [ ] IA puede reclamar premios.
- [ ] Primer reclamo válido conserva prioridad.
- [ ] Si Admin no actúa, reclamo se verifica solo a los 10 s.

## Admin
- [ ] Un solo botón 👁 para ver jugador.
- [ ] Visor funciona con humano.
- [ ] Visor funciona con IA.
- [ ] Visor no permite jugar por el participante.
- [ ] Ver jugador desconectado/reconectado.
- [ ] Bloquear chat desde un mensaje lo oculta.
- [ ] Bloqueado no puede enviar más mensajes.
- [ ] Desbloquear jugador.

## Chat
- [ ] Escritorio: panel grande y opaco.
- [ ] Celular: panel de aproximadamente media pantalla.
- [ ] Celular: botón — MINIMIZAR visible y funcional.
- [ ] Mensajes en celular con poco espacio vertical/padding.
- [ ] Contador de mensajes al minimizar.
- [ ] Premio cierra/prioriza sobre chat.

## DEMO
- [ ] Entrar sin código.
- [ ] Manual/Auto.
- [ ] IA.
- [ ] Chat/emojis/stickers.
- [ ] Línea 1 antes de Línea 2.
- [ ] Bingo y final.

## Transmisión / TV
- [ ] Abrir transmisión.
- [ ] Wake Lock/pantalla activa.
- [ ] Cambiar de pestaña y volver.
- [ ] Recupera Wake Lock.
- [ ] Perder Internet y reconectar.
- [ ] Recupera bolilla, historial y estado.
- [ ] Probar durante varios minutos en TV real sin suspensión.

## Resistencia
- [ ] Refrescar jugador durante partida.
- [ ] Apagar datos/Wi-Fi y volver.
- [ ] Ir a WhatsApp durante espera y volver.
- [ ] Reiniciar servidor y recuperar partida.
- [ ] Probar 10 jugadores.
- [ ] Probar 20 jugadores.
- [ ] Probar 40 jugadores.
- [ ] Probar simulación 60 IA.


## Pantalla del jugador / carga
- [ ] Después de nombre y cantidad nunca queda una pantalla totalmente blanca.
- [ ] Mientras abre /jugar aparece CARGANDO SALA.
- [ ] Si la interfaz tarda/falla aparece REINTENTAR.
- [ ] Confirmar cartones y comprobar que pasa a ESPERANDO SORTEO sin pantalla blanca.
- [ ] Probar el mismo recorrido en PC y celular real.
