import { getDb } from '$lib/db/index.js';
import { weekKeyToIndex } from '$lib/utils/dates.js';
import type { ScheduleWithRecipe, ScheduleConflictMode, MealType } from '$lib/types/index.js';
import { mapRowToRecipe } from './mappers.js';
import Database from 'better-sqlite3';

interface ScheduleRow {
	id: number;
	recipe_id: number;
	weekday: number;
	meal_type: MealType;
	is_accompaniment: number;
	every_n_weeks: number;
	anchor_week_key: string;
	on_conflict: ScheduleConflictMode;
	priority: number;
	created_at: string;
	r_id: number;
	r_name: string;
	r_description: string;
	r_tags: string;
	r_min_days: number;
	r_image_type: string | null;
	r_created_at: string;
}

function loadAllExceptions(db: Database.Database): Map<number, string[]> {
	const rows = db.prepare('SELECT schedule_id, week_key FROM schedule_exceptions').all() as { schedule_id: number; week_key: string }[];
	const map = new Map<number, string[]>();
	for (const r of rows) {
		const list = map.get(r.schedule_id) ?? [];
		list.push(r.week_key);
		map.set(r.schedule_id, list);
	}
	return map;
}

function rowToScheduleWithRecipe(s: ScheduleRow, exceptions: string[]): ScheduleWithRecipe {
	return {
		id: s.id,
		recipe_id: s.recipe_id,
		weekday: s.weekday,
		meal_type: s.meal_type as MealType,
		is_accompaniment: s.is_accompaniment,
		every_n_weeks: s.every_n_weeks,
		anchor_week_key: s.anchor_week_key,
		on_conflict: s.on_conflict ?? 'skip',
		priority: s.priority ?? 5,
		created_at: s.created_at,
		recipe: mapRowToRecipe(s as unknown as Record<string, unknown>, 'r_'),
		exceptions
	};
}

export function getSchedulesPerMeal(): Record<string, ScheduleWithRecipe[]> {
	const all = getAllSchedules();
	const result: Record<string, ScheduleWithRecipe[]> = {};
	for (const s of all) {
		const key = `${s.weekday}-${s.meal_type}-${s.is_accompaniment}`;
		(result[key] ??= []).push(s);
	}
	return result;
}

export function getAllSchedules(): ScheduleWithRecipe[] {
	const db = getDb();
	const rows = db.prepare(`
		SELECT s.*,
		       r.id as r_id, r.name as r_name, r.description as r_description,
		       r.tags as r_tags, r.min_days as r_min_days, r.image_type as r_image_type,
		       r.created_at as r_created_at
		FROM schedules s
		JOIN recipes r ON r.id = s.recipe_id
		ORDER BY s.weekday, s.meal_type, s.priority DESC, s.id
	`).all() as ScheduleRow[];

	const exceptionsMap = loadAllExceptions(db);
	return rows.map(s => rowToScheduleWithRecipe(s, exceptionsMap.get(s.id) ?? []));
}

export function getScheduleForMeal(
	weekday: number,
	mealType: string,
	isAccompaniment: number,
	recipeId?: number
): ScheduleWithRecipe | null {
	const db = getDb();
	const extraFilter = recipeId !== undefined ? ' AND s.recipe_id = ?' : '';
	const params: unknown[] = [weekday, mealType, isAccompaniment];
	if (recipeId !== undefined) params.push(recipeId);

	const s = db.prepare(`
		SELECT s.*,
		       r.id as r_id, r.name as r_name, r.description as r_description,
		       r.tags as r_tags, r.min_days as r_min_days, r.image_type as r_image_type,
		       r.created_at as r_created_at
		FROM schedules s
		JOIN recipes r ON r.id = s.recipe_id
		WHERE s.weekday = ? AND s.meal_type = ? AND s.is_accompaniment = ?${extraFilter}
		ORDER BY s.priority DESC, s.id ASC
		LIMIT 1
	`).get(...params) as ScheduleRow | undefined;

	if (!s) return null;

	const exceptions = (db.prepare(
		'SELECT week_key FROM schedule_exceptions WHERE schedule_id = ?'
	).all(s.id) as { week_key: string }[]).map(r => r.week_key);

	return rowToScheduleWithRecipe(s, exceptions);
}

export function getActiveSchedulesForWeek(weekKey: string): ScheduleWithRecipe[] {
	const db = getDb();
	const targetIdx = weekKeyToIndex(weekKey);

	const rows = db.prepare(`
		SELECT s.*,
		       r.id as r_id, r.name as r_name, r.description as r_description,
		       r.tags as r_tags, r.min_days as r_min_days, r.image_type as r_image_type,
		       r.created_at as r_created_at
		FROM schedules s
		JOIN recipes r ON r.id = s.recipe_id
		ORDER BY s.priority DESC, s.id ASC
	`).all() as ScheduleRow[];

	const exceptionsMap = loadAllExceptions(db);

	return rows.filter(s => {
		const diff = targetIdx - weekKeyToIndex(s.anchor_week_key);
		if (diff < 0 || diff % s.every_n_weeks !== 0) return false;
		const exceptions = exceptionsMap.get(s.id) ?? [];
		return !exceptions.includes(weekKey);
	}).map(s => rowToScheduleWithRecipe(s, exceptionsMap.get(s.id) ?? []));
}

export function upsertSchedule(
	recipeId: number,
	weekday: number,
	mealType: string,
	isAccompaniment: number,
	everyNWeeks: number,
	anchorWeekKey: string,
	onConflict: ScheduleConflictMode,
	priority: number
): number {
	const db = getDb();
	const result = db.prepare(`
		INSERT INTO schedules (recipe_id, weekday, meal_type, is_accompaniment, every_n_weeks, anchor_week_key, on_conflict, priority)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(recipe_id, weekday, meal_type, is_accompaniment)
		DO UPDATE SET every_n_weeks = excluded.every_n_weeks,
		              anchor_week_key = excluded.anchor_week_key,
		              on_conflict = excluded.on_conflict,
		              priority = excluded.priority
	`).run(recipeId, weekday, mealType, isAccompaniment, everyNWeeks, anchorWeekKey, onConflict, priority);

	if (result.lastInsertRowid) return result.lastInsertRowid as number;
	const existing = db.prepare(
		'SELECT id FROM schedules WHERE recipe_id = ? AND weekday = ? AND meal_type = ? AND is_accompaniment = ?'
	).get(recipeId, weekday, mealType, isAccompaniment) as { id: number };
	return existing.id;
}

export function deleteSchedule(scheduleId: number): void {
	getDb().prepare('DELETE FROM schedules WHERE id = ?').run(scheduleId);
}

export function addException(scheduleId: number, weekKey: string): void {
	getDb().prepare(
		'INSERT OR IGNORE INTO schedule_exceptions (schedule_id, week_key) VALUES (?, ?)'
	).run(scheduleId, weekKey);
}

export function removeException(scheduleId: number, weekKey: string): void {
	getDb().prepare(
		'DELETE FROM schedule_exceptions WHERE schedule_id = ? AND week_key = ?'
	).run(scheduleId, weekKey);
}
