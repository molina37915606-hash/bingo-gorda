# BINGO DE LA GORDA 2.2

Plataforma web de bingo de 75 y 90 bolillas, con un administrador principal, jugadores por sala y transmisión vertical para TikTok desde un segundo celular.

## Accesos

- `/admin-principal`: ingreso privado del propietario con la clave configurada en Render.
- `/admin`: panel completo de creación y control del bingo. Al entrar desde el panel principal no vuelve a pedir la clave.
- `/jugador`: ingreso de jugadores mediante número de sala y código privado.
- `/transmision/<token>`: vista vertical privada y de solo lectura para TikTok.

Los administradores temporales fueron retirados de esta versión. Se retomarán cuando la plataforma use almacenamiento persistente y un servidor más estable.

## Funciones principales de 2.2

- Hasta 250 cartones aleatorios sin asociarlos previamente a nombres.
- Renovación de cartones ofrecidos conservando los elegidos.
- Panel móvil del jugador, tema claro/nocturno y guía previa.
- Intervalo automático modificable durante la partida.
- Verificación separada de AmboCabeza, Línea, Doble Línea y Bingo.
- El automático no se reinicia después de un reclamo: el administrador elige continuar automático o manual.
- Animaciones de premios confirmados para todos los jugadores y la transmisión.
- Bingo confirmado con retiro de las bolillas faltantes y cierre automático.
- Resultados oficiales descargables por el administrador y por los jugadores.
- Vista TikTok 9:16 con Juego de prueba, premios, WhatsApp, Mercado Pago y estados dinámicos.

## Inicio local

1. Instalar Node.js 18 o superior.
2. Configurar `MASTER_ADMIN_PASSWORD`.
3. Ejecutar `npm start`.
4. Abrir `http://localhost:3210/admin-principal`.

En Windows también puede utilizarse `PROBAR_EN_ESTA_PC.bat`.

## Variables importantes

- `MASTER_ADMIN_PASSWORD`: contraseña del propietario.
- `PUBLIC_URL`: dirección pública del servicio.
- `PORT`: puerto local.
- `BINGO_START_SEQUENCE_MS`: duración de la presentación inicial.
- `BINGO_RESUME_SEQUENCE_MS`: duración de la cuenta regresiva al continuar.
- `BINGO_FINAL_BALLS_SEQUENCE_MS`: tiempo de celebración antes del retiro final.

No subir `.env`, contraseñas, tokens ni la carpeta `data/` a GitHub.

## Pruebas

```bash
npm test
```

La prueba automática cubre el acceso del propietario, bloqueo de operadores temporales, cambio de intervalo, reclamos, pausa posterior, continuación manual/automática, Bingo confirmado, retiro final, cierre con todas las bolillas y PDF oficial.
