# BINGO DE LA GORDA - Beta

Versión de estabilización preparada para comenzar pruebas con varios jugadores reales. No utiliza numeración visible.

## Objetivos de esta Beta

- ingreso privado y seguro por link individual;
- sala de espera con chat y minijuegos;
- chat permanente: móvil debajo del juego y escritorio a la derecha;
- 75 bolas con columnas B-I-N-G-O por color y bolilla del mismo color;
- Manual sin pistas durante 20 segundos y ayuda amarilla posterior;
- cartón y reclamos visibles sin scroll innecesario;
- cantador automático, carteles de premios, acta y sello;
- DEMO y jugador real sobre el mismo cliente.

## Flujo principal

1. El administrador crea una partida.
2. Agrega cada jugador y autoriza hasta 4 cartones (máximo 2 en Solo Manual).
3. El sistema genera un link privado individual para enviar por WhatsApp.
4. Las vistas previas de WhatsApp/redes pueden consultar el link sin consumirlo. Cuando el jugador lo toca en un navegador real, la página activa automáticamente su sesión privada y entra sin botones extra.
5. El jugador entra directamente a la sala de espera: elige cartones, usa chat, emojis, stickers de La Gorda y minijuegos.
6. Al iniciar, quienes no confirmaron cartones reciben automáticamente la cantidad autorizada. Quien confirmó menos conserva exactamente su selección.
7. Comienza el Bingo con una misma interfaz para DEMO y partidas reales.

## Seguridad funcional

- Un nombre por jugador dentro de cada partida.
- Un link privado no puede reutilizarse en otro dispositivo.
- Recuperación mediante link temporal de un solo uso generado por Admin.
- Los cartones se reservan y confirman en servidor; no pueden duplicarse entre jugadores.
- La sesión del jugador usa cookie HttpOnly.

## Configuración

La transmisión existe siempre y no forma parte de la creación de la partida. La sala de espera incluye chat y minijuegos de forma predeterminada.

## Desarrollo local

```bash
npm start
```

Configurar las variables indicadas en `.env.example` antes de publicar. En producción, `BINGO_DATA_DIR` debe apuntar a almacenamiento persistente.


## Ajuste 5.1.1
- Bingo 90 recupera **AmboCabeza** como premio opcional.
- Con 2 líneas, los reclamos válidos forman una cola global: **1.º válido = Línea 1; 2.º válido = Línea 2**.
- Si Juan y Pedro reclaman línea en la misma bolilla, el segundo reclamo válido no se descarta: conserva su orden y puede adjudicarse Línea 2.
- Un mismo cartón puede ganar la segunda línea solo si completa una **línea distinta** de la que ya le dio un premio; no puede volver a reclamar la misma fila.


## Ajuste 5.1.2
- El **GET/HEAD de una invitación nunca la consume**. Esto evita que la vista previa de WhatsApp marque el acceso como usado.
- La página de invitación genera una activación efímera y el navegador hace un **POST interno automático**; para el jugador sigue siendo un solo toque.
- Una vez activada realmente, el mismo navegador puede volver a abrir el link y otro dispositivo queda rechazado.
- **Línea, AmboCabeza y Bingo se reclaman con un solo toque**, sin ventana de confirmación previa. El primer toque que llega al servidor fija el orden del reclamo.


## Cambios 5.1.3 · Cuasifinal Funcional 4
- Recupera modo Día/Noche en jugador, DEMO, Comunidad y transmisión; Admin conserva su selector existente.
- El panel del jugador ya no muestra el rótulo flotante “BOLILLA” ni genera un aviso “Bolilla X” por cada extracción.
- La voz canta números de forma más breve y natural; los eventos de Línea/Ambo/Bingo usan guiones más directos.
- El chat del juego adopta el patrón visual de Comunidad: botón de emoji, botón de stickers (incluye La Gorda), campo compacto y enviar. Sin GIF.
- En móvil el chat sigue siendo un panel fijo/minimizable y no empuja el cartón fuera de la pantalla.


## Cambios 5.1.4 · Cuasifinal Funcional 5
- El cantador/voz del jugador queda **activado por defecto**. Cada dispositivo puede silenciarlo y la preferencia queda guardada.
- En Manual, un número salido sin marcar recibe una **ayuda luminosa recién después de 20 segundos**. Nunca se marca automáticamente.
- Los reclamos pendientes, confirmados o rechazados vuelven a usar los carteles gráficos de `assets/celebrations/` y se muestran sincronizados en los jugadores.
- El layout de escritorio fue redimensionado: el cartón de 75 bolas tiene tamaño máximo y ya no escala hasta ocupar toda la pantalla.
- Se incorporan timestamps de extracción por bolilla para que la ayuda Manual se base en tiempo real de salida y sobreviva a refrescos/reconexión.


## Cambios 5.1.5 · Foco automático de premios

- Si cualquiera de tus cartones tiene un premio abierto para reclamar, la interfaz cambia automáticamente a ese cartón.
- Si el chat está abierto, se minimiza para priorizar el reclamo.
- La pestaña de cualquier otro cartón con premio queda marcada con una estrella y pulso dorado.
- Si varios cartones quedan listos a la vez, se abre el primero detectado y los demás permanecen señalados.
- No se marca ni reclama nada automáticamente: el jugador conserva el reclamo de un toque.
