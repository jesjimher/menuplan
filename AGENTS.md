# AGENTS.md

## Git
- **Read-only**: Never run git write operations (commit, push, merge, etc.). Only `git status`, `git diff`, `git log`.

## Development
- Requires Node 20 via nvm: `source ~/.nvm/nvm.sh && nvm use 20`
- `npm run dev` - Dev server on port 5173
- `npm run build` - Production build to `build/`
- `node build/index.js` - Run production build (set `DATABASE_PATH` env var)
- `docker compose up` - Full stack on port 3000, DB persisted in Docker volume
- No test runner configured (don't try to run tests)

## Architecture
- SvelteKit with `@sveltejs/adapter-node`
- Synchronous SQLite via `better-sqlite3` (no async DB calls)
- DB schema is hardcoded as string constant in `src/lib/db/index.ts` — not read from `.sql` files
- Default DB path: `./menuplan.db`, override with `DATABASE_PATH` env var
- Recipe images stored as BLOB in SQLite (`image_data` column)

## Key Files
- `src/lib/db/index.ts` - Database singleton and schema
- `src/lib/server/weekplan.ts` - Week planning CRUD
- `src/lib/server/planner.ts` - Auto-plan calculation logic
- `src/routes/week/+page.svelte` - Main UI with optimistic updates
- `src/routes/api/*` - REST endpoints (POST handlers returning JSON)

## Docker Build
- Dockerfile installs `python3 make g++` to recompile native `better-sqlite3` bindings
- `ORIGIN` env var required in docker-compose for SvelteKit CSRF protection