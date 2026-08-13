# BINGO DE LA GORDA — CUASIFINAL FUNCIONAL

Versión 5.1.0-cuasifinal-funcional.1.

## Flujo principal

1. El administrador crea una partida.
2. Agrega cada jugador y autoriza hasta 4 cartones (máximo 2 en Solo Manual).
3. El sistema genera un link privado individual para enviar por WhatsApp.
4. El primer dispositivo que abre el link queda asociado a una sesión privada.
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
