// Setup global de vitest: fuerza la BD SQLite en memoria antes de que
// cualquier test importe $lib/db (DATABASE_PATH se lee al crear el singleton).
process.env.DATABASE_PATH = ':memory:';
