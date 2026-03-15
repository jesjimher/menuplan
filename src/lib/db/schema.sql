CREATE TABLE IF NOT EXISTS recipes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    description TEXT    NOT NULL DEFAULT '',
    tags        TEXT    NOT NULL DEFAULT '',
    min_days    INTEGER NOT NULL DEFAULT -1,
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
    member_id        INTEGER REFERENCES members(id) ON DELETE SET NULL,
    UNIQUE(week_key, weekday, meal_type, is_accompaniment, slot_index, COALESCE(member_id, -1))
);

CREATE TABLE IF NOT EXISTS week_day_config (
    id                         INTEGER PRIMARY KEY AUTOINCREMENT,
    week_key                   TEXT    NOT NULL,
    weekday                    INTEGER NOT NULL,
    meal_type                  TEXT    NOT NULL,
    recipe_count               INTEGER NOT NULL DEFAULT 1,
    accompaniment_per_recipe   INTEGER NOT NULL DEFAULT 1,
    accompaniment_per_slot     INTEGER NOT NULL DEFAULT 0,
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
    ('side_dishes_per_slot',   '0');
