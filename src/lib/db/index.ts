import Database from 'better-sqlite3';
import { runMigrations } from './migrations.js';

const DB_PATH = process.env.DATABASE_PATH || './menuplan.db';

let db: Database.Database;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS recipes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    description TEXT    NOT NULL DEFAULT '',
    tags        TEXT    NOT NULL DEFAULT '',
    min_days    INTEGER NOT NULL DEFAULT -1,
    image_data  BLOB    DEFAULT NULL,
    image_type  TEXT    DEFAULT NULL,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS members (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    cannot_eat  TEXT    NOT NULL DEFAULT '',
    likes       TEXT    NOT NULL DEFAULT '',
    dislikes    TEXT    NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS rules (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    tag         TEXT    NOT NULL,
    direction   TEXT    NOT NULL CHECK(direction IN ('at_least','no_more_than')),
    times       INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS week_plans (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    week_key         TEXT    NOT NULL,
    weekday          INTEGER NOT NULL,
    meal_type        TEXT    NOT NULL,
    slot_index       INTEGER NOT NULL DEFAULT 0,
    is_accompaniment INTEGER NOT NULL DEFAULT 0,
    recipe_id        INTEGER REFERENCES recipes(id) ON DELETE SET NULL,
    member_id        INTEGER REFERENCES members(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_week_plans_unique
    ON week_plans(week_key, weekday, meal_type, is_accompaniment, slot_index, COALESCE(member_id, -1));

CREATE INDEX IF NOT EXISTS idx_week_plans_recipe_id
    ON week_plans(recipe_id);

CREATE INDEX IF NOT EXISTS idx_week_plans_weekday_meal
    ON week_plans(weekday, meal_type, is_accompaniment);

CREATE TABLE IF NOT EXISTS week_day_config (
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
    UNIQUE(week_key, weekday, meal_type)
);

CREATE TABLE IF NOT EXISTS options (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
INSERT OR IGNORE INTO options VALUES
    ('default_min_days',       '5'),
    ('meals_per_day',          '1'),
    ('dinners_per_day',        '1'),
    ('side_dishes_per_recipe', '1'),
    ('side_dishes_per_slot',   '0'),
    ('sidebar_collapsed_by_default', '0');

CREATE TABLE IF NOT EXISTS schedules (
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
);

CREATE TABLE IF NOT EXISTS schedule_exceptions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    schedule_id INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
    week_key    TEXT    NOT NULL,
    UNIQUE(schedule_id, week_key)
);
`;

export function getDb(): Database.Database {
	if (!db) {
		db = new Database(DB_PATH);
		db.pragma('journal_mode = WAL');
		db.pragma('foreign_keys = ON');
		db.exec(SCHEMA);
		runMigrations(db);
	}
	return db;
}

process.on('SIGTERM', () => { try { db?.close(); } finally { process.exit(0); } });
process.on('SIGINT',  () => { try { db?.close(); } finally { process.exit(0); } });
