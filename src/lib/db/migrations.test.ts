import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from './migrations.js';

// Estado de una BD anterior a la migración 16: con members y week_plans.member_id.
function legacyDb(): Database.Database {
	const db = new Database(':memory:');
	db.pragma('foreign_keys = ON');
	db.exec(`
		CREATE TABLE recipes (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
		CREATE TABLE members (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, cannot_eat TEXT NOT NULL DEFAULT '');
		CREATE TABLE week_plans (
			id               INTEGER PRIMARY KEY AUTOINCREMENT,
			week_key         TEXT    NOT NULL,
			weekday          INTEGER NOT NULL,
			meal_type        TEXT    NOT NULL,
			slot_index       INTEGER NOT NULL DEFAULT 0,
			is_accompaniment INTEGER NOT NULL DEFAULT 0,
			is_leftover      INTEGER NOT NULL DEFAULT 0,
			recipe_id        INTEGER REFERENCES recipes(id) ON DELETE SET NULL,
			member_id        INTEGER REFERENCES members(id) ON DELETE SET NULL
		);
		CREATE UNIQUE INDEX idx_week_plans_unique
			ON week_plans(week_key, weekday, meal_type, is_accompaniment, slot_index, COALESCE(member_id, -1));
		CREATE INDEX idx_week_plans_recipe_id ON week_plans(recipe_id);
		CREATE INDEX idx_week_plans_weekday_meal ON week_plans(weekday, meal_type, is_accompaniment);
		CREATE TABLE schema_migrations (
			version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT (datetime('now'))
		);
	`);
	const mark = db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)');
	for (let v = 1; v <= 15; v++) mark.run(v, `m${v}`);
	return db;
}

