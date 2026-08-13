# BINGO DE LA GORDA ALFA

ALFA redefine el acceso y la administración sobre el motor funcional de BETA 4.3. La prioridad es que las salas reales sean simples, que cada jugador tenga una sesión privada y que los cartones nunca se mezclen entre participantes.

## Accesos

- Administrador principal: `http://localhost:3210/admin`
- Jugador: `http://localhost:3210/jugador`
- DEMO individual: `http://localhost:3210/demo`
- Comunidad: `http://localhost:3210/comunidad`
- Transmisión: se crea desde la sala y se abre desde el panel administrador.

`/` y los accesos antiguos de Admin principal redirigen directamente a `/admin`.

## Salas ALFA

### Partida gratis

Clave compartida → verificar sala → nombre/cantidad → sesión privada → elegir cartones → confirmar → elegir Manual/Auto → esperar inicio.

No aparece WhatsApp, precio ni confirmación de pago.

### Partida paga

Clave compartida → verificar sala → nombre/cantidad solicitada → sesión privada → WhatsApp/pago externo → administrador ajusta la cantidad → administrador confirma → jugador elige los cartones autorizados → confirmar → elegir Manual/Auto → esperar inicio.

El acceso manual verifica primero la clave y recién después pide nombre/cantidad. El enlace directo salta la clave y abre directamente ese segundo paso. La clave compartida solo permite entrar al lobby. La identidad del jugador y sus cartones dependen de un token privado de sesión. Salir momentáneamente a WhatsApp o recargar la página no debe cerrar la sesión.

## Modos de marcado

- `Normal`: Manual o Automarcado.
- `Solo Manual`: Automarcado deshabilitado y máximo absoluto de 2 cartones por jugador.

## Administración

- Un solo Admin principal.
- Un único visor de jugador con icono de ojo, de solo lectura, para humanos e IA.
- El administrador puede subir o bajar la cantidad autorizada antes de confirmar un pago.
- Moderación del chat: bloquear desde un mensaje lo oculta y evita mensajes nuevos del jugador sin sacarlo de la partida.
- Reclamos pendientes se verifican automáticamente por servidor a los 10 segundos si el administrador no actúa.
- Línea 2 solo se habilita después de adjudicar Línea 1.

## Transmisión / TV

La transmisión intenta mantener la pantalla activa con Wake Lock, vuelve a solicitarlo al recuperar foco/visibilidad y mantiene reconexión automática. Algunos Smart TV pueden ignorar Wake Lock; en ese caso también debe desactivarse el ahorro de energía del televisor.

## Ejecutar

Requiere Node.js 18 o superior.

```bash
npm start
```

Abrir `http://localhost:3210/admin`.

## Pruebas

```bash
npm test
```

La batería ALFA comprueba además el acceso servidor en dos pasos (clave → datos → sesión), el enlace directo sin clave y que una sala ingresada por ese flujo pueda llegar a INICIAR PARTIDA. También cubre sesiones privadas, pago/aprobación, cartones exclusivos, Solo Manual, moderación, reclamos automáticos, Línea 1/Línea 2, DEMO, 60 IA, contingencia y recuperación tras reinicio.

## Persistencia

ALFA sigue usando el repositorio de archivos del servidor (`BINGO_DATA_DIR`). Para pruebas locales es suficiente. Para partidas reales en Internet, `BINGO_DATA_DIR` debe apuntar a un volumen persistente. Un hosting con disco efímero puede perder partidas y actas después de reinicios o redeploys.

La migración a una base externa como Supabase no está incluida en ALFA 5.0.0-alpha.3 porque requiere definir/configurar el proyecto y credenciales de producción sin reemplazar el motor que ya funciona.
