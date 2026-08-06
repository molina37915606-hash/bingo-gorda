# BINGO GORDA 2026.2

Plataforma web de bingo de 75 y 90 bolas para administrar salas privadas, cartones, reclamos, transmisión, chat y resultados auditables.

## Cambios principales de 2026.2

- Bolillero autoritativo en el servidor con orden criptográfico y compromiso SHA-256.
- Configuración, reglas, premios y cartones bloqueados al comenzar la partida.
- Validación estructural y control de diversidad para hasta 250 cartones.
- Automarcado obligatorio cuando participan más de 10 jugadores o hay más de 40 cartones activos.
- Chat público con historial limitado, espera entre mensajes y moderación administrativa.
- Reclamos registrados con hora del servidor, milisegundos y secuencia oficial de recepción.
- PDF y CSV con el ganador y todas las alertas recibidas en la misma ventana de auditoría.
- Modo demostración temporal en `/demo`, con jugadores virtuales y bolillero automático.
- Restauración de respaldos con nombres, cupos, presentadores y estado de la sala.

## Modalidades

- 90 bolas: AmboCabeza, Primera línea, Segunda línea y Bingo.
- 75 bolas: Línea, Doble línea, Triple línea, 4 esquinas y Bingo.

## Capacidad configurada

- Hasta 60 jugadores.
- Hasta 4 cartones por jugador.
- Hasta 250 cartones generados y 250 activos.
- Para 60 jugadores con 4 cartones se utiliza automarcado obligatorio.

## Uso local

1. Instalar Node.js 18 o superior.
2. Copiar `.env.example` como `.env` y configurar la contraseña.
3. Ejecutar `npm start`.
4. Abrir la dirección indicada por la consola.

Rutas principales:

- `/admin-principal`: ingreso del propietario.
- `/admin`: administración de la sala.
- `/jugador`: ingreso de participantes.
- `/demo`: demostración pública temporal.
- `/reglamento`: reglamento vigente.

## Pruebas

Ejecutar:

```bash
npm test
```

La prueba automática verifica generación de 250 cartones en ambas modalidades, diversidad, chat, restauración, bloqueo de configuración, bolillero del servidor, ventana de reclamos, milisegundos, PDF, automarcado obligatorio y rechazo de cartones malformados.

## Persistencia

En producción, `BINGO_DATA_DIR` debe apuntar a un volumen persistente. Sin un disco persistente, una reconstrucción o reinicio de la plataforma puede eliminar la sala y los resultados archivados.
