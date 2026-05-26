import Database from 'better-sqlite3';
import { getWeekKey, weekKeyToIndex } from '../utils/dates.js';

interface Migration {
	version: number;
	name: string;
	up: (db: Database.Database) => void;
}

function addColumnIfMissing(db: Database.Database, table: string, col: string, definition: string): void {
	const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
	if (!cols.some(c => c.name === col)) {
		db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${definition}`);
	}
}

function tableExists(db: Database.Database, table: string): boolean {
	return !!db.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`).get(table);
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
