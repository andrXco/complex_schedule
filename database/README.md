# PostgreSQL local

Docker Compose levanta un PostgreSQL de desarrollo y carga tres catálogos de
prueba. Cada catálogo conserva sus cursos, secciones y sesiones; la cantidad
esperada de horarios queda en `level_zero_test_case`.

```powershell
pnpm run test:level-zero
```

La prueba inicia el contenedor si hace falta, consulta los escenarios y ejecuta
el algoritmo de dominio. El volumen `postgres_data` conserva la base local.

El esquema también registra `app_user`, `user_schedule`, `schedule_participant`
y `schedule_section_assignment`. La interfaz de desarrollo lee los usuarios de
PostgreSQL, permite elegir participantes y guarda el horario resultante y el
JSON de origen dentro de una transacción. Los dos usuarios de ejemplo usan el
dominio reservado `.invalid` y solo existen para desarrollo; el selector local
no reemplaza la autenticación real.

Si ya tienes un volumen creado con la versión previa del esquema, aplica las
migraciones pendientes una sola vez. La migración agrega el almacenamiento JSON:

```powershell
docker compose exec -T db psql -U complex_schedule -d complex_schedule -v ON_ERROR_STOP=1 -f /migrations/001-separa-catalogo-y-casos-de-prueba.sql
docker compose exec -T db psql -U complex_schedule -d complex_schedule -v ON_ERROR_STOP=1 -f /migrations/002-horarios-json-y-participantes.sql
```

Para iniciar la aplicación, copia `.env.example` a `.env.local`, inicia la base
con `docker compose up -d --wait db` y ejecuta `pnpm dev`. Las rutas
`/api/users` y `/api/schedules` conectan Next.js con PostgreSQL;
`/api/generate` ejecuta el algoritmo de nivel 4 sobre el JSON cargado.
Supabase Auth se integrará en una etapa posterior.

## Pruebas del nivel 1

`pnpm run test:level-one` ejecuta las pruebas de dominio y del adaptador JSON.
Para verificar generación y validación al guardar por HTTP, levanta
PostgreSQL y Next y ejecuta `pnpm run test:level-one:api`. La suite HTTP usa
`http://localhost:3000` o el valor de `SCHEDULE_BASE_URL`.

## Pruebas del nivel 2

`pnpm run test:level-two` prueba el cálculo y la validación del rango de
créditos. Con PostgreSQL y Next activos, `pnpm run test:level-two:api`
comprueba la generación y el rechazo de guardados fuera del rango.

## Pruebas del nivel 3

`pnpm run test:level-three` prueba la ventana de almuerzo y sus límites.
Con PostgreSQL y Next activos, `pnpm run test:level-three:api` comprueba
el filtrado de sesiones al generar y al guardar.

## Pruebas del nivel 4

`pnpm run test:level-four` comprueba el límite de huecos y el descuento
del almuerzo. Con PostgreSQL y Next activos, `pnpm run test:level-four:api`
verifica la generación y el guardado.

## Pruebas de navegador con Selenium

Con Python 3.11 o posterior y Chrome, inicia PostgreSQL y la app:

```powershell
docker compose up -d --wait db
pnpm run dev
```

Espera a que Next muestre `Ready` y, desde otra terminal en el proyecto,
instala las dependencias y ejecuta la suite:

```powershell
python -m pip install -r tests/selenium/requirements.txt
pnpm run test:selenium
```

El navegador abre `http://localhost:3000`. Si la app usa otro puerto,
configura `SCHEDULE_BASE_URL` con su URL, por ejemplo
`$env:SCHEDULE_BASE_URL = "http://localhost:3001"` en PowerShell.
Selenium Manager obtiene el controlador de Chrome.
Si ya tienes uno instalado, indica su ruta en `CHROMEDRIVER_PATH`.

Para ver los clics en una ventana de Brave, ejecuta:

```powershell
pnpm run test:selenium:brave
```

Selenium abre una ventana de prueba con su propio perfil. En Windows busca
Brave en las carpetas habituales. Si está en otra carpeta, configura
`BRAVE_BINARY` con la ruta de `brave.exe`. Si necesitas indicar el controlador,
usa un ChromeDriver compatible con la versión de Chromium que muestra
`brave://version` y configura `CHROMEDRIVER_PATH` con su ruta.

Las pruebas cargan el ejemplo público y los archivos en `tests/selenium/fixtures`.
Cubren cupos, cruces, archivos inválidos, omisiones, prioridad de las materias,
calendario, descargas y guardado compartido. La prueba que guarda horarios usa
datos temporales en PostgreSQL y los retira al terminar.