describe('migración 16: drop_members_and_rebuild_week_plans', () => {
	it('conserva filas normales y descarta las de miembro y las fantasma', () => {
		const db = legacyDb();
		db.exec(`
			INSERT INTO recipes (name) VALUES ('A'), ('B');
			INSERT INTO members (name, cannot_eat) VALUES ('Ana', 'marisco');
			INSERT INTO week_plans (week_key, weekday, meal_type, slot_index, is_accompaniment, is_leftover, recipe_id, member_id) VALUES
				('2026-W10', 1, 'comida', 0, 0, 0, 1, NULL),  -- se conserva
				('2026-W10', 1, 'comida', 0, 0, 0, 2, 1),     -- plato de miembro: se descarta
				('2026-W10', 2, 'cena',   0, 0, 1, 2, NULL),  -- se conserva (sobras)
				('2026-W10', 3, 'cena',   0, 0, 0, NULL, NULL); -- fantasma: se descarta
		`);

		runMigrations(db);

		const rows = db.prepare('SELECT week_key, weekday, meal_type, is_leftover, recipe_id FROM week_plans ORDER BY weekday').all();
		expect(rows).toEqual([
			{ week_key: '2026-W10', weekday: 1, meal_type: 'comida', is_leftover: 0, recipe_id: 1 },
			{ week_key: '2026-W10', weekday: 2, meal_type: 'cena', is_leftover: 1, recipe_id: 2 }
		]);

		const cols = (db.prepare('PRAGMA table_info(week_plans)').all() as { name: string }[]).map(c => c.name);
		expect(cols).not.toContain('member_id');
		expect(db.prepare(`SELECT 1 FROM sqlite_master WHERE name = 'members'`).get()).toBeUndefined();
	});

	it('el nuevo índice único rechaza dos filas en el mismo slot', () => {
		const db = legacyDb();
		db.exec(`INSERT INTO recipes (name) VALUES ('A'), ('B')`);
		runMigrations(db);

		const ins = db.prepare(`INSERT INTO week_plans (week_key, weekday, meal_type, slot_index, is_accompaniment, recipe_id) VALUES ('2026-W10', 1, 'comida', 0, 0, ?)`);
		ins.run(1);
		expect(() => ins.run(2)).toThrow(/UNIQUE/);
	});

	it('borrar una receta borra sus filas de plan (ya no quedan fantasmas)', () => {
		const db = legacyDb();
		db.exec(`INSERT INTO recipes (name) VALUES ('A'), ('B')`);
		runMigrations(db);

		db.exec(`
			INSERT INTO week_plans (week_key, weekday, meal_type, slot_index, is_accompaniment, recipe_id) VALUES
				('2026-W10', 1, 'comida', 0, 0, 1),
				('2026-W10', 2, 'comida', 0, 0, 2);
		`);
		db.prepare('DELETE FROM recipes WHERE id = 1').run();

		expect(db.prepare('SELECT recipe_id FROM week_plans').all()).toEqual([{ recipe_id: 2 }]);
	});

	it('recrea los índices y es idempotente al ejecutarse de nuevo', () => {
		const db = legacyDb();
		runMigrations(db);
		runMigrations(db);

		const idx = (db.prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'week_plans'`).all() as { name: string }[]).map(i => i.name);
		expect(idx).toEqual(expect.arrayContaining(['idx_week_plans_unique', 'idx_week_plans_recipe_id', 'idx_week_plans_weekday_meal']));
	});
});

// Estado anterior a la migración 17: week_day_config con sticky y required_tag en JSON.
function legacyDbWithConfig(): Database.Database {
	const db = new Database(':memory:');
	db.pragma('foreign_keys = ON');
	db.exec(`
		CREATE TABLE week_day_config (
			id                         INTEGER PRIMARY KEY AUTOINCREMENT,
			week_key                   TEXT    NOT NULL,
			weekday                    INTEGER NOT NULL,
			meal_type                  TEXT    NOT NULL,
			recipe_count               INTEGER NOT NULL DEFAULT 1,
			accompaniment_per_recipe   INTEGER NOT NULL DEFAULT 1,
			accompaniment_per_slot     INTEGER NOT NULL DEFAULT 0,
			required_tag               TEXT    DEFAULT NULL,
			disabled                   INTEGER NOT NULL DEFAULT 0,
			disabled_comment           TEXT    DEFAULT NULL,
			note                       TEXT    DEFAULT NULL,
			sticky                     INTEGER NOT NULL DEFAULT 0,
			UNIQUE(week_key, weekday, meal_type)
		);
		CREATE TABLE schema_migrations (
			version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT (datetime('now'))
		);
	`);
	const mark = db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)');
	for (let v = 1; v <= 16; v++) mark.run(v, `m${v}`);
	return db;
}

describe('migración 17: split_week_day_config', () => {
	function seed(db: Database.Database) {
		const ins = db.prepare(`
			INSERT INTO week_day_config (week_key, weekday, meal_type, recipe_count, accompaniment_per_recipe, accompaniment_per_slot, required_tag, disabled, disabled_comment, note, sticky)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`);
		ins.run('2026-W20', 1, 'comida', 2, 1, 0, 'pasta', 0, null, null, 1);               // string plano
		ins.run('2026-W22', 1, 'comida', 3, 2, 1, '["a","b"]', 0, null, null, 1);            // un string por slot
		ins.run('2026-W15', 2, 'cena', 1, 1, 0, '[["x","y"],[],["z"]]', 1, 'fuera', 'n', 0); // array de arrays, semana pasada
		ins.run('2026-W16', 3, 'comida', 1, 1, 0, null, 0, null, null, 1);                   // sin tags ni estado
	}

	it('copia la capacidad: sticky sin límite, no sticky limitada a su semana', () => {
		const db = legacyDbWithConfig();
		seed(db);
		runMigrations(db);

		const rows = db.prepare(`
			SELECT weekday, meal_type, effective_from, effective_to, recipe_count, accompaniment_per_recipe, accompaniment_per_slot
			FROM meal_config ORDER BY effective_from
		`).all();
		expect(rows).toEqual([
			{ weekday: 2, meal_type: 'cena', effective_from: '2026-W15', effective_to: '2026-W15', recipe_count: 1, accompaniment_per_recipe: 1, accompaniment_per_slot: 0 },
			{ weekday: 3, meal_type: 'comida', effective_from: '2026-W16', effective_to: null, recipe_count: 1, accompaniment_per_recipe: 1, accompaniment_per_slot: 0 },
			{ weekday: 1, meal_type: 'comida', effective_from: '2026-W20', effective_to: null, recipe_count: 2, accompaniment_per_recipe: 1, accompaniment_per_slot: 0 },
			{ weekday: 1, meal_type: 'comida', effective_from: '2026-W22', effective_to: null, recipe_count: 3, accompaniment_per_recipe: 2, accompaniment_per_slot: 1 }
		]);
	});

	it('normaliza los tres formatos de required_tag a filas por slot', () => {
		const db = legacyDbWithConfig();
		seed(db);
		runMigrations(db);

		const tags = db.prepare(`
			SELECT c.effective_from AS week, t.slot_index AS slot, t.tag
			FROM meal_config_required_tags t JOIN meal_config c ON c.id = t.config_id
			ORDER BY c.effective_from, t.slot_index, t.rowid
		`).all();
		expect(tags).toEqual([
			{ week: '2026-W15', slot: 0, tag: 'x' },
			{ week: '2026-W15', slot: 0, tag: 'y' },
			{ week: '2026-W15', slot: 2, tag: 'z' },
			{ week: '2026-W20', slot: 0, tag: 'pasta' },
			{ week: '2026-W22', slot: 0, tag: 'a' },
			{ week: '2026-W22', slot: 1, tag: 'b' }
		]);
	});

	it('mueve disabled/comentario/nota a week_meal_state solo cuando hay algo que guardar', () => {
		const db = legacyDbWithConfig();
		seed(db);
		runMigrations(db);

		expect(db.prepare('SELECT * FROM week_meal_state').all()).toEqual([
			{ week_key: '2026-W15', weekday: 2, meal_type: 'cena', disabled: 1, disabled_comment: 'fuera', note: 'n' }
		]);
	});

	it('elimina week_day_config y no falla al ejecutarse de nuevo', () => {
		const db = legacyDbWithConfig();
		seed(db);
		runMigrations(db);
		runMigrations(db);
		expect(db.prepare(`SELECT 1 FROM sqlite_master WHERE name = 'week_day_config'`).get()).toBeUndefined();
	});

	it('borrar una vigencia borra sus tags exigidos (ON DELETE CASCADE)', () => {
		const db = legacyDbWithConfig();
		seed(db);
		runMigrations(db);
		db.prepare(`DELETE FROM meal_config WHERE effective_from = '2026-W20'`).run();
		const left = db.prepare(`SELECT COUNT(*) AS n FROM meal_config_required_tags WHERE tag = 'pasta'`).get() as { n: number };
		expect(left.n).toBe(0);
	});
});
