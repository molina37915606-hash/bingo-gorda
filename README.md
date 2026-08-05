# BINGO DE LA GORDA 2.1

Plataforma web de bingo de 75 y 90 bolillas, con panel principal, operadores temporales, jugadores por sala y vista vertical de transmisión para un segundo celular.

## Accesos separados

- `/admin-principal`: panel privado del propietario. Crea, extiende y revoca accesos temporales.
- `/admin`: panel de juego propio del propietario.
- `/operador/<token>`: panel limitado de cada administrador temporal.
- `/jugador`: ingreso de jugadores mediante código y sala.
- `/transmision/<token>`: vista vertical de solo lectura para un segundo celular.

Los operadores temporales no comparten la contraseña ni el panel del propietario. Cada uno administra únicamente sus propias salas y datos.

## Inicio local

1. Instalar Node.js 18 o superior.
2. Copiar `.env.example` como `.env` o definir las variables en la consola.
3. Ejecutar `npm start`.
4. Abrir `http://localhost:3210/admin-principal`.

En Windows también puede utilizarse `PROBAR_EN_ESTA_PC.bat`.

## Variables importantes

- `MASTER_ADMIN_PASSWORD`: contraseña del propietario.
- `PUBLIC_URL`: dirección pública del servicio.
- `PORT`: puerto local.
- `BINGO_START_SEQUENCE_MS`: duración de la presentación inicial.
- `BINGO_RESUME_SEQUENCE_MS`: duración de la cuenta regresiva al continuar.

No subir `.env`, contraseñas, tokens ni la carpeta `data/` a GitHub.

## Pruebas

```bash
npm test
```

La prueba automática cubre acceso principal, operador temporal, separación de espacios, 250 cartones, jugadores, cambio de dispositivo, reclamos manuales, cambio de intervalo automático, modo transmisión, acta y PDF.
