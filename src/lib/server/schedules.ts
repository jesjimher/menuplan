import { getDb } from '$lib/db/index.js';
import { weekKeyToIndex } from '$lib/utils/dates.js';
import type { Schedule, ScheduleWithRecipe } from '$lib/types/index.js';

function rowToScheduleWithRecipe(s: any, exceptions: string[]): ScheduleWithRecipe {
	return {
		id: s.id,
		recipe_id: s.recipe_id,
		weekday: s.weekday,
		meal_type: s.meal_type,
		slot_index: s.slot_index,
		is_accompaniment: s.is_accompaniment,
		every_n_weeks: s.every_n_weeks,
		anchor_week_key: s.anchor_week_key,
		created_at: s.created_at,
		recipe: {
			id: s.r_id,
			name: s.r_name,
			description: s.r_description,
			tags: s.r_tags,
			min_days: s.r_min_days,
			image_type: s.r_image_type ?? null,
			created_at: s.r_created_at
		},
		exceptions
	};
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
		ORDER BY s.weekday, s.meal_type, s.slot_index
	`).all() as any[];

	return rows.map(s => {
		const exceptions = (db.prepare(
			'SELECT week_key FROM schedule_exceptions WHERE schedule_id = ?'
		).all(s.id) as { week_key: string }[]).map(r => r.week_key);
		return rowToScheduleWithRecipe(s, exceptions);
	});
}

export function getScheduleForSlot(
	weekday: number,
	mealType: string,
	slotIndex: number,
	isAccompaniment: number
): ScheduleWithRecipe | null {
	const db = getDb();
	const s = db.prepare(`
		SELECT s.*,
		       r.id as r_id, r.name as r_name, r.description as r_description,
		       r.tags as r_tags, r.min_days as r_min_days, r.image_type as r_image_type,
		       r.created_at as r_created_at
		FROM schedules s
		JOIN recipes r ON r.id = s.recipe_id
		WHERE s.weekday = ? AND s.meal_type = ? AND s.slot_index = ? AND s.is_accompaniment = ?
	`).get(weekday, mealType, slotIndex, isAccompaniment) as any | undefined;

	if (!s) return null;

	const exceptions = (db.prepare(
		'SELECT week_key FROM schedule_exceptions WHERE schedule_id = ?'
	).all(s.id) as { week_key: string }[]).map(r => r.week_key);

	return rowToScheduleWithRecipe(s, exceptions);
}

export function upsertSchedule(
	recipeId: number,
	weekday: number,
	mealType: string,
	slotIndex: number,
	isAccompaniment: number,
	everyNWeeks: number,
	anchorWeekKey: string
): number {
	const db = getDb();
	const result = db.prepare(`
		INSERT INTO schedules (recipe_id, weekday, meal_type, slot_index, is_accompaniment, every_n_weeks, anchor_week_key)
		VALUES (?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(weekday, meal_type, slot_index, is_accompaniment)
		DO UPDATE SET recipe_id = excluded.recipe_id,
		              every_n_weeks = excluded.every_n_weeks,
		              anchor_week_key = excluded.anchor_week_key
	`).run(recipeId, weekday, mealType, slotIndex, isAccompaniment, everyNWeeks, anchorWeekKey);

	if (result.lastInsertRowid) return result.lastInsertRowid as number;
	// On update, fetch the existing id
	const existing = db.prepare(
		'SELECT id FROM schedules WHERE weekday = ? AND meal_type = ? AND slot_index = ? AND is_accompaniment = ?'
	).get(weekday, mealType, slotIndex, isAccompaniment) as { id: number };
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

export function applySchedulesToWeek(weekKey: string): void {
	const db = getDb();
	const targetIdx = weekKeyToIndex(weekKey);
	const schedules = db.prepare('SELECT * FROM schedules').all() as Schedule[];

	const upsertPlan = db.prepare(`
		INSERT INTO week_plans (week_key, weekday, meal_type, slot_index, is_accompaniment, recipe_id, member_id)
		VALUES (?, ?, ?, ?, ?, ?, NULL)
		ON CONFLICT(week_key, weekday, meal_type, is_accompaniment, slot_index, COALESCE(member_id, -1))
		DO UPDATE SET recipe_id = excluded.recipe_id
		WHERE week_plans.recipe_id IS NULL
	`);

	const checkException = db.prepare(
		'SELECT 1 FROM schedule_exceptions WHERE schedule_id = ? AND week_key = ?'
	);

	for (const sched of schedules) {
		const diff = targetIdx - weekKeyToIndex(sched.anchor_week_key);
		if (diff < 0 || diff % sched.every_n_weeks !== 0) continue;
		if (checkException.get(sched.id, weekKey)) continue;
		upsertPlan.run(weekKey, sched.weekday, sched.meal_type,
			sched.slot_index, sched.is_accompaniment, sched.recipe_id);
	}
}
