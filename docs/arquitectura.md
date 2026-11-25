# Arquitectura por capas

## Límites de cada capa

- **Presentación (`src/components`, `app/`)**: Next.js App Router muestra el
  flujo y consume rutas HTTP. No implementa reglas de compatibilidad ni SQL.
- **Aplicación (`src/application`)**: convierte el JSON del proyecto al modelo
  de dominio y coordina la generación y validación de los niveles 0 al 6.
- **Dominio (`src/domain`)**: contiene los tipos y algoritmos puros de
  restricciones. No depende de React, Docker ni PostgreSQL.
- **Infraestructura (`src/infrastructure/postgres`, `database`)**: encapsula el
  pool de PostgreSQL, el esquema, las migraciones y los datos de desarrollo.

La interfaz permite seleccionar un usuario propietario y varios participantes.
El [nivel 6](algorithms/nivel-6-dias-libres.md) se calcula para el estudiante
del JSON de entrada. Los participantes se asocian al horario guardado y pueden
consultarlo desde su selector local. Cada resultado conserva el horario
generado y el JSON de origen para que futuras etapas puedan volver a procesarlos.

## Relación entre usuarios y horarios

`app_user` registra usuarios locales de desarrollo. `user_schedule` registra
el resultado JSON, el archivo JSON de origen, el nivel alcanzado y su creador.
`schedule_participant` permite agregar varios usuarios al horario compartido.
La API inserta el horario y sus participantes dentro de una sola transacción.
`schedule_section_assignment` se conserva para escenarios normalizados de
prueba y el trabajo futuro con selecciones independientes por participante.

Las versiones de catálogo viven en `catalog_dataset`. Los casos con cantidad
esperada de horarios viven aparte en `level_zero_test_case`, para que los datos
de verificación no formen parte del modelo de horarios de la aplicación.

El esquema y los dos usuarios de ejemplo son locales para desarrollo. La
interfaz usa la API de Next.js; las rutas de servidor son las únicas que abren
conexiones PostgreSQL. El selector local no representa autenticación real, que
se integrará en una etapa posterior.
