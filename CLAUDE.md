# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Reglas de colaboración

- **Nunca hacer operaciones git de escritura** (commit, push, merge, rebase, reset, etc.). Solo operaciones de lectura como `git status`, `git diff`, `git log`.

## Comandos

```bash
# Desarrollo (requiere Node 20 vía nvm)
source ~/.nvm/nvm.sh && nvm use 20
npm run dev          # Servidor Vite con hot reload, puerto por defecto 5173
npm run build        # Build de producción → build/
node server/index.js # Ejecutar build de producción con gzip (var de entorno DATABASE_PATH para la BD)

# Docker
docker compose up    # Build + arranque en puerto 3000, BD persistida en volumen Docker
```

Tests: `npm test` (vitest). Tipos de los `.svelte`: `npm run check` (svelte-check; hay 2 errores conocidos: los callbacks de `makeSlotCallbacks` tipados como `Record<string, unknown>` en `MealCell.svelte` y uno en `+layout.svelte`). Tests en `src/lib/utils/*.test.ts` y `src/lib/server/*.test.ts` (estos últimos usan BD SQLite en memoria — `src/test-setup.ts` fija `DATABASE_PATH=':memory:'` y `src/lib/server/test-helpers.ts` da seeds/reset).

Verificación visual (Playwright): `playwright` está como devDependency. El binario de Chromium se instala una vez con `npx playwright install chromium` (queda en `~/.cache/ms-playwright`). Consultar **[`docs/playwright-gotchas.md`](docs/playwright-gotchas.md)** antes de escribir un test — ahí están los problemas ya resueltos (selectores, media queries en headless, swipe táctil, Svelte). Cuando un test requiera varios intentos para funcionar, documentar el problema en ese fichero.

## Pantallas principales

Menú lateral definido en `src/routes/+layout.svelte`. Orden de aparición:

| Nombre en menú | Ruta | Fichero principal | Descripción |
|---|---|---|---|
| **Semana** | `/week` | `src/routes/week/+page.svelte` | Página más compleja. Vista semanal con slots comida/cena por día. Selector de días móvil (`sm:hidden`) en línea ~658. Estado `selectedDay` controla qué día se muestra en móvil. Actualizaciones optimistas, drag & drop. |
| **Recetas** | `/recipes` | `src/routes/recipes/+page.svelte` | CRUD de recetas. Búsqueda/filtro por tags, importación desde Plantoeat, gestión de imagen (búsqueda DuckDuckGo + recorte). |
| **Programaciones** | `/schedules` | `src/routes/schedules/+page.svelte` | Gestión de recetas programadas (cada N semanas, día y tipo de comida fijos). Muestra simulación de las próximas 9 semanas con conflictos resaltados. |
| **Reglas** | `/rules` | `src/routes/rules/+page.svelte` | Reglas de planificación: `no_more_than` (máx. N veces por semana un tag) y `at_least` (mín. N veces). Se evalúan en cliente y servidor con `ruleChecker.ts`. |
| **Personas** | `/people` | `src/routes/people/+page.svelte` | Alta, renombrado, orden, archivo y foto de las personas. La foto se recorta en el cliente (`PhotoCropper.svelte`: círculo sobre la cara, zoom con rueda) y se sube ya reducida. |
| **Histórico** | `/history` | `src/routes/history/+page.svelte` | Consulta de semanas pasadas en modo lectura. |
| **Opciones** | `/options` | `src/routes/options/+page.svelte` | Ajustes globales de la app (tema de color, sidebar colapsado por defecto, etc.). |

## Arquitectura

Aplicación **SvelteKit** con `@sveltejs/adapter-node` para despliegue en Docker. Todo el acceso a datos es síncrono mediante **better-sqlite3** — no hay llamadas asíncronas a la BD en el lado servidor.

### Capa de datos (`src/lib/db/index.ts`)
Singleton de conexión SQLite. El schema base está incrustado en `db/index.ts` como string. Las columnas y tablas añadidas después del schema inicial viven en `db/migrations.ts` (tabla `schema_migrations` con versiones numeradas). `src/lib/db/schema.sql` es una referencia desactualizada — ignorar. La ruta de la BD por defecto es `./menuplan.db`, sobreescrita por la variable de entorno `DATABASE_PATH`.

**Al modificar el schema de `recipes`:** regenerar `data/sample-recipes.sql` 

