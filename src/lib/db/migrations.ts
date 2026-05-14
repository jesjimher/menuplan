import Database from 'better-sqlite3';

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
