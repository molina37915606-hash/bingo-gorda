# Arquitectura y GitHub — versión 2.2

## Roles activos

- **Propietario:** único administrador. Ingresa mediante `/admin-principal` con la clave de Render.
- **Jugador:** entra a una sala con su código privado.
- **Transmisión:** vista vertical de solo lectura mediante token.

Los administradores temporales no están activos en esta versión.

## Persistencia

La sala y los resultados se guardan en la carpeta `data/`. Render Free utiliza almacenamiento efímero: una nueva publicación o un reinicio puede borrar esos archivos. Antes de vender accesos a terceros debe migrarse a una base de datos o almacenamiento persistente.

## Flujo de publicación

1. Guardar una copia de la versión anterior.
2. Descomprimir la carpeta 2.2 dentro del repositorio local.
3. No subir `.env` ni archivos de `data/`.
4. Ejecutar `npm test`.
5. Confirmar los cambios en GitHub Desktop.
6. Hacer `Push origin`.
7. Verificar en Render `/healthz` y luego `/admin-principal`.

Etiqueta recomendada: `v2.2.0`.