**Decisiones clave del schema:**
- **Huecos (`meal_slots`, migración 19)**: cada comida (día + comida/cena) tiene una lista de huecos independientes, sin posiciones fijas. Cada fila es una *versión*: `slot_id` es la identidad del hueco (común a todas sus versiones; la primera versión tiene `id = slot_id`) y la versión rige de `effective_from` a `effective_to` (NULL = sin final). `kind` es `main`/`acc`: los acompañamientos son huecos independientes de la comida, como los platos (la migración 20 borró `parent_slot_id`, la antigua relación con un plato). En pantalla van primero los platos y luego los acompañamientos, en tarjeta horizontal compacta con miniatura; los acompañamientos van en una rejilla `auto-fill` de mín. 150px (`.acc-grid` en `MealCell.svelte`), así que salen dos por fila cuando la columna es ancha (móvil, pantallas grandes) y uno en las columnas estrechas de escritorio. La tarjeta usa container queries (`@container`, `@max-[11rem]:`) para encogerse. Los tags exigidos van en `tags` (CSV) de cada versión. Editar desde una semana actual/futura rige hacia delante (los tags, hasta el siguiente cambio ya existente); desde una semana pasada solo afecta a esa semana. Toda la lógica está en `src/lib/server/mealSlots.ts` (`addSlot`, `removeSlot`, `setSlotTags`). No hay huecos por defecto en tiempo de ejecución: las opciones `meals_per_day` etc. solo se usaron para sembrar la migración.
- `week_plans` solo contiene filas con receta (`recipe_id NOT NULL`, `ON DELETE CASCADE`); vaciar un slot es borrar la fila. Apunta al hueco con `slot_id` (sin FK: `slot_id` se repite entre versiones) y su clave única es `(week_key, slot_id)` (`idx_week_plans_slot`). `weekday`, `meal_type` e `is_accompaniment` se guardan desnormalizados. `schedule_id` anota la programación de la que salió una receta consolidada. Los tags prohibidos se expresan con una regla `no_more_than <tag> 0` (limitada a ciertas personas si hace falta).
- Los tags se almacenan como strings separados por comas en todas partes (recetas, reglas, etc.). Todas las comparaciones de tags hacen lowercase y trim de cada elemento.
- `week_plans.is_accompaniment` (0/1) distingue platos principales de acompañamientos dentro de la misma tabla.
- `week_meal_state` guarda el estado puntual de una comida en una semana (`disabled`/`disabled_comment`/`note`), sin herencia. Quitar el último plato de una comida la desactiva esa semana.
- **Personas**: tabla `people` (con `archived` y foto BLOB) y tablas de unión `week_plan_people`, `schedule_people` y `rule_people` (migración 18). **Sin filas en la unión = para todos.** `week_plan_people` cuelga de `week_plans.id` (`ON DELETE CASCADE`), así que el upsert de `assignRecipe()` conserva las personas si no se le pasan. Cambiar las personas de un slot programado lo materializa en `week_plans` (`setSlotPeople()`). Los acompañamientos no cuentan para reglas.
- **Reglas por persona**: `ruleChecker.ts` cuenta tags con un contador por persona activa (una receta para todos suma a cada una); sin personas activas hay un único contador global (`EVERYONE`). Una regla sin personas se exige a cada persona por separado; con personas, solo a esas. El planificador usa los mismos contadores y deja sus recetas para todos.
- `recipes.image_data` (BLOB) e `image_type` almacenan la imagen de la receta directamente en la BD. Desde la subida se redimensiona a máx. 800px y se guarda como WebP (sharp); `scripts/recompress-images.mjs` recomprime manualmente las imágenes antiguas.

### Módulos de servidor (`src/lib/server/`)
Funciones puras, sin estado. Cada módulo tiene helpers CRUD simples. Destacados:

