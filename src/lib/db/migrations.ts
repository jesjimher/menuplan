import Database from 'better-sqlite3';
import { getWeekKey, weekKeyToIndex } from '../utils/dates.js';

interface Migration {
	version: number;
	name: string;
	up: (db: Database.Database) => void;
}

function columnExists(db: Database.Database, table: string, col: string): boolean {
	const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
	return cols.some(c => c.name === col);
}

// No-op si la tabla no existe: en BD nueva el SCHEMA base ya trae el estado final y las tablas
// que una migración posterior elimina (week_day_config) ya no se crean.
function addColumnIfMissing(db: Database.Database, table: string, col: string, definition: string): void {
	if (tableExists(db, table) && !columnExists(db, table, col)) {
		db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${definition}`);
	}
}

function tableExists(db: Database.Database, table: string): boolean {
	return !!db.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`).get(table);
}

// Formatos históricos de week_day_config.required_tag: string plano (primer slot), JSON de
// strings (uno por slot) o JSON de arrays de strings (varios tags por slot).
function parseLegacyRequiredTags(raw: string | null): string[][] {
	if (!raw) return [];
	try {
		const parsed = JSON.parse(raw);
		if (Array.isArray(parsed)) {
			return parsed.map(item => {
				if (Array.isArray(item)) return item.filter((t): t is string => typeof t === 'string' && !!t);
				if (typeof item === 'string' && item) return [item];
				return [];
			});
		}
		if (typeof parsed === 'string' && parsed) return [[parsed]];
		return [];
	} catch {
		return [[raw]];
	}
}

