# BINGO DE LA GORDA

Aplicación web para partidas de bingo de 75 y 90 bolas. Incluye panel administrativo, acceso móvil de jugadores, chat, transmisión, salas de prueba por enlace, salas oficiales con códigos individuales, minijuego de espera y actas auditables.

## Crear una sala

Abrí `http://localhost:3210/admin` y elegí:

- **Sala de prueba:** enlace abierto, de 2 a 10 jugadores, entre 1 y 4 cartones por persona.
- **Sala oficial:** jugadores y cartones controlados mediante códigos individuales.

La configuración simplificada permite elegir modalidad, premios, cantador, voz, intervalo, cantidad de cartones en pasos de 25 y transmisión opcional. Los dos minijuegos están siempre disponibles durante la espera.

## Funciones principales

- Bolillero criptográfico controlado por el servidor.
- Generación de 25 a 250 cartones en pasos de 25.
- Validación y límites de similitud para cartones de 75 y 90 bolas.
- Hasta 60 jugadores, 4 cartones por jugador y 250 cartones activos.
- Automarcado obligatorio por encima de 10 jugadores o 40 cartones.
- Reclamos registrados con hora, milisegundos y secuencia de recepción.
- Chat público con moderación.
- Sala de espera con Mayor/Menor y Rojo/Negro siempre activos, con cambio libre entre ambos.
- En salas de prueba, el jugador ve 10 cartones, puede recargarlos y elegir los suyos. Si el administrador inicia antes de la confirmación, la asignación se completa automáticamente.
- Transmisión con chat y cuatro cartones destacados.
- Actas PDF y CSV consultables desde el juego.
- Copias de seguridad y recuperación.

## Ejecutar localmente

```bash
npm start
```

Rutas principales:

- Administrador: `http://localhost:3210/admin`
- Jugadores: `http://localhost:3210/jugador`
- Demostración: `http://localhost:3210/demo`
- Panel avanzado de importación: `http://localhost:3210/admin-avanzado`

## Pruebas

```bash
npm test
```

Para producción, configurá almacenamiento persistente mediante `BINGO_DATA_DIR`.