- **`weekplan.ts`** — `getWeekData()` devuelve la forma completa `WeekData`: `configs[día][comida].slots` (huecos vigentes) + `slots` (recetas por `slot_id`) + violaciones. Las programaciones ocupan el primer hueco libre de su tipo, prefiriendo uno cuyos tags cumpla la receta; `on_conflict='add'` crea un hueco virtual con id `-schedule_id` que `assignRecipe()` materializa como hueco de una sola semana (`resolveSlotId`). `assignRecipe()` usa `INSERT ... ON CONFLICT(week_key, slot_id) DO UPDATE` y devuelve el `slot_id` real.
- **`planner.ts`** — `calculatePlan()` rellena huecos vacíos (por `slot_id`) en orden (Lun→Dom, comida antes que cena). Filtra por tag de tipo de comida → restricciones dietéticas → min_days → reglas no_more_than → prioriza reglas at_least. Relaja min_days un 50% en el reintento si no hay candidatos.
- **`scheduleFreeze.ts`** — consolidación diaria: `consolidateSchedules()` (se llama en `hooks.server.ts` en cada petición; no hace nada si ya está al día) guarda en `week_plans`, con `schedule_id`, lo que las programaciones ponían en los días hasta ayer y adelanta la marca `options.schedules_consolidated_through` (`consolidationMark.ts`). Para los días hasta la marca las programaciones **no** se resuelven al vuelo: lo guardado es definitivo, aunque se vacíe a mano. Toda mutación de programaciones va envuelta en `withFrozenPast()`. `shiftScheduleRotation()` implementa «Pasar a la siguiente» (adelanta la rotación); `delayScheduleRotation()` la retrasa una semana cuando en un día consolidado no se comió lo programado (diálogo `ConsolidatedScheduleDialog.svelte`).
- **`recipes.ts`** — `importPlantoeatRecipes()` parsea el formato de exportación de Plantoeat. Los tags en Plantoeat se separan con ` ^ ` (espacio-acento-espacio), no con comas. `getRecipeImageData()`/`setRecipeImage()`/`clearRecipeImage()` gestionan el BLOB de imagen; las demás funciones usan `RECIPE_COLS` que excluye `image_data` para no cargar el BLOB en queries normales.

### Utilidades compartidas (`src/lib/utils/`)
- **`ruleChecker.ts`** — se ejecuta tanto en cliente como en servidor. Recibe `SlotData[]` + `Rule[]`, cuenta ocurrencias de tags en slots que no son acompañamientos, devuelve las violaciones.
- **`dates.ts`** — cálculo de número de semana ISO (`getWeekKey` devuelve `"YYYY-Www"`). La semana empieza el lunes (weekday 1=Lun, 7=Dom). `weekKeyToIndex`/`indexToWeekKey` convierten entre clave y número de semana-desde-época (siempre usar estas funciones, nunca aritmética manual con `*52`).

### Rutas
- `src/routes/api/` — endpoints REST, todos devuelven JSON. Los endpoints de mutación de semana (`/assign`, `/remove`, `/calculate`, `/clear`, `/copy-previous`, `/config`) aceptan POST con body JSON que incluye `weekKey`.
- `/api/recipes/[id]/image` — GET devuelve el BLOB de imagen con Content-Type, `Cache-Control` de 1 año y ETag (responde 304 a `If-None-Match`); POST recibe JSON `{url}`, descarga la imagen (con validación SSRF y límite de 10 MB) y la guarda redimensionada como WebP; DELETE borra la imagen.
- `/api/image-search` — GET proxy hacia DuckDuckGo Images (obtiene el token `vqd` primero, luego la lista de imágenes). Devuelve array de `{url, thumbnail, title}`.
- `src/routes/week/+page.svelte` — la página principal y más compleja. Usa **actualizaciones optimistas**: `patchSlot()` actualiza `weekData.slots` localmente de forma inmediata (recalculando violaciones con `checkRules` en cliente), luego persiste en la API y revierte el parche si la petición falla. Los huecos se identifican en el cliente por `slot_id` (`SlotCoord.slotId`; negativo = hueco virtual). La celda de cada franja está extraída en `MealCell.svelte` (que usa `EditableNote.svelte` y `SlotAddButtons.svelte`); el drag & drop vive en la clase `WeekDragDrop` (`src/lib/utils/weekDragDrop.svelte.ts`). Las funciones de mutación y el estado siguen en la página y se pasan como callbacks.

### Patrón de reactividad en la página de semana
`weekData` es `$state` (runes de Svelte 5); las mutaciones crean nuevos arrays/objetos y reasignan (`weekData = { ...weekData, slots: newSlots, ... }`). La API `calculatePlan` devuelve el `WeekData` completo y reemplaza `weekData` por completo. `clearPlan`/`copyPrevious`/`updateConfig` llaman a `invalidateAll()`, que re-ejecuta el `load` del servidor; un `$effect` sincroniza `data.*` con el estado local cuando cambia (también al navegar entre semanas con `goto`).

## Notas de despliegue
- Se requiere Node 20 (el sistema puede tener una versión anterior — usar `nvm use 20`).
- La stage runner de Docker instala `python3 make g++` para recompilar los bindings nativos de `better-sqlite3` para la arquitectura destino. `sharp` no necesita rebuild: usa binarios precompilados (`@img/sharp-linuxmusl-*`) que npm instala según plataforma.
- En producción la app se sirve con `server/index.js`, que envuelve el handler de adapter-node con compresión gzip (`@polka/compression`); los assets estáticos se precomprimen en build (`precompress: true`).
- La variable de entorno `ORIGIN` debe estar definida en docker-compose para la protección CSRF de SvelteKit en form actions.