const MIGRATIONS: Migration[] = [
	{
		version: 1,
		name: 'add_week_day_config_required_tag',
		up: (db) => addColumnIfMissing(db, 'week_day_config', 'required_tag', 'TEXT DEFAULT NULL')
	},
	{
		version: 2,
		name: 'add_week_day_config_disabled',
		up: (db) => addColumnIfMissing(db, 'week_day_config', 'disabled', 'INTEGER NOT NULL DEFAULT 0')
	},
	{
		version: 3,
		name: 'add_week_day_config_disabled_comment',
		up: (db) => addColumnIfMissing(db, 'week_day_config', 'disabled_comment', 'TEXT DEFAULT NULL')
	},
	{
		version: 4,
		name: 'add_recipes_image_data',
		up: (db) => addColumnIfMissing(db, 'recipes', 'image_data', 'BLOB DEFAULT NULL')
	},
	{
		version: 5,
		name: 'add_recipes_image_type',
		up: (db) => addColumnIfMissing(db, 'recipes', 'image_type', 'TEXT DEFAULT NULL')
	},
	{
		version: 6,
		name: 'add_week_day_config_note',
		up: (db) => addColumnIfMissing(db, 'week_day_config', 'note', 'TEXT DEFAULT NULL')
	},
	{
		version: 7,
		name: 'create_schedules',
		up: (db) => {
			if (!tableExists(db, 'schedules')) {
				db.exec(`CREATE TABLE schedules (
					id               INTEGER PRIMARY KEY AUTOINCREMENT,
					recipe_id        INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
					weekday          INTEGER NOT NULL,
					meal_type        TEXT    NOT NULL,
					slot_index       INTEGER NOT NULL DEFAULT 0,
					is_accompaniment INTEGER NOT NULL DEFAULT 0,
					every_n_weeks    INTEGER NOT NULL DEFAULT 1,
					anchor_week_key  TEXT    NOT NULL,
					created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
					UNIQUE(weekday, meal_type, slot_index, is_accompaniment)
				)`);
			}
		}
	},
	{
		version: 8,
		name: 'create_schedule_exceptions',
		up: (db) => {
			if (!tableExists(db, 'schedule_exceptions')) {
				db.exec(`CREATE TABLE schedule_exceptions (
					id          INTEGER PRIMARY KEY AUTOINCREMENT,
					schedule_id INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
					week_key    TEXT    NOT NULL,
					UNIQUE(schedule_id, week_key)
				)`);
			}
		}
	},
	{
		version: 9,
		name: 'add_options_sidebar_collapsed',
		up: (db) => {
			db.exec("INSERT OR IGNORE INTO options VALUES ('sidebar_collapsed_by_default', '0')");
		}
	},
	{
		version: 10,
		name: 'add_week_plans_is_leftover',
		up: (db) => addColumnIfMissing(db, 'week_plans', 'is_leftover', 'INTEGER NOT NULL DEFAULT 0')
	},
	{
		version: 11,
		name: 'add_week_day_config_sticky',
		up: (db) => {
			addColumnIfMissing(db, 'week_day_config', 'sticky', 'INTEGER NOT NULL DEFAULT 0');
			if (!tableExists(db, 'week_day_config')) return;
			const todayIdx = weekKeyToIndex(getWeekKey());
			const rows = db.prepare('SELECT id, week_key FROM week_day_config').all() as { id: number; week_key: string }[];
			const upd = db.prepare('UPDATE week_day_config SET sticky = 1 WHERE id = ?');
			for (const r of rows) {
				if (weekKeyToIndex(r.week_key) >= todayIdx) upd.run(r.id);
			}
		}
	},
	{
		version: 12,
		name: 'schedules_unique_per_recipe_slot',
		up: (db) => {
			// Recreate schedules with UNIQUE(recipe_id, weekday, ...) so multiple recipes can be
			// scheduled for the same slot position (e.g. alternating weeks).
			db.pragma('foreign_keys = OFF');
			db.exec(`
				CREATE TABLE IF NOT EXISTS schedules_new (
					id               INTEGER PRIMARY KEY AUTOINCREMENT,
					recipe_id        INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
					weekday          INTEGER NOT NULL,
					meal_type        TEXT    NOT NULL,
					slot_index       INTEGER NOT NULL DEFAULT 0,
					is_accompaniment INTEGER NOT NULL DEFAULT 0,
					every_n_weeks    INTEGER NOT NULL DEFAULT 1,
					anchor_week_key  TEXT    NOT NULL,
					created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
					UNIQUE(recipe_id, weekday, meal_type, slot_index, is_accompaniment)
				);
				INSERT OR IGNORE INTO schedules_new SELECT * FROM schedules;
				DROP TABLE schedules;
				ALTER TABLE schedules_new RENAME TO schedules;
			`);
			db.pragma('foreign_keys = ON');
		}
	},
	{
		version: 13,
		name: 'add_schedules_on_conflict_and_priority',
		up: (db) => {
			addColumnIfMissing(db, 'schedules', 'on_conflict', "TEXT NOT NULL DEFAULT 'skip'");
			addColumnIfMissing(db, 'schedules', 'priority', 'INTEGER NOT NULL DEFAULT 10');
		}
	},
	{
		version: 14,
		name: 'cleanup_materialized_schedule_rows',
		up: (db) => {
			// En BD nueva week_plans ya no tiene member_id (y está vacía): nada que limpiar
			if (!columnExists(db, 'week_plans', 'member_id')) return;
			const currentWeekKey = getWeekKey();
			db.prepare(`
				DELETE FROM week_plans
				WHERE week_key >= ?
				  AND member_id IS NULL
				  AND recipe_id IS NOT NULL
				  AND EXISTS (
				    SELECT 1 FROM schedules s
				    WHERE s.recipe_id = week_plans.recipe_id
				      AND s.weekday = week_plans.weekday
				      AND s.meal_type = week_plans.meal_type
				      AND s.is_accompaniment = week_plans.is_accompaniment
				  )
			`).run(currentWeekKey);
		}
	},
	{
		version: 15,
		name: 'schedules_meal_level',
		up: (db) => {
			db.pragma('foreign_keys = OFF');
			db.exec(`
				CREATE TABLE IF NOT EXISTS schedules_new (
					id               INTEGER PRIMARY KEY AUTOINCREMENT,
					recipe_id        INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
					weekday          INTEGER NOT NULL,
					meal_type        TEXT    NOT NULL,
					is_accompaniment INTEGER NOT NULL DEFAULT 0,
					every_n_weeks    INTEGER NOT NULL DEFAULT 1,
					anchor_week_key  TEXT    NOT NULL,
					on_conflict      TEXT    NOT NULL DEFAULT 'skip',
					priority         INTEGER NOT NULL DEFAULT 5,
					created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
					UNIQUE(recipe_id, weekday, meal_type, is_accompaniment)
				);
				INSERT OR IGNORE INTO schedules_new (id, recipe_id, weekday, meal_type, is_accompaniment, every_n_weeks, anchor_week_key, on_conflict, priority, created_at)
					SELECT id, recipe_id, weekday, meal_type, is_accompaniment, every_n_weeks, anchor_week_key, on_conflict, 5, created_at
					FROM schedules;
				DROP TABLE schedules;
				ALTER TABLE schedules_new RENAME TO schedules;
			`);
			db.pragma('foreign_keys = ON');
		}
	},
	{
		version: 16,
		name: 'drop_members_and_rebuild_week_plans',
		up: (db) => {
			// Los miembros nunca se usaron en la UI (member_id siempre NULL). week_plans se recrea
			// sin member_id, con recipe_id NOT NULL + ON DELETE CASCADE (antes SET NULL dejaba filas
			// fantasma) y con el índice único ya sin COALESCE(member_id, -1).
			// En BD nueva el SCHEMA base ya crea la tabla así: no hay nada que reconstruir.
			if (columnExists(db, 'week_plans', 'member_id')) {
				db.exec(`
					CREATE TABLE week_plans_new (
						id               INTEGER PRIMARY KEY AUTOINCREMENT,
						week_key         TEXT    NOT NULL,
						weekday          INTEGER NOT NULL,
						meal_type        TEXT    NOT NULL,
						slot_index       INTEGER NOT NULL DEFAULT 0,
						is_accompaniment INTEGER NOT NULL DEFAULT 0,
						is_leftover      INTEGER NOT NULL DEFAULT 0,
						recipe_id        INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE
					);
					INSERT INTO week_plans_new (id, week_key, weekday, meal_type, slot_index, is_accompaniment, is_leftover, recipe_id)
						SELECT id, week_key, weekday, meal_type, slot_index, is_accompaniment, is_leftover, recipe_id
						FROM week_plans
						WHERE recipe_id IS NOT NULL AND member_id IS NULL;
					DROP TABLE week_plans;
					ALTER TABLE week_plans_new RENAME TO week_plans;
					CREATE UNIQUE INDEX idx_week_plans_unique
						ON week_plans(week_key, weekday, meal_type, is_accompaniment, slot_index);
					CREATE INDEX idx_week_plans_recipe_id ON week_plans(recipe_id);
					CREATE INDEX idx_week_plans_weekday_meal ON week_plans(weekday, meal_type, is_accompaniment);
				`);
			}
			db.exec('DROP TABLE IF EXISTS members');
		}
	},
	{
		version: 17,
		name: 'split_week_day_config',
		up: (db) => {
			// En BD existente el SCHEMA base ya crea estas tablas; se repite el DDL para que la
			// migración sea autosuficiente (mismo patrón que schedules en las migraciones 7 y 8).
			db.exec(`
				CREATE TABLE IF NOT EXISTS meal_config (
					id                       INTEGER PRIMARY KEY AUTOINCREMENT,
					weekday                  INTEGER NOT NULL,
					meal_type                TEXT    NOT NULL,
					effective_from           TEXT    NOT NULL,
					effective_to             TEXT    DEFAULT NULL,
					recipe_count             INTEGER NOT NULL DEFAULT 1,
					accompaniment_per_recipe INTEGER NOT NULL DEFAULT 1,
					accompaniment_per_slot   INTEGER NOT NULL DEFAULT 0,
					UNIQUE(weekday, meal_type, effective_from)
				);
				CREATE TABLE IF NOT EXISTS meal_config_required_tags (
					config_id  INTEGER NOT NULL REFERENCES meal_config(id) ON DELETE CASCADE,
					slot_index INTEGER NOT NULL,
					tag        TEXT    NOT NULL,
					UNIQUE(config_id, slot_index, tag)
				);
				CREATE TABLE IF NOT EXISTS week_meal_state (
					week_key         TEXT    NOT NULL,
					weekday          INTEGER NOT NULL,
					meal_type        TEXT    NOT NULL,
					disabled         INTEGER NOT NULL DEFAULT 0,
					disabled_comment TEXT    DEFAULT NULL,
					note             TEXT    DEFAULT NULL,
					PRIMARY KEY (week_key, weekday, meal_type)
				);
			`);
			if (!tableExists(db, 'week_day_config')) return;

			// Copia fiel fila a fila: sticky=1 → vigencia sin límite; sticky=0 → override de esa semana.
			const rows = db.prepare('SELECT * FROM week_day_config ORDER BY week_key').all() as {
				week_key: string; weekday: number; meal_type: string;
				recipe_count: number; accompaniment_per_recipe: number; accompaniment_per_slot: number;
				required_tag: string | null; disabled: number; disabled_comment: string | null;
				note: string | null; sticky: number;
			}[];
			const insCfg = db.prepare(`
				INSERT INTO meal_config (weekday, meal_type, effective_from, effective_to, recipe_count, accompaniment_per_recipe, accompaniment_per_slot)
				VALUES (?, ?, ?, ?, ?, ?, ?)
			`);
			const insTag = db.prepare('INSERT OR IGNORE INTO meal_config_required_tags (config_id, slot_index, tag) VALUES (?, ?, ?)');
			const insState = db.prepare(`
				INSERT OR REPLACE INTO week_meal_state (week_key, weekday, meal_type, disabled, disabled_comment, note)
				VALUES (?, ?, ?, ?, ?, ?)
			`);
			for (const r of rows) {
				const id = insCfg.run(
					r.weekday, r.meal_type, r.week_key, r.sticky ? null : r.week_key,
					r.recipe_count, r.accompaniment_per_recipe, r.accompaniment_per_slot
				).lastInsertRowid as number;
				parseLegacyRequiredTags(r.required_tag).forEach((tags, slotIndex) => {
					for (const tag of tags) insTag.run(id, slotIndex, tag);
				});
				if (r.disabled || r.disabled_comment || r.note) {
					insState.run(r.week_key, r.weekday, r.meal_type, r.disabled ? 1 : 0, r.disabled_comment, r.note);
				}
			}
			db.exec('DROP TABLE week_day_config');
		}
	}
];

export function runMigrations(db: Database.Database): void {
	db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
		version    INTEGER PRIMARY KEY,
		name       TEXT NOT NULL,
		applied_at TEXT NOT NULL DEFAULT (datetime('now'))
	)`);

	const applied = new Set(
		(db.prepare('SELECT version FROM schema_migrations').all() as { version: number }[]).map(r => r.version)
	);

	const insert = db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)');

	for (const m of MIGRATIONS) {
		if (applied.has(m.version)) continue;
		db.transaction(() => {
			m.up(db);
			insert.run(m.version, m.name);
		})();
	}
}
