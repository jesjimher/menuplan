import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { migrateToMealSlots } from './migrateMealSlots.js';
import { getWeekKey, weekKeyToIndex, indexToWeekKey } from '$lib/utils/dates.js';

const NOW = weekKeyToIndex(getWeekKey());
const wk = (offset: number) => indexToWeekKey(NOW + offset);

// Esquema anterior a la migración 19 (solo lo que la migración toca)
function legacyDb(): Database.Database {
	const db = new Database(':memory:');
	db.exec(`
		CREATE TABLE options (key TEXT PRIMARY KEY, value TEXT NOT NULL);
		INSERT INTO options VALUES ('meals_per_day','1'),('dinners_per_day','1'),('side_dishes_per_recipe','0'),('side_dishes_per_slot','0');
		CREATE TABLE schedules (id INTEGER PRIMARY KEY, anchor_week_key TEXT NOT NULL);
		CREATE TABLE week_plans (
			id INTEGER PRIMARY KEY AUTOINCREMENT, week_key TEXT NOT NULL, weekday INTEGER NOT NULL,
			meal_type TEXT NOT NULL, slot_index INTEGER NOT NULL DEFAULT 0, is_accompaniment INTEGER NOT NULL DEFAULT 0,
			is_leftover INTEGER NOT NULL DEFAULT 0, recipe_id INTEGER NOT NULL
		);
		CREATE UNIQUE INDEX idx_week_plans_unique ON week_plans(week_key, weekday, meal_type, is_accompaniment, slot_index);
		CREATE TABLE meal_config (
			id INTEGER PRIMARY KEY AUTOINCREMENT, weekday INTEGER NOT NULL, meal_type TEXT NOT NULL,
			effective_from TEXT NOT NULL, effective_to TEXT DEFAULT NULL, recipe_count INTEGER NOT NULL DEFAULT 1,
			accompaniment_per_recipe INTEGER NOT NULL DEFAULT 1, accompaniment_per_slot INTEGER NOT NULL DEFAULT 0
		);
		CREATE TABLE meal_config_required_tags (config_id INTEGER NOT NULL, slot_index INTEGER NOT NULL, tag TEXT NOT NULL);
		CREATE TABLE meal_slots (
			id INTEGER PRIMARY KEY AUTOINCREMENT, slot_id INTEGER NOT NULL, weekday INTEGER NOT NULL, meal_type TEXT NOT NULL,
			kind TEXT NOT NULL, parent_slot_id INTEGER DEFAULT NULL, effective_from TEXT NOT NULL, effective_to TEXT DEFAULT NULL,
			position INTEGER NOT NULL DEFAULT 0, tags TEXT NOT NULL DEFAULT ''
		);
	`);
	return db;
}

function config(db: Database.Database, from: string, to: string | null, count: number, tags: string[][] = [], apr = 0, aps = 0): void {
	const id = db.prepare(`INSERT INTO meal_config (weekday, meal_type, effective_from, effective_to, recipe_count, accompaniment_per_recipe, accompaniment_per_slot)
		VALUES (1, 'comida', ?, ?, ?, ?, ?)`).run(from, to, count, apr, aps).lastInsertRowid;
	tags.forEach((list, i) => list.forEach(t => db.prepare('INSERT INTO meal_config_required_tags VALUES (?, ?, ?)').run(id, i, t)));
}

function plan(db: Database.Database, week: string, index: number, isAcc = 0): number {
	return db.prepare('INSERT INTO week_plans (week_key, weekday, meal_type, slot_index, is_accompaniment, recipe_id) VALUES (?, 1, \'comida\', ?, ?, 1)')
		.run(week, index, isAcc).lastInsertRowid as number;
}

/** Huecos de lunes-comida vigentes en una semana: [kind, tags, parent?] */
function slotsAt(db: Database.Database, week: string) {
	return db.prepare(`SELECT slot_id, kind, tags, parent_slot_id FROM meal_slots
		WHERE weekday = 1 AND meal_type = 'comida' AND effective_from <= ? AND (effective_to IS NULL OR effective_to >= ?)
		ORDER BY kind DESC, position`).all(week, week) as { slot_id: number; kind: string; tags: string; parent_slot_id: number | null }[];
}

