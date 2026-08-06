# Bingo de la Gorda 2.3

Aplicación web de bingo de 75 o 90 bolillas, con panel del propietario, salas para jugadores, cartones móviles, verificación manual de premios, resultados oficiales y transmisión vertical para TikTok.

## Inicio rápido

1. Instalar Node.js 18 o posterior.
2. Configurar `MASTER_ADMIN_PASSWORD` en Render o en un archivo `.env` local.
3. Ejecutar:

```bash
npm start
```

4. Abrir `/admin-principal` e ingresar con la clave principal.

## Funciones principales

- Generación aleatoria de hasta 250 cartones.
- De 2 a 60 accesos de jugadores y hasta 4 cartones permitidos por jugador.
- El administrador crea cupos y códigos; cada jugador escribe su propio nombre.
- Nombre obligatorio, no genérico y sin duplicados dentro de la sala.
- El jugador puede confirmar menos cartones que el máximo habilitado.
- Renovación de cartones ofrecidos conservando los ya elegidos.
- Presentador personal intercambiable mediante “Cambiar mi suerte”.
- Automarcado opcional, avisos y reclamos manuales.
- Verificación lado a lado: marcas del jugador frente a marcas oficiales.
- Continuación manual o automática desde el bolillero después de cada reclamo.
- Intervalo automático modificable durante el sorteo.
- Animaciones sincronizadas de AmboCabeza, Línea, Doble Línea y Bingo.
- Retiro de bolillas restantes después de un Bingo confirmado.
- Resultados oficiales descargables por administrador y jugadores.
- La sala permanece disponible para revisar cartones hasta que el administrador la finaliza.
- Modo TikTok vertical mediante un enlace privado para un segundo celular.

## Pruebas

```bash
npm test
```

La prueba automática cubre identificación, selección parcial de cartones, presentador personal, reclamos, continuidad desde el bolillero, cierre del sorteo, PDF y cierre definitivo de la sala.

## Persistencia

Render Free usa almacenamiento efímero. Para uso comercial continuo se recomienda una base de datos o almacenamiento persistente. No se deben guardar claves reales dentro de GitHub.
