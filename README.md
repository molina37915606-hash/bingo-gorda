# HanaLingua 2.0: aprender leyendo

Nueva versión de la app Android para **japonés y coreano**, centrada en lectura, traducción, audio y comprensión.

## Qué contiene

- 10 temas en cada idioma: saludos, cortesía, sí y no, presentarse, números, familia, comidas, lugares, preguntas y diálogo inicial.
- **164 expresiones** con escritura nativa, romanización, traducción y nota contextual.
- Diálogos cortos para leer y escuchar por parlamento.
- Prácticas de 8 preguntas con cuatro opciones y resultados guardados por tema.
- Lectura libre de todas las expresiones y consulta de su traducción.
- Audio del motor TextToSpeech del teléfono, normal o lento (requiere voces japonesa y coreana instaladas).
- Contenido y progreso locales, sin cuentas, anuncios ni conexión requerida para las lecciones.

## Construir APK

Abrí con Android Studio y ejecutá `assembleDebug`, o subí el proyecto a GitHub en la rama `hanalingua-v2-build` para compilar automáticamente con Actions. Se obtiene `app/build/outputs/apk/debug/app-debug.apk`.

La aplicación es de prueba. Conviene revisar los materiales con hablantes competentes antes de publicarla como curso formal. Los audios del TTS y los caracteres dependen del sistema Android. Se usa el mismo identificador `com.hanalingua.app` que en la v1, pero las claves de depuración pueden variar entre sistemas de compilación. Si Android rechaza la actualización por firma distinta, es necesario desinstalar primero la versión anterior, lo que borra su progreso local.