describe('migración a huecos independientes', () => {
	it('convierte posiciones en huecos estables y versiona solo los cambios de tags', () => {
		const db = legacyDb();
		config(db, wk(-4), null, 2, [['trabajo'], ['rápido']]);
		config(db, wk(-1), null, 2, [['trabajo'], ['carne']]);
		const p = plan(db, wk(-2), 1);
		migrateToMealSlots(db);

		const before = slotsAt(db, wk(-2));
		const after = slotsAt(db, wk(0));
		expect(before.map(s => s.tags)).toEqual(['trabajo', 'rápido']);
		expect(after.map(s => s.tags)).toEqual(['trabajo', 'carne']);
		// Mismo hueco antes y después: solo hay una versión nueva del segundo
		expect(after.map(s => s.slot_id)).toEqual(before.map(s => s.slot_id));
		const row = db.prepare('SELECT slot_id FROM week_plans WHERE id = ?').get(p) as { slot_id: number };
		expect(row.slot_id).toBe(before[1].slot_id);
		expect(db.prepare("SELECT name FROM sqlite_master WHERE name IN ('meal_config','meal_config_required_tags')").all()).toEqual([]);
	});

	it('bajar el contador cierra el último hueco y subirlo abre uno nuevo', () => {
		const db = legacyDb();
		config(db, wk(-6), null, 2);
		config(db, wk(-4), null, 1);
		config(db, wk(-2), null, 2);
		migrateToMealSlots(db);
		const a = slotsAt(db, wk(-5)).map(s => s.slot_id);
		const b = slotsAt(db, wk(-3)).map(s => s.slot_id);
		const c = slotsAt(db, wk(0)).map(s => s.slot_id);
		expect(b).toEqual([a[0]]);
		expect(c[0]).toBe(a[0]);
		expect(c[1]).not.toBe(a[1]);
	});

	it('trata las recetas ocultas según cuándo empezó la configuración de su semana', () => {
		const db = legacyDb();
		config(db, wk(-6), null, 2);
		config(db, wk(-4), null, 1);
		const descartada = plan(db, wk(-3), 1); // el contador se bajó antes de esa semana
		const ambigua = plan(db, wk(-4), 1);    // se bajó esa misma semana
		migrateToMealSlots(db);

		expect(db.prepare('SELECT 1 FROM week_plans WHERE id = ?').get(descartada)).toBeUndefined();
		const row = db.prepare('SELECT slot_id FROM week_plans WHERE id = ?').get(ambigua) as { slot_id: number };
		const slot = db.prepare('SELECT effective_from, effective_to FROM meal_slots WHERE slot_id = ?').get(row.slot_id);
		expect(slot).toEqual({ effective_from: wk(-4), effective_to: wk(-4) });
	});

	it('los acompañamientos por receta cuelgan de su plato y los de franja de la comida', () => {
		const db = legacyDb();
		config(db, wk(-2), null, 2, [], 1, 1);
		const accPlato1 = plan(db, wk(-1), 1, 1);
		migrateToMealSlots(db);
		const slots = slotsAt(db, wk(-1));
		const mainsIds = slots.filter(s => s.kind === 'main').map(s => s.slot_id);
		const accs = slots.filter(s => s.kind === 'acc');
		expect(accs.map(s => s.parent_slot_id)).toEqual([mainsIds[0], mainsIds[1], null]);
		const row = db.prepare('SELECT slot_id FROM week_plans WHERE id = ?').get(accPlato1) as { slot_id: number };
		expect(row.slot_id).toBe(accs[1].slot_id);
	});

	it('una override de una semana pasada solo crea huecos para esa semana', () => {
		const db = legacyDb();
		config(db, wk(-10), null, 1);
		config(db, wk(-5), wk(-5), 3);
		migrateToMealSlots(db);
		expect(slotsAt(db, wk(-6))).toHaveLength(1);
		expect(slotsAt(db, wk(-5))).toHaveLength(3);
		expect(slotsAt(db, wk(-4))).toHaveLength(1);
		expect(slotsAt(db, wk(-4))[0].slot_id).toBe(slotsAt(db, wk(-6))[0].slot_id);
	});

	it('sin configuración crea los huecos por defecto desde la semana más antigua con datos', () => {
		const db = legacyDb();
		plan(db, wk(-8), 0);
		migrateToMealSlots(db);
		expect(slotsAt(db, wk(-8))).toHaveLength(1);
		expect(slotsAt(db, wk(20))).toHaveLength(1);
		expect(slotsAt(db, wk(-9))).toHaveLength(0);
	});
});
