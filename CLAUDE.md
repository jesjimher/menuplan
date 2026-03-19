# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Comandos

```bash
# Desarrollo (requiere Node 20 vía nvm)
source ~/.nvm/nvm.sh && nvm use 20
npm run dev          # Servidor Vite con hot reload, puerto por defecto 5173
npm run build        # Build de producción → build/
node build/index.js  # Ejecutar build de producción (var de entorno DATABASE_PATH para la BD)

# Docker
docker compose up    # Build + arranque en puerto 3000, BD persistida en volumen Docker
```

No hay test runner configurado.

## Arquitectura

Aplicación **SvelteKit** con `@sveltejs/adapter-node` para despliegue en Docker. Todo el acceso a datos es síncrono mediante **better-sqlite3** — no hay llamadas asíncronas a la BD en el lado servidor.

### Capa de datos (`src/lib/db/index.ts`)
Singleton de conexión SQLite. El schema está incrustado como constante de string (no se lee el fichero `.sql` en tiempo de ejecución — existe solo como referencia — para evitar problemas de bundling). La ruta de la BD por defecto es `./menuplan.db`, sobreescrita por la variable de entorno `DATABASE_PATH`.

**Al modificar el schema de `recipes`:** regenerar `data/sample-recipes.sql` ejecutando:
```bash
/usr/bin/sqlite3 menuplan.db ".dump recipes" | grep "^INSERT INTO recipes" > /tmp/recipes_inserts.sql
{ echo "-- Recetas de ejemplo para menuplan"; echo "-- Importar con: sqlite3 menuplan.db < data/sample-recipes.sql"; echo "-- O desde Node: better-sqlite3 exec(readFileSync('data/sample-recipes.sql', 'utf8'))"; echo ""; cat /tmp/recipes_inserts.sql; } > data/sample-recipes.sql
```

**Decisiones clave del schema:**
- `week_plans.member_id` es nullable (NULL = para todos los miembros). La restricción UNIQUE usa un `CREATE UNIQUE INDEX` separado con `COALESCE(member_id, -1)` porque SQLite no admite expresiones en restricciones `UNIQUE()` inline.
- Los tags se almacenan como strings separados por comas en todas partes (recetas, restricciones de miembros, etc.). Todas las comparaciones de tags hacen lowercase y trim de cada elemento.
- `week_plans.is_accompaniment` (0/1) distingue platos principales de acompañamientos dentro de la misma tabla.
- `week_day_config` sobreescribe las opciones globales por combinación (week_key, weekday, meal_type).

### Módulos de servidor (`src/lib/server/`)
Funciones puras, sin estado. Cada módulo tiene helpers CRUD simples. Destacados:

- **`weekplan.ts`** — `getWeekData()` devuelve la forma completa `WeekData` (slots + configuraciones por día + violaciones de reglas) con una única consulta JOIN. `assignRecipe()` usa `INSERT ... ON CONFLICT ... DO UPDATE` — el target del conflicto debe coincidir con el índice de expresión.
- **`planner.ts`** — `calculatePlan()` rellena slots vacíos en orden (Lun→Dom, comida antes que cena). Filtra por tag de tipo de comida → restricciones dietéticas → min_days → reglas no_more_than → prioriza reglas at_least. Relaja min_days un 50% en el reintento si no hay candidatos.
- **`recipes.ts`** — `importPlantoeatRecipes()` parsea el formato de exportación de Plantoeat. Los tags en Plantoeat se separan con ` ^ ` (espacio-acento-espacio), no con comas.

### Utilidades compartidas (`src/lib/utils/`)
- **`ruleChecker.ts`** — se ejecuta tanto en cliente como en servidor. Recibe `SlotData[]` + `Rule[]`, cuenta ocurrencias de tags en slots que no son acompañamientos, devuelve las violaciones.
- **`dates.ts`** — cálculo de número de semana ISO (`getWeekKey` devuelve `"YYYY-Www"`). La semana empieza el lunes (weekday 1=Lun, 7=Dom).

### Rutas
- `src/routes/api/` — endpoints REST, todos devuelven JSON. Los endpoints de mutación de semana (`/assign`, `/remove`, `/calculate`, `/clear`, `/copy-previous`, `/config`) aceptan POST con body JSON que incluye `weekKey`.
- `src/routes/week/+page.svelte` — la página principal y más compleja. Usa **actualizaciones optimistas**: los cambios de slot actualizan `weekData.slots` localmente de forma inmediata, luego persisten en la API y llaman a `refreshViolations()` en background. El flag `initialLoading` (true solo en el primer montaje) controla el spinner de carga — los refrescos posteriores de datos nunca ocultan la grid.

### Patrón de reactividad en la página de semana
`weekData` es una variable `let` reactiva. Las mutaciones la parchean in-place y luego se reasigna (`weekData = weekData`) para disparar la reactividad de Svelte. La API `calculatePlan` devuelve el `WeekData` completo y reemplaza `weekData` por completo. `clearPlan`/`copyPrevious`/`updateConfig` llaman a `loadWeek()` que reemplaza `weekData` silenciosamente sin mostrar spinner.

## Notas de despliegue
- Se requiere Node 20 (el sistema puede tener una versión anterior — usar `nvm use 20`).
- La stage runner de Docker instala `python3 make g++` para recompilar los bindings nativos de `better-sqlite3` para la arquitectura destino.
- La variable de entorno `ORIGIN` debe estar definida en docker-compose para la protección CSRF de SvelteKit en form actions.
